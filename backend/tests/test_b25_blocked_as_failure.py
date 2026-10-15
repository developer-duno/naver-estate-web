"""B25 회귀 테스트 — 네이버가 막거나 오류를 낸 회차를 "완료"로 숨기지 않는가 (남은 잡 3곳)

error-propagation.md 5번: 재시도 소진·429·5xx 는 "자료 없음"이 아니다. #732(B23·B24) 가 주간 시세 배치·새 단지 찾기를
고쳤고, 이 파일은 같은 규칙(#732 판정 함수·연속 5개·"못 받은 > 받은" 이면 failed·같은 문장)을 남은 세 곳에서 본다:
  (A) 자주 보는 단지 미리 갱신 crawl_popular_complexes — 자식 crawl_complex_articles 의 목록 1쪽 실패 응답
  (B) 단지 상세 채우기 crawl_complex_details_batch — enrich_complex_detail 의 실패 응답
  (C) 매물 상세 crawl_article_details · 상세 백필 backfill_article_details(_process_detail_batch) — 문자열 오류
곳마다: 정상 · 전부 막힘 · 일부 막힘(completed + 못 받은 수) · 5xx 만(멈추지 않고 비율로 failed) · 연속 5개 중단 ·
404 는 세지 않음 · 사유 문장이 알림(explain_error)·화면(explain_stored_error)에 원문 그대로.

네이버 호출 0 — NaverEstateAPI 는 가짜, 대기는 끔, DB 는 시험 SQLite.
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest

from crawler import service_discover
from crawler.plain_words import UNKNOWN_ERROR_WORDS, explain_error, explain_stored_error
from db.models import Article, Complex, CrawlJob, MonitorAlert
from services.enricher import RATE_LIMIT_EXHAUSTED_ERROR
from services.upsert import build_detail_update_dict as _real_build
from services.upsert import upsert_complex_from_search
from utils import utcnow

# ── 공통 팩토리 ──

OK = "ok"
RL = "429"
F403 = "403"
F503 = "503"
NET = "net"
F404 = "404"
EMPTY = "empty"  # 인기 단지 시험 전용 — 목록 1쪽이 정상인데 0건(활성 매물이 있던 단지라 빈응답 차단기를 센다)
NONE = "none"    # 인기 단지 시험 전용 — 목록 응답 자체가 없음(None)
BAD = "bad"      # 매물 상세 시험 전용 — 네이버 응답은 정상인데 저장이 실패하는 매물

_ERRORS = {
    RL: RATE_LIMIT_EXHAUSTED_ERROR,
    F403: "API 인증 실패 (HTTP 403)",
    F503: "API 요청 실패: 상태 코드 503",
    NET: "데이터 조회 중 오류 발생: Connection reset by peer",
    F404: "API 요청 실패: 상태 코드 404",
}


def _error(kind: str) -> dict:
    return {"error": _ERRORS[kind]}


def _last_job(db, job_type: str) -> CrawlJob:
    db.expire_all()
    return db.query(CrawlJob).filter(CrawlJob.job_type == job_type).order_by(CrawlJob.id.desc()).first()


def _assert_plain(words: str) -> None:
    """사유 문장이 알림·화면 둘 다에 원문 그대로 나간다(plain_words 통과 표지)"""
    assert explain_error(words) == words
    assert explain_error(words) != UNKNOWN_ERROR_WORDS
    assert explain_stored_error(words) == words


# ══ (A) 자주 보는 단지 미리 갱신 ══


def _run_popular(db, monkeypatch, kinds: list[str]):
    """인기 크롤을 한 번 돌리고 (부모 잡, 목록 API 를 부른 단지 번호, 단지 번호 목록) 을 돌려준다"""
    base = utcnow()
    nos = []
    for i, _ in enumerate(kinds):
        no = f"b25p{i:02d}"
        upsert_complex_from_search(db, {
            "complexNo": no, "complexName": f"B25인기{i}", "cortarNo": "1168010100", "realEstateTypeCode": "APT",
        })
        nos.append(no)
    db.commit()
    for no, kind in zip(nos, kinds):
        if kind == EMPTY:  # 빈응답 차단기는 "직전에 활성 매물이 있던 단지" 의 0건만 센다
            db.add(Article(article_no=f"old-{no}", complex_no=no, trade_type_name="매매", is_active=True))
    db.commit()
    for i, no in enumerate(nos):  # 앞 번호일수록 최근 조회 — 선정 순서(last_viewed_at DESC) 고정
        db.query(Complex).filter(Complex.complex_no == no).update(
            {"last_viewed_at": base - timedelta(minutes=i)}, synchronize_session=False,
        )
    db.commit()
    kind_of = dict(zip(nos, kinds))
    seen: list[str] = []

    def _fake(no, page=1):
        seen.append(no)
        if kind_of[no] == OK:
            return {"articleList": [{"articleNo": f"a-{no}", "tradeTypeName": "매매"}], "isMoreData": False}
        if kind_of[no] == EMPTY:
            return {"articleList": [], "isMoreData": False}
        if kind_of[no] == NONE:
            return None
        return _error(kind_of[no])

    monkeypatch.setattr(service_discover._throttle_articles, "wait", lambda *a, **k: None)
    monkeypatch.setattr(service_discover._throttle_detail, "wait", lambda *a, **k: None)
    monkeypatch.setattr(service_discover, "record_call", lambda *a, **k: None)
    with (
        patch("crawler.service_discover.NaverEstateAPI") as api,
        patch("services.enricher.NaverEstateAPI") as detail_api,
    ):
        api.get_complex_articles.side_effect = _fake
        detail_api.get_complex_detail.return_value = None  # 단지 상세 보강은 이 시험 밖(실패해도 자식은 성공)
        service_discover.crawl_popular_complexes(batch_size=50)
    return _last_job(db, "popular_crawl"), seen, nos


def test_A_정상이면_completed_사유_없음(db, monkeypatch):
    job, seen, _ = _run_popular(db, monkeypatch, [OK] * 3)
    assert job.status == "completed"
    assert job.error_message is None
    assert job.processed_items == 3


def test_A_전부_막히면_failed_새_문장(db, monkeypatch):
    job, seen, _ = _run_popular(db, monkeypatch, [F403, NET, F403])
    assert job.status == "failed"
    assert len(seen) == 3
    assert job.error_message == "네이버가 막거나 오류를 내서 3개 단지 중 3개를 못 받았어요(받은 단지 0개보다 많아요)."
    _assert_plain(job.error_message)


def test_A_일부_막혀도_받은_게_많으면_completed_못_받은_수(db, monkeypatch):
    """지금 동작 유지 — completed + "N/M개 단지 실패" 사유"""
    job, _, nos = _run_popular(db, monkeypatch, [OK, OK, F403])
    assert job.status == "completed"
    assert job.processed_items == 2
    assert job.error_message.startswith("1/3개 단지 실패")
    assert nos[2] in job.error_message


def test_A_막힘이_받은_것보다_많으면_끝까지_돌고_failed(db, monkeypatch):
    """옛 코드는 성공이 1개라도 있으면 completed 였다"""
    job, seen, _ = _run_popular(db, monkeypatch, [F403, OK, RL, NET])
    assert job.status == "failed"
    assert len(seen) == 4
    assert job.error_message == "네이버가 막거나 오류를 내서 4개 단지 중 3개를 못 받았어요(받은 단지 1개보다 많아요)."


def test_A_못_받은_수와_받은_수가_같으면_completed(db, monkeypatch):
    """경계 — "못 받은 > 받은" 일 때만 failed"""
    job, _, _ = _run_popular(db, monkeypatch, [OK, F403])
    assert job.status == "completed"
    assert job.error_message.startswith("1/2개 단지 실패")


def test_A_5xx_만이면_멈추지_않고_비율로_failed(db, monkeypatch):
    job, seen, _ = _run_popular(db, monkeypatch, [F503] * 6 + [OK])
    assert job.status == "failed"
    assert len(seen) == 7, "5xx 는 연속에 안 세므로 마지막 단지까지 불러야 한다"
    assert job.error_message == "네이버가 막거나 오류를 내서 7개 단지 중 6개를 못 받았어요(받은 단지 1개보다 많아요)."


def test_A_연속_5개_막히면_남은_단지를_부르지_않는다(db, monkeypatch):
    """전부 429 → 주간 시세 배치(B21) 문장 그대로"""
    job, seen, nos = _run_popular(db, monkeypatch, [OK] + [RL] * 5 + [OK])
    assert job.status == "failed"
    assert nos[6] not in seen
    assert job.error_message == "네이버가 요청이 너무 많다며 거절해 7개 단지 중 1개만 받고 멈췄어요(연속 5개 단지 거절)."
    _assert_plain(job.error_message)


def test_A_5xx_는_연속을_끊지_않는다(db, monkeypatch):
    job, seen, nos = _run_popular(db, monkeypatch, [RL, RL, F503, RL, RL, RL, OK])
    assert job.status == "failed"
    assert nos[6] not in seen
    assert "멈췄어요" in job.error_message


def test_A_404_는_막힘으로_세지_않는다(db, monkeypatch):
    """404 = 그 자료가 없다는 답 — 새 문장이 아니라 옛 사유(성공 0 이라 failed 는 옛 동작 그대로)"""
    job, seen, _ = _run_popular(db, monkeypatch, [F404] * 6)
    assert len(seen) == 6
    assert job.status == "failed"
    assert job.error_message.startswith("전체 6개 단지 실패")


# ══ (B) 단지 상세 채우기 ══


def _run_complex_detail(db, monkeypatch, kinds: list[str]):
    nos = []
    for i, _ in enumerate(kinds):
        no = f"b25d{i:02d}"
        upsert_complex_from_search(db, {
            "complexNo": no, "complexName": f"B25상세{i}", "cortarNo": "1168010100", "realEstateTypeCode": "APT",
        })
        nos.append(no)
    db.commit()
    kind_of = dict(zip(nos, kinds))
    seen: list[str] = []

    def _fake(no):
        seen.append(no)
        if kind_of[no] == OK:
            return {"complexDetail": {"constructionCompanyName": "시험건설"}, "complexPyeongDetailList": []}
        return _error(kind_of[no])

    throttle = MagicMock()
    monkeypatch.setattr(service_discover, "_throttle_detail", throttle)
    # 선정 순서 고정(선정 쿼리는 정렬이 없다)
    monkeypatch.setattr(service_discover, "get_complexes_for_detail_enrich", lambda _db, _t, _n: list(nos))
    with patch("services.enricher.NaverEstateAPI") as api:
        api.get_complex_detail.side_effect = _fake
        service_discover.crawl_complex_details_batch("APT", batch_size=50)
    return _last_job(db, "complex_detail_APT"), seen, nos, throttle


def test_B_정상이면_completed_사유_없음(db, monkeypatch):
    job, _, _, _ = _run_complex_detail(db, monkeypatch, [OK] * 3)
    assert job.status == "completed"
    assert job.error_message is None
    assert job.processed_items == 3


def test_B_전부_막히면_failed_새_문장(db, monkeypatch):
    """옛 코드는 전부 실패해도 completed·사유 없음이었다"""
    job, _, _, _ = _run_complex_detail(db, monkeypatch, [F403] * 3)
    assert job.status == "failed"
    assert job.error_message == "네이버가 막거나 오류를 내서 3개 단지 중 3개를 못 받았어요(받은 단지 0개보다 많아요)."
    _assert_plain(job.error_message)


def test_B_일부_막혀도_받은_게_많으면_completed_못_받은_수(db, monkeypatch):
    job, _, _, _ = _run_complex_detail(db, monkeypatch, [OK, F403, OK])
    assert job.status == "completed"
    assert job.processed_items == 2
    assert job.error_message == "3개 단지 중 1개 상세를 못 받았어요."
    assert explain_stored_error(job.error_message) == job.error_message


def test_B_5xx_만이면_멈추지_않고_비율로_failed(db, monkeypatch):
    job, seen, _, _ = _run_complex_detail(db, monkeypatch, [F503] * 6 + [OK])
    assert job.status == "failed"
    assert len(seen) == 7
    assert job.error_message == "네이버가 막거나 오류를 내서 7개 단지 중 6개를 못 받았어요(받은 단지 1개보다 많아요)."


def test_B_연속_5개_막히면_멈추고_간격은_429_에만(db, monkeypatch):
    job, seen, nos, throttle = _run_complex_detail(db, monkeypatch, [OK, RL, F403, RL, NET, RL, OK])
    assert job.status == "failed"
    assert nos[6] not in seen
    assert job.error_message == "네이버가 막거나 오류를 내서 7개 단지 중 1개만 받고 멈췄어요(연속 5개 단지 실패)."
    assert throttle.on_rate_limit.call_count == 3, "간격 늘리기는 429 일 때만(B20 그대로)"
    _assert_plain(job.error_message)


def test_B_404_는_막힘으로_세지_않는다(db, monkeypatch):
    job, seen, _, _ = _run_complex_detail(db, monkeypatch, [F404] * 6)
    assert len(seen) == 6
    assert job.status == "completed"
    assert job.error_message == "6개 단지 중 6개 상세를 못 받았어요."


# ══ (C) 매물 상세 · 상세 백필 ══

_DETAIL_PATHS = [
    pytest.param("crawl_article_details", False, "article_detail", id="crawl_article_details"),
    pytest.param("backfill_article_details", True, "article_detail_backfill", id="backfill(_process_detail_batch)"),
]


def _run_detail(db, monkeypatch, fn_name: str, backfill: bool, job_type: str, kinds: list[str]):
    now = datetime.now(timezone.utc)
    nos = []
    for i, _ in enumerate(kinds):
        no = f"b25a{i:02d}"
        db.add(Article(
            article_no=no, complex_no="100", trade_type_name="매매", detail_crawled=backfill, is_active=True,
            last_seen_at=now - timedelta(minutes=i), heating_type=None, detail_fail_count=0,
        ))
        nos.append(no)
    db.commit()
    kind_of = dict(zip(nos, kinds))
    seen: list[str] = []

    def _fake(no):
        seen.append(no)
        if kind_of[no] in (OK, BAD):
            return {"articleDetail": {"articleNo": no, "aptHeatMethodTypeName": "개별난방"}}
        return _error(kind_of[no])

    def _build(domain_article, detail_data=None):
        data = _real_build(domain_article, detail_data)
        if kind_of.get(domain_article.article_no) == BAD:
            data["detail_description"] = object()  # DB 드라이버가 거부하는 값 → 그 매물만 저장 실패
        return data

    monkeypatch.setattr(service_discover, "build_detail_update_dict", _build)
    monkeypatch.setattr(service_discover._throttle_details, "wait", lambda *a, **k: None)
    monkeypatch.setattr(service_discover, "record_call", lambda *a, **k: None)
    monkeypatch.setattr(service_discover.NaverEstateAPI, "get_article_detail", staticmethod(_fake))
    getattr(service_discover, fn_name)(batch_size=50)
    job = _last_job(db, job_type)
    fail_counts = {a.article_no: a.detail_fail_count for a in db.query(Article).all()}
    return job, seen, nos, fail_counts


@pytest.mark.parametrize("fn_name, backfill, job_type", _DETAIL_PATHS)
def test_C_정상이면_completed_사유_없음(db, monkeypatch, fn_name, backfill, job_type):
    job, _, _, _ = _run_detail(db, monkeypatch, fn_name, backfill, job_type, [OK] * 3)
    assert job.status == "completed"
    assert job.error_message is None
    assert job.processed_items == 3


@pytest.mark.parametrize("fn_name, backfill, job_type", _DETAIL_PATHS)
def test_C_전부_막히면_failed_새_문장_실패_횟수는_안_올림(db, monkeypatch, fn_name, backfill, job_type):
    job, _, _, fail_counts = _run_detail(db, monkeypatch, fn_name, backfill, job_type, [F403, NET, F403])
    assert job.status == "failed"
    assert job.error_message == "네이버가 막거나 오류를 내서 3개 매물 중 3개를 못 받았어요(받은 매물 0개보다 많아요)."
    assert set(fail_counts.values()) == {0}, "시스템성 오류는 detail_fail_count 를 안 올린다(기존 규칙)"
    _assert_plain(job.error_message)


@pytest.mark.parametrize("fn_name, backfill, job_type", _DETAIL_PATHS)
def test_C_일부_막혀도_받은_게_많으면_completed_못_받은_수(db, monkeypatch, fn_name, backfill, job_type):
    job, _, _, _ = _run_detail(db, monkeypatch, fn_name, backfill, job_type, [OK, RL, OK])
    assert job.status == "completed"
    assert job.processed_items == 2
    assert job.error_message == "네이버가 요청이 너무 많다며 거절해 3개 매물 중 1개를 못 받았어요."
    _assert_plain(job.error_message)


@pytest.mark.parametrize("fn_name, backfill, job_type", _DETAIL_PATHS)
def test_C_5xx_만이면_멈추지_않고_비율로_failed(db, monkeypatch, fn_name, backfill, job_type):
    job, seen, _, _ = _run_detail(db, monkeypatch, fn_name, backfill, job_type, [F503] * 6 + [OK])
    assert job.status == "failed"
    assert len(seen) == 7
    assert job.error_message == "네이버가 막거나 오류를 내서 7개 매물 중 6개를 못 받았어요(받은 매물 1개보다 많아요)."


@pytest.mark.parametrize("fn_name, backfill, job_type", _DETAIL_PATHS)
def test_C_연속_5개_막히면_남은_매물을_부르지_않는다(db, monkeypatch, fn_name, backfill, job_type):
    job, seen, nos, _ = _run_detail(db, monkeypatch, fn_name, backfill, job_type, [OK] + [RL] * 5 + [OK])
    assert job.status == "failed"
    assert nos[6] not in seen
    assert job.error_message == "네이버가 요청이 너무 많다며 거절해 7개 매물 중 1개만 받고 멈췄어요(연속 5개 매물 거절)."
    _assert_plain(job.error_message)


@pytest.mark.parametrize("fn_name, backfill, job_type", _DETAIL_PATHS)
def test_C_성공이_끼면_연속_수가_0으로(db, monkeypatch, fn_name, backfill, job_type):
    """막힘 3 · 성공 · 막힘 3 · 성공 6 → 연속 최장 3 이라 멈추지 않고, 받은 7 > 못 받은 6 이라 completed"""
    kinds = [RL] * 3 + [OK] + [RL] * 3 + [OK] * 6
    job, seen, _, _ = _run_detail(db, monkeypatch, fn_name, backfill, job_type, kinds)
    assert len(seen) == len(kinds)
    assert job.status == "completed"
    assert job.error_message == "네이버가 요청이 너무 많다며 거절해 13개 매물 중 6개를 못 받았어요."


@pytest.mark.parametrize("fn_name, backfill, job_type", _DETAIL_PATHS)
def test_C_404_는_막힘으로_세지_않는다(db, monkeypatch, fn_name, backfill, job_type):
    job, seen, _, _ = _run_detail(db, monkeypatch, fn_name, backfill, job_type, [F404] * 6)
    assert len(seen) == 6
    assert job.status == "completed"
    assert job.error_message is None


# ── 사유 문장 — 영문·`|` 가 붙으면 원문 그대로 통과하지 않는다 ──


def test_사유_문장에_영문이_붙으면_통과하지_않는다():
    tally = service_discover._NaverBlockTally()
    tally.on_failure(_error(F403))
    words = tally.failed_words(3, 0, "매물")
    _assert_plain(words)
    assert explain_error(words + " API 인증 실패 (HTTP 403)") != words + " API 인증 실패 (HTTP 403)"


# ── 매물 상세 채우기 실패 알림은 "연속 두 회차 실패"일 때만 (사장님 결정 2026-10-15) ──


def _detail_run(db, job_type: str, status: str, minutes_ago: float) -> None:
    ts = utcnow() - timedelta(minutes=minutes_ago)
    db.add(CrawlJob(
        job_type=job_type, status=status,
        error_message="네이버가 막거나 오류를 내서 3개 매물 중 3개를 못 받았어요(받은 매물 0개보다 많아요)."
        if status == "failed" else None,
        started_at=ts, completed_at=ts, created_at=ts,
    ))
    db.commit()


def _alert_keys(db) -> list[str]:
    from crawler.monitor import detect_issues
    return [i["alert_key"] for i in detect_issues(db)]


def test_알림_매물_상세_한_회차_실패는_알리지_않는다(db):
    from crawler.monitor import run_monitor

    _detail_run(db, "article_detail", "completed", 60)
    _detail_run(db, "article_detail", "failed", 5)
    assert "crawl_failed:article_detail" not in _alert_keys(db)
    with patch("crawler.monitor.send_telegram", return_value=True):
        run_monitor(db)
    db.expire_all()
    assert db.query(MonitorAlert).filter(MonitorAlert.alert_key == "crawl_failed:article_detail").count() == 0


def test_알림_매물_상세_두_회차_연속_실패면_알린다(db):
    _detail_run(db, "article_detail", "failed", 35)
    _detail_run(db, "article_detail", "failed", 5)
    assert "crawl_failed:article_detail" in _alert_keys(db)


def test_알림_상세_백필은_한_회차_실패로_바로_알린다(db):
    """문턱 2 는 매물 상세 채우기만 — 상세 백필은 옛 그대로 1"""
    _detail_run(db, "article_detail_backfill", "failed", 5)
    assert "crawl_failed:article_detail_backfill" in _alert_keys(db)


# ── 검사관 보완 (B25 2차) ──


def test_A_대상_0건이면_completed_사유_없음(db, monkeypatch):
    job, seen, _ = _run_popular(db, monkeypatch, [])
    assert seen == []
    assert job.status == "completed"
    assert job.error_message is None


def test_B_대상_0건이면_completed_사유_없음(db, monkeypatch):
    job, seen, _, _ = _run_complex_detail(db, monkeypatch, [])
    assert seen == []
    assert job.status == "completed"
    assert job.error_message is None


@pytest.mark.parametrize("fn_name, backfill, job_type", _DETAIL_PATHS)
def test_C_대상_0건이면_completed_사유_없음(db, monkeypatch, fn_name, backfill, job_type):
    job, seen, _, _ = _run_detail(db, monkeypatch, fn_name, backfill, job_type, [])
    assert seen == []
    assert job.status == "completed"
    assert job.error_message is None


def test_A_응답_없음은_막힘으로_세지_않는다(db, monkeypatch):
    """목록 응답이 None(빈 응답) ×6 → 네이버 막힘이 아니라 옛 사유 "전체 6개 단지 실패" 그대로, 끝까지 부른다"""
    job, seen, _ = _run_popular(db, monkeypatch, [NONE] * 6)
    assert len(seen) == 6
    assert job.status == "failed"
    assert job.error_message.startswith("전체 6개 단지 실패")
    assert not job.error_message.startswith("네이버가")


def test_A_빈응답_중단과_못_받은_수가_겹치면_한_문장(db, monkeypatch):
    """빈응답 5회로 멈췄고 못 받은 단지(8)가 받은 단지(빈응답 5)보다 많다 → failed, `|` 없이 괄호 한 번·마침표 하나"""
    kinds = [EMPTY] + [F403] * 4 + [EMPTY] + [F403] * 4 + [EMPTY] * 3 + [OK]
    job, seen, nos = _run_popular(db, monkeypatch, kinds)
    assert nos[13] not in seen, "빈응답 5회째에서 멈췄어야 한다"
    assert job.status == "failed"
    assert job.error_message == (
        "네이버가 막거나 오류를 내서 14개 단지 중 8개를 못 받았어요(받은 단지 5개보다 많아요),"
        " 그리고 빈 응답이 5번 이어져 회차를 멈췄어요."
    )
    assert "|" not in job.error_message
    assert job.error_message.count("(") == 1
    assert job.error_message.count(".") == 1
    _assert_plain(job.error_message)


@pytest.mark.parametrize("fn_name, backfill, job_type", _DETAIL_PATHS)
def test_C_막힘과_저장_실패가_섞이면_한_문장(db, monkeypatch, fn_name, backfill, job_type):
    """저장 실패 1 + 막힘 2 → failed, 두 사유를 문장 중간 마침표 없이 잇는다"""
    job, _, _, _ = _run_detail(db, monkeypatch, fn_name, backfill, job_type, [BAD, F403, F403])
    assert job.status == "failed"
    assert job.error_message == (
        "네이버가 막거나 오류를 내서 3개 매물 중 2개를 못 받았어요(받은 매물 0개보다 많아요),"
        " 그리고 상세 저장 실패 1건 — 그 매물만 건너뛰고 다음 매물로 넘어갔어요."
    )
    assert job.error_message.count(".") == 1
    _assert_plain(job.error_message)


@pytest.mark.parametrize("fn_name, backfill, job_type", _DETAIL_PATHS)
def test_C_일부_막힘과_저장_실패가_섞인_completed_도_한_문장(db, monkeypatch, fn_name, backfill, job_type):
    job, _, _, _ = _run_detail(db, monkeypatch, fn_name, backfill, job_type, [OK, OK, BAD, RL])
    assert job.status == "completed"
    assert job.error_message == (
        "네이버가 요청이 너무 많다며 거절해 4개 매물 중 1개를 못 받았어요,"
        " 그리고 상세 저장 실패 1건 — 그 매물만 건너뛰고 다음 매물로 넘어갔어요."
    )
    assert job.error_message.count(".") == 1
