"""B26 회귀 테스트 — 적은 실패는 완료+사유 · '받은 수' 셈법 · 매물 배치 회차 행 · 매물 상세 429 간격

(A) 못 받은 대상이 1~2개뿐이면 비율 규칙(못 받은 > 받은)을 적용하지 않고 completed + 사유
    (사장님 결정 2026-10-17 "1~2곳 실패는 '완료+사유'"). 연속 5개로 멈춘 회차는 그대로 failed.
(B) 매물 상세의 "받은 수" = 저장 성공 + 지워진 매물 + 매물 단위 오류 (네이버가 정상으로 답한 수).
    사유 문장의 "받은 매물 N개" 숫자는 지금처럼 저장 성공 수.
(C) 매물 수집 배치(crawl_articles_batch, 01·13시)가 회차 부모 행(articles_batch)을 남기고
    인기 단지 회차와 같은 규칙으로 판정한다. 건너뛴 단지(캐시·이미 크롤 중)는 어디에도 안 센다.
(D) 매물 상세·상세 백필 루프가 429 소진 응답에 공용 간격(_throttle_details)을 늘리고, 성공은 알린다.

네이버 호출 0 — NaverEstateAPI 는 가짜, 대기는 끔, DB 는 시험 SQLite.
"""

from unittest.mock import MagicMock, patch

import pytest

from crawler import service_discover
from crawler.plain_words import JOB_WORDS
from db.models import Complex, CrawlJob
from services.upsert import upsert_complex_from_search
from tests import test_b25_blocked_as_failure as b25
from tests.test_b25_blocked_as_failure import F403, F503, NET, OK, RL, _assert_plain, _error, _last_job

DEAD = "dead"   # 네이버에서 지워진 매물(진짜 dead) — 정상 응답
AERR = "aerr"   # 매물 단위 오류 dict — 정상 응답이지만 그 매물 문제

_DETAIL_PATHS = b25._DETAIL_PATHS


@pytest.fixture
def detail_kinds(monkeypatch):
    """b25 _run_detail 의 가짜 응답에 dead·매물 단위 오류 두 종류를 더한다"""
    monkeypatch.setitem(b25._ERRORS, DEAD, {"code": "errorCode.NotExistInformation", "message": "매물 없음"})
    monkeypatch.setitem(b25._ERRORS, AERR, {"code": "ERROR", "message": "알수없는 오류(시스템 오류)"})


def _tally(*kinds: str) -> service_discover._NaverBlockTally:
    tally = service_discover._NaverBlockTally()
    for kind in kinds:
        if kind == OK:
            tally.on_success()
        else:
            tally.on_failure(_error(kind))
    return tally


# ══ (A) 못 받은 1~2개는 completed + 사유 ══


def test_A_클래스_못_받은_1_받은_0_이면_completed_사유():
    tally = _tally(F403)
    assert not tally.is_failed(0)
    assert tally.partial_words(1, "단지") == "네이버가 막거나 오류를 내서 1개 단지 중 1개를 못 받았어요."


def test_A_클래스_못_받은_2_받은_0_이면_completed():
    tally = _tally(RL, RL)
    assert not tally.is_failed(0)
    assert tally.partial_words(2, "매물") == "네이버가 요청이 너무 많다며 거절해 2개 매물 중 2개를 못 받았어요."


def test_A_클래스_못_받은_3_받은_2_이면_failed():
    """문턱(2)을 넘고 받은 수보다 많으면 지금처럼 failed"""
    assert _tally(F403, F403, F403).is_failed(2)
    assert not _tally(F403, F403, F403).is_failed(3), "같으면 completed(옛 경계 그대로)"


def test_A_클래스_연속_5개면_문턱과_무관하게_failed():
    tally = _tally(RL, RL, RL, RL, RL)
    assert tally.aborted
    assert tally.unreceived == 5
    assert tally.is_failed(100)


def test_A_인기_단지_1곳_막힘_받은_0_이면_completed_사유(db, monkeypatch):
    """옛 코드는 '전체 1개 단지 실패' failed — 네이버 막힘 1곳뿐이면 completed + 사유"""
    job, seen, nos = b25._run_popular(db, monkeypatch, [F403])
    assert job.status == "completed"
    assert job.error_message.startswith("1/1개 단지 실패")
    assert nos[0] in job.error_message


@pytest.mark.parametrize("fn_name, backfill, job_type", _DETAIL_PATHS)
def test_A_매물_상세_2개_막힘만이면_completed_사유(db, monkeypatch, fn_name, backfill, job_type):
    job, _, _, _ = b25._run_detail(db, monkeypatch, fn_name, backfill, job_type, [F403, NET])
    assert job.status == "completed"
    assert job.error_message == "네이버가 막거나 오류를 내서 2개 매물 중 2개를 못 받았어요."
    _assert_plain(job.error_message)


@pytest.mark.parametrize("fn_name, backfill, job_type", _DETAIL_PATHS)
def test_A_매물_상세_3개_막힘이면_failed(db, monkeypatch, fn_name, backfill, job_type):
    job, _, _, _ = b25._run_detail(db, monkeypatch, fn_name, backfill, job_type, [F403, NET, F503])
    assert job.status == "failed"


# ══ (B) 받은 수 = 저장 성공 + 지워진 매물 + 매물 단위 오류 ══


@pytest.mark.parametrize("fn_name, backfill, job_type", _DETAIL_PATHS)
def test_B_지워진_매물과_매물_오류가_받은_수에_들어가_completed(
    db, monkeypatch, detail_kinds, fn_name, backfill, job_type,
):
    """막힘 3 · 지워진 2 · 매물 오류 2 → 받은 4 > 못 받은 3 → completed (옛 셈법은 받은 0 이라 failed)"""
    kinds = [F403, DEAD, F403, AERR, F403, DEAD, AERR]
    job, seen, _, _ = b25._run_detail(db, monkeypatch, fn_name, backfill, job_type, kinds)
    assert len(seen) == 7
    assert job.status == "completed"
    assert job.processed_items == 0
    assert job.error_message == "네이버가 막거나 오류를 내서 7개 매물 중 3개를 못 받았어요."


@pytest.mark.parametrize("fn_name, backfill, job_type", _DETAIL_PATHS)
def test_B_더해도_못_받은_수가_많으면_failed_문장_숫자는_저장_성공_수(
    db, monkeypatch, detail_kinds, fn_name, backfill, job_type,
):
    """막힘 4 · 지워진 1 · 매물 오류 1 · 성공 1 → 받은 3 < 못 받은 4 → failed, 문장의 '받은 매물'은 저장 성공 1"""
    kinds = [F403, DEAD, F403, OK, F403, AERR, F403]
    job, _, _, _ = b25._run_detail(db, monkeypatch, fn_name, backfill, job_type, kinds)
    assert job.status == "failed"
    assert job.error_message == "네이버가 막거나 오류를 내서 7개 매물 중 4개를 못 받았어요(받은 매물 1개보다 많아요)."
    _assert_plain(job.error_message)


# ══ (C) 매물 수집 배치 회차 행 ══


def _run_batch(
    db, monkeypatch, kinds: list[str], *, cached: int = 0, busy: int = 0, scheduler_job_id="crawl_articles",
    record_round: bool = True,
):
    """매물 배치를 한 번 돌리고 (부모 잡, 목록 API 를 부른 단지 번호, 단지 번호 목록) 을 돌려준다.

    kinds 앞에 cached 개(캐시 히트로 건너뜀) · busy 개(이미 크롤 중이라 건너뜀) 단지를 더 둔다.
    """
    from routers.live._shared import _cache, _crawl_status, release_complex, try_acquire_complex

    all_kinds = ["cached"] * cached + ["busy"] * busy + list(kinds)
    nos = []
    for i, _ in enumerate(all_kinds):
        no = f"b26b{i:02d}"
        upsert_complex_from_search(db, {
            "complexNo": no, "complexName": f"B26배치{i}", "cortarNo": "1168010100", "realEstateTypeCode": "APT",
        })
        nos.append(no)
        _cache.delete(f"crawl_done:{no}")
        _crawl_status.pop(no, None)
    db.commit()
    kind_of = dict(zip(nos, all_kinds))
    seen: list[str] = []

    def _fake(no, page=1):
        seen.append(no)
        if kind_of[no] == OK:
            return {"articleList": [{"articleNo": f"a-{no}", "tradeTypeName": "매매"}], "isMoreData": False}
        return _error(kind_of[no])

    for no, kind in kind_of.items():
        if kind == "cached":
            _cache.set(f"crawl_done:{no}", True)
    busy_nos = [no for no, kind in kind_of.items() if kind == "busy"]
    for no in busy_nos:
        assert try_acquire_complex(no)

    monkeypatch.setattr(
        service_discover, "get_complexes_for_article_crawl",
        lambda _db, _n: _db.query(Complex).filter(Complex.complex_no.in_(nos)).order_by(Complex.complex_no).all(),
    )
    monkeypatch.setattr(service_discover._throttle_articles, "wait", lambda *a, **k: None)
    monkeypatch.setattr(service_discover._throttle_detail, "wait", lambda *a, **k: None)
    monkeypatch.setattr(service_discover, "record_call", lambda *a, **k: None)
    try:
        with (
            patch("crawler.service_discover.NaverEstateAPI") as api,
            patch("services.enricher.NaverEstateAPI") as detail_api,
        ):
            api.get_complex_articles.side_effect = _fake
            detail_api.get_complex_detail.return_value = None
            service_discover.crawl_articles_batch(
                batch_size=50, scheduler_job_id=scheduler_job_id, record_round=record_round,
            )
    finally:
        for no in busy_nos:
            release_complex(no)
        for no in nos:
            _cache.delete(f"crawl_done:{no}")
    return _last_job(db, service_discover.ARTICLES_BATCH_JOB_TYPE), seen, nos


def test_C_부모_행이_생기고_정상이면_completed(db, monkeypatch):
    job, seen, nos = _run_batch(db, monkeypatch, [OK] * 3)
    assert job is not None
    assert job.status == "completed"
    assert job.error_message is None
    assert job.scheduler_job_id == "crawl_articles"
    assert (job.total_items, job.processed_items) == (3, 3)
    assert job.completed_at is not None
    children = db.query(CrawlJob).filter(CrawlJob.job_type == "complex_articles").count()
    assert children == 3, "자식(단지별) 행은 그대로 남는다"


def test_C_자식_다수가_막히면_부모_failed_사유(db, monkeypatch):
    job, seen, _ = _run_batch(db, monkeypatch, [F403, OK, NET, RL])
    assert job.status == "failed"
    assert len(seen) == 4
    assert job.error_message == "네이버가 막거나 오류를 내서 4개 단지 중 3개를 못 받았어요(받은 단지 1개보다 많아요)."
    _assert_plain(job.error_message)


def test_C_연속_5개_막히면_남은_단지를_부르지_않는다(db, monkeypatch):
    job, seen, nos = _run_batch(db, monkeypatch, [OK] + [RL] * 5 + [OK])
    assert job.status == "failed"
    assert nos[6] not in seen
    assert job.error_message == "네이버가 요청이 너무 많다며 거절해 7개 단지 중 1개만 받고 멈췄어요(연속 5개 단지 거절)."


def test_C_건너뛴_단지는_받은_수로_세지_않는다(db, monkeypatch):
    """캐시 2 · 크롤 중 1 건너뜀 + 막힘 3 → 받은 0 < 못 받은 3 → failed (건너뜀이 받은 수였다면 completed)"""
    job, seen, nos = _run_batch(db, monkeypatch, [F403, F403, F403], cached=2, busy=1)
    assert seen == nos[3:], "건너뛴 단지는 네이버를 부르지 않는다"
    assert job.status == "failed"
    assert job.total_items == 6
    assert job.processed_items == 0


def test_C_건너뛴_단지는_실패로도_세지_않는다(db, monkeypatch):
    """캐시 3 건너뜀 + 정상 1 → completed, 사유 없음"""
    job, seen, nos = _run_batch(db, monkeypatch, [OK], cached=3)
    assert seen == nos[3:]
    assert job.status == "completed"
    assert job.error_message is None
    assert job.processed_items == 1


def test_C_예외면_부모_failed_로_적고_다시_던진다(db, monkeypatch):
    """관리자 일괄 재크롤 wrapper·잡 에러 리스너가 보는 예외는 옛 동작대로 밖으로 나간다"""
    def _boom(_db, _n):
        raise RuntimeError("선정 실패")

    monkeypatch.setattr(service_discover, "get_complexes_for_article_crawl", _boom)
    with pytest.raises(RuntimeError):
        service_discover.crawl_articles_batch(batch_size=5, scheduler_job_id="crawl_articles")
    job = _last_job(db, service_discover.ARTICLES_BATCH_JOB_TYPE)
    assert job.status == "failed"
    assert "선정 실패" in job.error_message


def test_C_성공_0_이고_막힘이_아닌_실패면_failed(db, monkeypatch):
    """404(그 자료 없음)만으로 성공 0 → 네이버 막힘이 아니라 '전체 실패' 갈래 failed"""
    job, seen, nos = _run_batch(db, monkeypatch, [b25.F404, b25.F404])
    assert job.status == "failed"
    assert job.error_message.startswith("전체 2개 단지 실패")
    assert nos[0] in job.error_message


def test_C_성공_0_이어도_막힘_1곳뿐이면_completed_사유(db, monkeypatch):
    """네이버 막힘 1곳·성공 0 → '전체 실패' 갈래로 가지 않고 completed + 사유(B26)"""
    job, _, nos = _run_batch(db, monkeypatch, [F403])
    assert job.status == "completed"
    assert job.error_message.startswith("1/1개 단지 실패")
    assert nos[0] in job.error_message


def test_C_관리자_일괄_재크롤_경로는_회차_행도_연속_중단도_없다(db, monkeypatch):
    """record_round=False — 부모는 bulk_recrawl 이 따로 만든다. 옛 동작 그대로 끝까지 돈다(연속 5개 막혀도)"""
    job, seen, nos = _run_batch(db, monkeypatch, [RL] * 6, scheduler_job_id="admin_recrawl", record_round=False)
    assert job is None, "관리자 경로에선 articles_batch 행이 0개"
    assert seen == nos, "연속 막힘 중단은 회차 행이 있는 스케줄러 경로에만"
    children = db.query(CrawlJob).filter(CrawlJob.job_type == "complex_articles").count()
    assert children == 6


def test_C_관리자_wrapper_는_record_round_False_로_부른다(monkeypatch):
    from routers.admin import recrawl

    calls = []
    monkeypatch.setattr(service_discover, "crawl_articles_batch", lambda **kw: calls.append(kw))
    recrawl._run_batch_wrapped(batch_size=3, parent_job_id=-1)  # 부모 -1 = 없음 → 마감은 건너뛴다
    assert calls and calls[0]["record_round"] is False
    assert calls[0]["scheduler_job_id"] == "admin_recrawl"


def test_C_새_job_type_이_알림_사전과_신선도_제외_목록에_있다():
    from routers.admin.freshness import _ROUND_PARENT_JOB_TYPES

    assert service_discover.ARTICLES_BATCH_JOB_TYPE == "articles_batch"
    assert service_discover.ARTICLES_BATCH_JOB_TYPE in JOB_WORDS
    assert service_discover.ARTICLES_BATCH_JOB_TYPE in _ROUND_PARENT_JOB_TYPES


# ══ (D) 매물 상세 429 소진 → 공용 간격 늘리기 ══


def _detail_with_fake_throttle(db, monkeypatch, fn_name, backfill, job_type, kinds):
    throttle = MagicMock()
    monkeypatch.setattr(service_discover, "_throttle_details", throttle)
    b25._run_detail(db, monkeypatch, fn_name, backfill, job_type, kinds)
    return throttle


@pytest.mark.parametrize("fn_name, backfill, job_type", _DETAIL_PATHS)
def test_D_429_소진이면_간격을_늘리고_성공은_알린다(db, monkeypatch, fn_name, backfill, job_type):
    throttle = _detail_with_fake_throttle(db, monkeypatch, fn_name, backfill, job_type, [RL, OK, OK])
    assert throttle.on_rate_limit.call_count == 1
    assert throttle.on_success.call_count == 2


@pytest.mark.parametrize("fn_name, backfill, job_type", _DETAIL_PATHS)
def test_D_다른_오류에는_간격을_늘리지_않는다(db, monkeypatch, fn_name, backfill, job_type):
    throttle = _detail_with_fake_throttle(db, monkeypatch, fn_name, backfill, job_type, [F403, F503, NET])
    throttle.on_rate_limit.assert_not_called()
    throttle.on_success.assert_not_called()
