"""B23·B24 회귀 테스트 — 네이버가 막거나 오류를 낸 날을 "완료"로 숨기지 않는가

error-propagation.md 5번: 재시도 소진·429·5xx 는 "자료 없음"이 아니다.

B24 (주간 시세 배치 collect_price_history) — B21 은 429 소진만 "못 받은 단지"로 셌다. 네이버가 403·5xx·네트워크
오류로 막으면 여전히 completed(처리 0) 였다. 이 파일이 확인하는 것:
  (가) 403·5xx·네트워크 오류가 섞여 연속 5개면 멈추고 failed + 새 문장("네이버가 막거나 오류를 내서")
  (나) 못 받은 단지가 전부 429 면 B21 문장 그대로
  (다) 404 만이면 completed(그 자료가 없다는 답이라 세지 않는다) · 429 와 섞여도 새 문장으로 바꾸지 않는다
  (라) 연속 5개는 안 되지만 막힘·오류 단지가 더 많으면 끝까지 돌고 failed + 새 문장
  (마) 간격 늘리기(on_rate_limit)는 429 일 때만 — 403 에는 늘리지 않는다
  (바) 판정 함수가 머리 기준으로 가른다
  + 새 문장이 알림(explain_error)·화면(explain_stored_error)에 원문 그대로, 영문이 붙으면 막힌다

네이버 호출 0 — NaverEstateAPI 는 가짜, throttle 은 MagicMock(대기 없음), DB 는 시험 SQLite.
"""

from datetime import timedelta
from unittest.mock import MagicMock, patch

import pytest

from db.models import Complex, CrawlJob
from services.enricher import RATE_LIMIT_EXHAUSTED_ERROR
from utils import utcnow

# ── 팩토리 함수 (B24) ──

OK = "ok"
RL = "429"
F403 = "403"
F503 = "503"
NET = "net"
F404 = "404"
RL_404 = "429+404"   # A1 429 소진 · B1 404 → 못 받은 단지(429 로만 셈)

_ERRORS = {
    RL: RATE_LIMIT_EXHAUSTED_ERROR,
    F403: "API 인증 실패 (HTTP 403)",
    F503: "API 요청 실패: 상태 코드 503",
    NET: "데이터 조회 중 오류 발생: Connection reset by peer",
    F404: "API 요청 실패: 상태 코드 404",
}


def _price_response(kind: str, trade_type: str) -> dict:
    if kind == OK:
        return {"marketPrices": []}
    if kind == RL_404:
        return {"error": _ERRORS[RL] if trade_type == "A1" else _ERRORS[F404]}
    return {"error": _ERRORS[kind]}


def _run_price(db, kinds: list[str]):
    """주간 시세 배치를 한 번 돌리고 (새 잡, 호출된 단지 번호 목록, 단지 번호 목록, throttle) 을 돌려준다"""
    base = utcnow()
    nos = []
    for i, _ in enumerate(kinds):
        no = f"b24c{i:02d}"
        db.add(Complex(complex_no=no, complex_name=f"B24단지{i}", last_crawled_at=base - timedelta(minutes=i)))
        nos.append(no)
    db.commit()
    kind_of = dict(zip(nos, kinds))
    seen: list[str] = []

    def _fake(no, trade_type=None, **kwargs):
        seen.append(no)
        return _price_response(kind_of[no], trade_type)

    throttle = MagicMock()
    with (
        patch("crawler.service_price._throttle", throttle),
        patch("crawler.service_price.NaverEstateAPI.get_complex_prices", side_effect=_fake),
    ):
        from crawler.service_price import collect_price_history
        collect_price_history(batch_size=50, scheduler_job_id="collect_prices")

    db.expire_all()
    job = db.query(CrawlJob).filter(CrawlJob.job_type == "price_history").order_by(CrawlJob.id.desc()).first()
    return job, seen, nos, throttle


# ── (가) 403·5xx·네트워크 섞여 연속 5 → 중단 + 새 문장 ──


@pytest.mark.parametrize("bad", [F403, NET], ids=["403", "네트워크"])
def test_B24_가_막힘_오류가_섞여_연속_5개면_멈추고_새_문장(db, bad):
    """C0 성공 → 429·bad 섞어 5개 연속 실패 → 중단. 마지막 단지는 부르지 않는다"""
    job, seen, nos, _ = _run_price(db, [OK, RL, bad, RL, bad, RL, OK])

    assert job.status == "failed"
    assert nos[6] not in seen
    assert job.processed_items == 1
    assert job.error_message == "네이버가 막거나 오류를 내서 7개 단지 중 1개만 받고 멈췄어요(연속 5개 단지 실패)."


@pytest.mark.parametrize("bad", [F403, NET], ids=["403", "네트워크"])
def test_B24_가_429_없이_막힘만_연속_5개여도_멈춘다(db, bad):
    job, seen, nos, _ = _run_price(db, [bad] * 5 + [OK])

    assert job.status == "failed"
    assert nos[5] not in seen
    assert job.error_message == "네이버가 막거나 오류를 내서 6개 단지 중 하나도 못 받고 멈췄어요(연속 5개 단지 실패)."


# ── (나) 전부 429 → B21 문장 그대로 ──


def test_B24_나_전부_429면_옛_문장_그대로(db):
    from crawler.service_price import _rate_limited_words

    job, _, _, _ = _run_price(db, [OK] + [RL] * 5 + [OK])

    assert job.status == "failed"
    assert job.error_message == _rate_limited_words(7, 5, 1, True)
    assert job.error_message.startswith("네이버가 요청이 너무 많다며 거절해")
    assert "연속 5개 단지 거절" in job.error_message


# ── (다) 404 는 세지 않는다 ──


def test_B24_다_404만이면_completed(db):
    job, seen, _, _ = _run_price(db, [F404] * 7)

    assert job.status == "completed"
    assert job.error_message is None
    assert job.processed_items == 0
    assert len(seen) == 14


def test_B24_다_429와_404가_섞인_단지는_옛_문장(db):
    """A1 429·B1 404 단지 5개 연속 → 429 로만 세어 중단, 404 때문에 새 문장으로 바뀌지 않는다"""
    job, _, _, _ = _run_price(db, [RL_404] * 5 + [OK])

    assert job.status == "failed"
    assert job.error_message.startswith("네이버가 요청이 너무 많다며 거절해")


# ── (라) 끝까지 돌았지만 막힘·오류 단지가 더 많음 → failed + 새 문장 ──


def test_B24_라_막힘_오류가_더_많으면_끝까지_돌고_새_문장(db):
    kinds = [F403, F503, OK, RL, NET, OK, F403]   # 실패 5 · 성공 2 · 최장 연속 2
    job, seen, _, _ = _run_price(db, kinds)

    assert job.status == "failed"
    assert len(seen) == len(kinds) * 2
    assert job.error_message == "네이버가 막거나 오류를 내서 7개 단지 중 5개를 못 받았어요(받은 단지 2개보다 많아요)."


# ── (마) 간격 늘리기는 429 일 때만 ──


def test_B24_마_403에는_간격을_늘리지_않는다(db):
    _, _, _, throttle = _run_price(db, [F403] * 3 + [OK] * 3)
    throttle.on_rate_limit.assert_not_called()


# ── (바) 판정 함수 ──


@pytest.mark.parametrize(
    "result, blocked, server",
    [
        ({"error": RATE_LIMIT_EXHAUSTED_ERROR}, True, False),
        ({"error": "API 인증 실패 (HTTP 401)"}, True, False),
        ({"error": "API 인증 실패 (HTTP 403)"}, True, False),
        ({"error": "데이터 조회 중 오류 발생: timed out"}, True, False),
        ({"error": "API 요청 실패: 상태 코드 500"}, False, True),
        ({"error": "API 요청 실패: 상태 코드 502"}, False, True),
        ({"error": "API 요청 실패: 상태 코드 520"}, False, True),
        ({"error": "API 요청 실패: 상태 코드 599"}, False, True),
        ({"error": "API 요청 실패: 상태 코드 404"}, False, False),
        ({"error": "API 요청 실패: 상태 코드 400"}, False, False),
        ({"error": "다른 오류"}, False, False),
        ({"error": {"code": "x"}}, False, False),
        ({"marketPrices": []}, False, False),
        (None, False, False),
        ({}, False, False),
    ],
)
def test_B24_바_막힘_서버오류_판정(result, blocked, server):
    """막힘(연속에도 셈)과 5xx(비율에만 셈)를 머리 기준으로 가른다"""
    from crawler.service_price import _is_blocked_error, is_naver_server_error

    assert _is_blocked_error(result) is blocked
    assert is_naver_server_error(result) is server


# ── (사) 5xx 는 연속 수에 넣지 않고 비율에만 ──


def test_B24_사_5xx_만_연속_5개면_멈추지_않고_비율로_failed(db):
    """5xx 는 재시도 없이 바로 돌아와 잠깐 흔들려도 연속이 찬다 → 끝까지 돌고 비율로 판정"""
    job, seen, nos, _ = _run_price(db, [F503] * 5 + [OK])

    assert job.status == "failed"
    assert len(seen) == 12, "중단 없이 마지막 단지까지 불렀어야 한다"
    assert job.error_message == "네이버가 막거나 오류를 내서 6개 단지 중 5개를 못 받았어요(받은 단지 1개보다 많아요)."


def test_B24_사_5xx_가_끼어도_막힘_연속은_이어져_멈춘다(db):
    """429×2 → 5xx → 429×3 : 5xx 는 연속을 끊지 않아(성공이 아니므로) 6번째 단지에서 멈춘다"""
    job, seen, nos, _ = _run_price(db, [RL, RL, F503, RL, RL, RL, OK])

    assert job.status == "failed"
    assert nos[6] not in seen
    assert job.error_message == "네이버가 막거나 오류를 내서 7개 단지 중 하나도 못 받고 멈췄어요(연속 5개 단지 실패)."


def test_B24_사_5xx_가_성공보다_적으면_completed(db):
    job, _, _, _ = _run_price(db, [F503, OK, F503, OK, OK])

    assert job.status == "completed"
    assert job.error_message is None


# ── 문구: 알림·화면 원문 그대로 / 영문 꼬리는 막힘 ──


@pytest.mark.parametrize("aborted", [True, False], ids=["중단", "끝까지"])
def test_B24_새_문장이_알림과_화면에_그대로_보인다(aborted):
    from crawler.plain_words import UNKNOWN_ERROR_WORDS, explain_error, explain_stored_error
    from crawler.service_price import _rate_limited_words

    words = _rate_limited_words(150, 60, 40, aborted, mixed=True)
    assert words.startswith("네이버가 막거나 오류를 내서")
    assert explain_error(words) == words
    assert explain_error(words) != UNKNOWN_ERROR_WORDS
    assert explain_stored_error(words) == words


def test_B24_새_문장에_영문이_붙으면_원문_통과_안_함():
    from crawler.plain_words import explain_error
    from crawler.service_price import _rate_limited_words

    words = _rate_limited_words(8, 5, 1, True, mixed=True)
    assert explain_error(words + " API 인증 실패 (HTTP 403)") != words + " API 인증 실패 (HTTP 403)"
    assert explain_error(words + " | stale running — swept by monitor") != words + " | stale running — swept by monitor"


# ══ B23 — 새 단지 찾기(discover_complexes_by_region · discover_all_regions) ══
#   (가) 검색 1쪽 오류·빈 응답 → failed + 쉬운 우리말 사유, DISCOVER_BLOCKED
#   (나) 1쪽 정상인데 단지 0개 → completed, DISCOVER_OK (진짜 0건)
#   (다) 2쪽 오류 → completed (앞쪽 저장 유지), DISCOVER_OK
#   (라) DB 등 다른 예외 → failed, DISCOVER_FAILED
#   (마) 바깥 반복: 1쪽 실패 지역 연속 5개면 6번째 지역을 부르지 않는다 · 성공이 끼면 0 · DB 예외 실패는 연속에 넣지도 끊지도 않는다


def _search_page(prefix, n, more):
    return {
        "complexes": [{"complexNo": f"{prefix}{i}", "realEstateTypeCode": "APT"} for i in range(n)],
        "isMoreData": more,
    }


def _run_discover(db, pages, upsert_side_effect=None, job_id="b23_discover"):
    """search_by_keyword 가 pages 목록대로 답하는 지역 하나 찾기 → (반환값, 잡 행)"""
    import crawler.service_discover as sd

    with patch.object(sd.NaverEstateAPI, "search_by_keyword", side_effect=lambda kw, page=1: pages[page - 1]), \
         patch.object(sd, "upsert_complex_from_search", side_effect=upsert_side_effect), \
         patch.object(sd, "record_call"), \
         patch.object(sd._throttle_discover, "wait"):
        outcome = sd.discover_complexes_by_region("서울특별시", "강남구", scheduler_job_id=job_id)
    db.expire_all()
    return outcome, db.query(CrawlJob).filter(CrawlJob.scheduler_job_id == job_id).one()


@pytest.mark.parametrize(
    "first",
    [{"error": "API 인증 실패 (HTTP 403)"}, {"error": RATE_LIMIT_EXHAUSTED_ERROR}, None, {}],
    ids=["403", "429", "None", "빈dict"],
)
def test_B23_가_1쪽_오류면_failed_와_사유(db, first):
    from crawler.plain_words import explain_error, explain_stored_error
    from crawler.service_discover import DISCOVER_BLOCKED

    outcome, job = _run_discover(db, [first])

    assert outcome == DISCOVER_BLOCKED
    assert job.status == "failed"
    assert job.error_message == "네이버가 막거나 오류를 내서 이 지역 단지 검색 첫 쪽을 못 받았어요."
    assert job.processed_items == 0
    assert explain_error(job.error_message) == job.error_message, "알림이 '처음 보는 문제'로 뭉개지면 안 된다"
    assert explain_stored_error(job.error_message) == job.error_message


def test_B23_나_1쪽_정상_0건은_completed(db):
    from crawler.service_discover import DISCOVER_OK

    outcome, job = _run_discover(db, [_search_page("Z", 0, False)])

    assert outcome == DISCOVER_OK
    assert job.status == "completed"
    assert job.error_message is None
    assert job.processed_items == 0


def test_B23_다_2쪽_오류는_completed_앞쪽_유지(db):
    from crawler.service_discover import DISCOVER_OK

    outcome, job = _run_discover(db, [_search_page("P", 3, True), {"error": "API 인증 실패 (HTTP 403)"}])

    assert outcome == DISCOVER_OK
    assert job.status == "completed"
    assert job.processed_items == 3


def test_B23_라_DB_예외는_DISCOVER_FAILED(db):
    from crawler.service_discover import DISCOVER_FAILED

    outcome, job = _run_discover(db, [_search_page("Q", 2, False)], upsert_side_effect=RuntimeError("저장 실패"))

    assert outcome == DISCOVER_FAILED
    assert job.status == "failed"
    assert "저장 실패" in job.error_message


def _run_all_regions(outcomes: list[str]):
    """지역 len(outcomes) 개짜리 가짜 전국표로 discover_all_regions 실행 → 호출된 지역 수"""
    import crawler.service_discover as sd

    regions = {"가짜도": {f"구{i:02d}": [] for i in range(len(outcomes))}}
    calls: list[str] = []

    def fake(sido, sigungu, scheduler_job_id=None, abort_remaining=0):
        calls.append(sigungu)
        return outcomes[len(calls) - 1]

    with patch.object(sd, "KOREA_REGIONS", regions), \
         patch.object(sd, "discover_complexes_by_region", side_effect=fake), \
         patch.object(sd._throttle_discover, "wait") as wait:
        sd.discover_all_regions(scheduler_job_id="discover_regions")
    _run_all_regions.wait_calls = wait.call_count
    return calls


def test_B23_마_1쪽_실패_연속_5개면_6번째_지역을_부르지_않는다(caplog):
    from crawler.service_discover import DISCOVER_BLOCKED as B
    from crawler.service_discover import DISCOVER_OK as O

    with caplog.at_level("WARNING", logger="crawler.service_discover"):
        calls = _run_all_regions([O, B, B, B, B, B, O, O])

    assert len(calls) == 6
    assert any("5개 지역 연속 실패 (6/8 번째 지역에서)" in r.getMessage() for r in caplog.records)


def test_B23_마_성공이_끼면_연속_수가_0으로():
    from crawler.service_discover import DISCOVER_BLOCKED as B
    from crawler.service_discover import DISCOVER_OK as O

    outcomes = [B] * 4 + [O] + [B] * 4 + [O] * 3
    assert len(_run_all_regions(outcomes)) == len(outcomes)


def test_B23_마_DB_예외_실패는_연속에_넣지_않는다():
    """1쪽 실패 4 → DB 예외 → 성공들: DB 예외를 세면 5번째에서 멈춘다"""
    from crawler.service_discover import DISCOVER_BLOCKED as B
    from crawler.service_discover import DISCOVER_FAILED as F
    from crawler.service_discover import DISCOVER_OK as O

    outcomes = [B, B, B, B, F, O, O, O]
    assert len(_run_all_regions(outcomes)) == len(outcomes)


def test_B23_마_DB_예외_실패는_연속을_끊지도_않는다():
    """1쪽 실패 2 → DB 예외 → 1쪽 실패 3: 연속은 5로 이어져 6번째 호출에서 멈춘다"""
    from crawler.service_discover import DISCOVER_BLOCKED as B
    from crawler.service_discover import DISCOVER_FAILED as F
    from crawler.service_discover import DISCOVER_OK as O

    assert len(_run_all_regions([B, B, F, B, B, B, O, O])) == 6


def test_B23_바_지역_사이마다_대기한다():
    from crawler.service_discover import DISCOVER_OK as O

    assert len(_run_all_regions([O, O, O])) == 3
    assert _run_all_regions.wait_calls == 3, "지역 사이 대기를 빼면 네이버를 쉬지 않고 두드린다"


def test_B23_사_1쪽_5xx_는_failed_지만_연속에_넣지_않는다(db):
    from crawler.service_discover import DISCOVER_FAILED

    outcome, job = _run_discover(db, [{"error": "API 요청 실패: 상태 코드 503"}])

    assert outcome == DISCOVER_FAILED
    assert job.status == "failed"
    assert job.error_message == "네이버가 막거나 오류를 내서 이 지역 단지 검색 첫 쪽을 못 받았어요."


def _run_all_regions_real(db, n_regions: int, first_page_of):
    """진짜 discover_complexes_by_region 으로 지역 n 개 순회 → (검색된 키워드 목록, 잡 행 목록(생성 순))

    first_page_of(지역 순번) → 그 지역 검색 1쪽 응답.
    """
    import crawler.service_discover as sd

    regions = {"가짜도": {f"구{i:02d}": [] for i in range(n_regions)}}
    keywords: list[str] = []

    def search(keyword, page=1):
        keywords.append(keyword)
        return first_page_of(int(keyword[-2:]))

    with patch.object(sd, "KOREA_REGIONS", regions), \
         patch.object(sd.NaverEstateAPI, "search_by_keyword", side_effect=search), \
         patch.object(sd, "upsert_complex_from_search"), \
         patch.object(sd, "record_call"), \
         patch.object(sd._throttle_discover, "wait"):
        sd.discover_all_regions(scheduler_job_id="b23_all")
    db.expire_all()
    jobs = db.query(CrawlJob).filter(CrawlJob.scheduler_job_id == "b23_all").order_by(CrawlJob.id).all()
    return keywords, jobs


def test_B23_사_1쪽_5xx_가_5지역_연속이어도_6번째_지역을_부른다(db):
    keywords, jobs = _run_all_regions_real(
        db, 6, lambda i: {"error": "API 요청 실패: 상태 코드 502"} if i < 5 else _search_page("S", 1, False),
    )

    assert len(keywords) == 6
    assert [j.status for j in jobs] == ["failed"] * 5 + ["completed"]


def test_B23_아_연속_5로_멈추면_마지막_지역_사유에_남은_지역_수(db):
    from crawler.plain_words import explain_error, explain_stored_error

    keywords, jobs = _run_all_regions_real(db, 8, lambda i: {"error": "API 인증 실패 (HTTP 403)"})

    assert len(keywords) == 5
    assert [j.error_message for j in jobs[:4]] == ["네이버가 막거나 오류를 내서 이 지역 단지 검색 첫 쪽을 못 받았어요."] * 4
    last = jobs[4].error_message
    assert last == "네이버가 막거나 오류를 내서 이 지역 단지 검색 첫 쪽을 못 받았어요(남은 지역 3곳은 이번 회차에서 멈췄어요)."
    assert explain_error(last) == last and explain_stored_error(last) == last
