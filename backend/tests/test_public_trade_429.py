"""국토부 실거래가 호출 실패를 "빈 달"로 삼키던 결함 회귀 테스트 (세션 420, P0-a).

사고(2026-09-26 토요일): 05:40 부터 모든 호출이 HTTP 429(하루 요청 한도 초과)였는데
`get_all_apt_trades` 가 실패를 [] 로 캐시·반환했고, 주간 수집기는 `if not trades:
continue` 로 빈 달처럼 넘긴 뒤 그 시군구를 완료 표시 → 회차가 completed(759,061건,
평소 96.9만)로 끝났다. 190/253 시군구까지만 실제로 받았는데 아무 경보도 없었다.

고친 동작:
  - 실패 = None(캐시 안 함) / 정상 빈 달 = [](캐시)
  - 주간 수집기: 실패 시군구는 done_codes 에 넣지 않고, 연속 5개면 회차 failed
  - 소급(backfill): 실패는 예외, 한도 초과면 시도 마커를 찍지 않음, 배치는 연속 3단지면 failed
  - error_message 는 쉬운 우리말 (관리자 화면·알림에 그대로 보인다)

외부 호출 0 — 모든 시험은 PublicDataAPI 수준에서 patch 한다.
"""
import re
from datetime import date as _real_date
from unittest.mock import MagicMock, patch

import pytest

from crawler.utils import CheckpointManager
from db.models import Complex, CrawlJob

_checkpoint = CheckpointManager(checkpoint_interval=5)

_EMPTY_ENVELOPE = {
    "response": {
        "header": {"resultCode": "00"},
        "body": {"totalCount": 0, "items": ""},
    }
}


def _assert_plain(text: str):
    """관리자 화면에 그대로 보이는 문구 — 영문 낱말(429·quota·API 류 포함)이 없어야 한다."""
    assert text
    assert not re.findall(r"[A-Za-z]{2,}", text), f"영문이 섞였다: {text}"
    assert "429" not in text, f"개발자 숫자 코드가 섞였다: {text}"


class _FakeDate(_real_date):
    """date.today() 고정 (test_public_trade_resume.py 패턴 답습)"""

    _today = None

    @classmethod
    def today(cls):
        return cls._today


# ── T1·T2: get_all_apt_trades 실패 구분 ────────────────────────────────────


@patch("crawler.public_data_api.PublicDataAPI.get_apt_trades", return_value=None)
def test_T1_실패하면_None_반환하고_캐시하지_않는다(mock_get):
    from crawler.public_data_api import PublicDataAPI
    PublicDataAPI.reset()

    result = PublicDataAPI.get_all_apt_trades("11680", "202603")

    assert result is None, "호출 실패를 빈 달([])로 위장하면 안 된다"
    assert ("11680", "202603") not in PublicDataAPI._trade_cache, "실패 결과가 캐시되면 재시도해도 계속 빈 달"


@patch("crawler.public_data_api.PublicDataAPI.get_apt_trades")
def test_T1b_두번째_페이지가_실패하면_반쪽_결과도_캐시하지_않는다(mock_get):
    from crawler.public_data_api import PublicDataAPI
    PublicDataAPI.reset()
    mock_get.side_effect = [
        {"response": {"header": {"resultCode": "00"},
                      "body": {"totalCount": 2, "items": {"item": [{"aptNm": "A", "dealAmount": "1"}]}}}},
        None,
    ]

    assert PublicDataAPI.get_all_apt_trades("11680", "202603") is None
    assert ("11680", "202603") not in PublicDataAPI._trade_cache


@patch("crawler.public_data_api.PublicDataAPI.get_apt_trades", return_value=_EMPTY_ENVELOPE)
def test_T2_정상_빈_봉투는_빈_리스트로_캐시한다(mock_get):
    from crawler.public_data_api import PublicDataAPI
    PublicDataAPI.reset()

    result = PublicDataAPI.get_all_apt_trades("11680", "202603")

    assert result == []
    assert PublicDataAPI._trade_cache.get(("11680", "202603")) == []
    PublicDataAPI.get_all_apt_trades("11680", "202603")
    assert mock_get.call_count == 1, "진짜 빈 달은 기존처럼 캐시돼 다시 부르지 않는다"


# ── 실패 종류 기록 ──────────────────────────────────────────────────────


def _response(status_code: int, payload: dict | None = None):
    resp = MagicMock()
    resp.status_code = status_code
    resp.json.return_value = payload or {}
    return resp


@pytest.fixture
def _api_no_wait():
    """재시도 대기·스로틀·키·일일 게이트를 시험용으로 고정 (실 네트워크 0)."""
    from crawler.public_data_api import PublicDataAPI
    PublicDataAPI.reset()
    with patch("crawler.public_data_api.time.sleep"), \
         patch.object(PublicDataAPI, "_throttle"), \
         patch.object(PublicDataAPI, "_get_service_key", return_value="test-key"), \
         patch.object(PublicDataAPI, "_check_daily_limit", return_value=True), \
         patch.object(PublicDataAPI, "_get_session") as mock_session:
        yield PublicDataAPI, mock_session


def test_429_재시도_소진은_quota로_기록된다(_api_no_wait):
    api, mock_session = _api_no_wait
    mock_session.return_value.get.return_value = _response(429)

    assert api.get_apt_trades("11680", "202603") is None
    assert api.last_failure_kind() == "quota"


def test_자체_일일_게이트도_quota로_기록된다(_api_no_wait):
    api, _ = _api_no_wait
    with patch.object(api, "_check_daily_limit", return_value=False):
        assert api.get_apt_trades("11680", "202603") is None
    assert api.last_failure_kind() == "quota"


def test_그밖의_실패는_other_성공하면_None으로_리셋(_api_no_wait):
    api, mock_session = _api_no_wait
    mock_session.return_value.get.return_value = _response(500)
    assert api.get_apt_trades("11680", "202603") is None
    assert api.last_failure_kind() == "other"

    mock_session.return_value.get.return_value = _response(200, _EMPTY_ENVELOPE)
    assert api.get_apt_trades("11680", "202603") is not None
    assert api.last_failure_kind() is None


def _envelope(code: str) -> dict:
    """HTTP 200 으로 오는 data.go.kr 오류 봉투 (kapt_api 실측 모양)."""
    return {"OpenAPI_ServiceResponse": {"cmmMsgHeader": {
        "errMsg": "SERVICE ERROR", "returnAuthMsg": "시험용", "returnReasonCode": code,
    }}}


def test_200_오류봉투_22는_한도초과로_실패_캐시_안함(_api_no_wait):
    """body 가 없는 봉투를 정상으로 받으면 totalCount 0 = 빈 달로 캐시된다 — 막는다."""
    api, mock_session = _api_no_wait
    mock_session.return_value.get.return_value = _response(200, _envelope("22"))

    assert api.get_all_apt_trades("11680", "202603") is None
    assert api.last_failure_kind() == "quota"
    assert ("11680", "202603") not in api._trade_cache
    assert mock_session.return_value.get.call_count == 1, "한도 초과는 기다려도 안 바뀌어 재시도하지 않는다"


def test_200_오류봉투_다른코드는_other로_실패(_api_no_wait):
    api, mock_session = _api_no_wait
    mock_session.return_value.get.return_value = _response(200, _envelope("04"))

    assert api.get_all_apt_trades("11680", "202603") is None
    assert api.last_failure_kind() == "other"
    assert ("11680", "202603") not in api._trade_cache


def test_정상모양_resultCode_22는_한도초과로_실패(_api_no_wait):
    """검사관 M1 ⓐ — `response.header.resultCode` 가 22 면 other 가 아니라 quota."""
    api, mock_session = _api_no_wait
    payload = {"response": {"header": {"resultCode": "22", "resultMsg": "LIMITED"}, "body": {}}}
    mock_session.return_value.get.return_value = _response(200, payload)

    assert api.get_all_apt_trades("11680", "202603") is None
    assert api.last_failure_kind() == "quota"
    assert ("11680", "202603") not in api._trade_cache


_QUOTA_XML = (
    "<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg>"
    "<returnAuthMsg>LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR</returnAuthMsg>"
    "<returnReasonCode>22</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>"
)


@pytest.mark.parametrize("body", [
    _QUOTA_XML,
    "<OpenAPI_ServiceResponse><cmmMsgHeader><returnReasonCode>22</returnReasonCode>"
    "</cmmMsgHeader></OpenAPI_ServiceResponse>",
])
def test_XML_한도_응답은_재시도없이_quota(_api_no_wait, body):
    """검사관 M1 ⓑ — `_type=json` 인데 XML 로 온 한도 응답. json() 이 터져도 한도면 즉시 quota."""
    api, mock_session = _api_no_wait
    resp = _response(200)
    resp.json.side_effect = ValueError("not json")
    resp.text = body
    mock_session.return_value.get.return_value = resp

    assert api.get_all_apt_trades("11680", "202603") is None
    assert api.last_failure_kind() == "quota"
    assert ("11680", "202603") not in api._trade_cache
    assert mock_session.return_value.get.call_count == 1, "한도는 기다려도 안 바뀌어 재시도하지 않는다"


def test_XML_한도가_아닌_파싱실패는_기존처럼_재시도_후_other(_api_no_wait):
    api, mock_session = _api_no_wait
    resp = _response(200)
    resp.json.side_effect = ValueError("not json")
    resp.text = "<html>gateway</html>"
    mock_session.return_value.get.return_value = resp

    assert api.get_apt_trades("11680", "202603") is None
    assert api.last_failure_kind() == "other"
    from crawler.public_data_api import MAX_RETRIES
    assert mock_session.return_value.get.call_count == MAX_RETRIES


# ── T3~T5: 주간 수집기 ──────────────────────────────────────────────────


def _add_regions(db, n: int) -> list[str]:
    """시군구가 서로 다른 단지 n개 — 시군구 코드 목록 반환."""
    codes = []
    for k in range(n):
        code = f"{11000 + k * 10:05d}"
        db.add(Complex(complex_no=f"R{k}", complex_name=f"시험단지{k}", cortar_no=code + "00000"))
        codes.append(code)
    db.commit()
    return codes


def _run_collect_with(plan, kind: str = "quota", kinds: list[str] | None = None):
    """plan(k) = k번째로 만난 시군구가 성공이면 True. DB distinct 순서가 보장되지 않으므로
    시군구 코드가 아니라 **만난 순서**로 성공/실패를 정한다. 만난 순서를 돌려준다.
    kinds 를 주면 실패 시군구마다 그 순서대로 실패 종류를 돌려준다(L2 시험용)."""
    seen: list[str] = []

    def _fake(lawd_cd, deal_ymd):
        if lawd_cd not in seen:
            seen.append(lawd_cd)
        return [] if plan(seen.index(lawd_cd)) else None

    kind_patch = (
        {"side_effect": list(kinds)} if kinds is not None else {"return_value": kind}
    )
    _FakeDate._today = _real_date(2026, 3, 14)  # 토요일, 10일 아님
    with patch.dict("os.environ", {"PUBLIC_DATA_API_KEY": "test-key"}), \
         patch("datetime.date", _FakeDate), \
         patch("crawler.public_data_api.PublicDataAPI.get_all_apt_trades", side_effect=_fake), \
         patch("crawler.public_data_api.PublicDataAPI.last_failure_kind", **kind_patch):
        from crawler.service_public import collect_public_trade_data
        collect_public_trade_data(batch_size=50, scheduler_job_id="collect_public_trades")
    return seen


def _the_job(db) -> CrawlJob:
    db.expire_all()
    return db.query(CrawlJob).filter(CrawlJob.job_type == "public_trade_data").one()


def test_T3_연속_5개_실패면_중단하고_성공분만_완료표시(db):
    _add_regions(db, 8)

    seen = _run_collect_with(lambda k: k < 2, kind="quota")

    job = _the_job(db)
    assert job.status == "failed", "한도 초과로 거의 못 받았는데 completed 로 끝나면 안 된다"
    assert len(seen) == 7, "성공 2 + 연속 실패 5 에서 멈추고 8번째는 부르지 않는다"
    state = _checkpoint.load(db, job.id)
    assert state is not None, "재개용 체크포인트가 남아야 한다"
    assert set(state["done_codes"]) == set(seen[:2]), "실패 시군구가 완료로 표시되면 재개가 건너뛴다"
    assert "한도" in job.error_message
    assert "2/8" in job.error_message
    _assert_plain(job.error_message)


def test_T3b_한도가_아닌_연속_실패는_한도_문구_없이(db):
    _add_regions(db, 6)

    _run_collect_with(lambda k: False, kind="other")

    job = _the_job(db)
    assert job.status == "failed"
    assert "한도" not in job.error_message
    assert "연속 실패" in job.error_message
    _assert_plain(job.error_message)


def test_L2_한도가_한번이라도_있었으면_중단_문구는_한도(db):
    """검사관 L2 — 5번째 실패가 한도가 아니어도 앞에서 한도 초과가 있었으면 한도 문구."""
    _add_regions(db, 6)

    _run_collect_with(lambda k: False, kinds=["quota", "other", "other", "other", "other"])

    job = _the_job(db)
    assert job.status == "failed"
    assert "한도" in job.error_message
    assert "다음 회차가 다시 받아요" in job.error_message, "정기 회차는 재개 창 밖이라 '이어받아요'는 사실이 아니다(L3)"
    _assert_plain(job.error_message)


def test_T4_성공이_끼면_연속_카운터가_리셋되고_completed(db):
    # 실패 4 → 성공 1 → 실패 4 → 성공 9 (성공 10 > 실패 8)
    _add_regions(db, 18)
    fail_idx = set(range(0, 4)) | set(range(5, 9))

    seen = _run_collect_with(lambda k: k not in fail_idx)

    job = _the_job(db)
    assert len(seen) == 18, "연속 실패가 5에 닿지 않았으니 끝까지 가야 한다"
    assert job.status == "completed"
    assert job.error_message == "8개 시군구는 못 받음(다음 회차 재시도)"


def test_T5_끝까지_갔어도_실패가_성공보다_많으면_failed(db):
    # 실패 4 → 성공 1 → 실패 4 (연속 5 미도달, 실패 8 > 성공 1)
    _add_regions(db, 9)
    fail_idx = set(range(0, 4)) | set(range(5, 9))

    seen = _run_collect_with(lambda k: k not in fail_idx)

    job = _the_job(db)
    assert len(seen) == 9
    assert job.status == "failed"
    assert "8개 시군구를 못 받음" in job.error_message
    _assert_plain(job.error_message)
    state = _checkpoint.load(db, job.id)
    assert state is not None and len(state["done_codes"]) == 1


# ── T6: 소급(backfill) ──────────────────────────────────────────────────


def _add_backfill_complex(db, no: str, households: int = 500):
    db.add(Complex(
        complex_no=no, complex_name=f"소급단지{no}", cortar_no="1168010300",
        total_household_count=households,
    ))
    db.commit()


@pytest.mark.parametrize("kind, stamped", [("quota", False), ("other", True)])
def test_T6_소급_호출실패는_예외_한도면_시도마커_없음(db, kind, stamped):
    from crawler.service_public import PublicTradeFetchError, backfill_price_history
    _add_backfill_complex(db, "B1")

    with patch("crawler.public_data_api.PublicDataAPI.get_all_apt_trades", return_value=None), \
         patch("crawler.public_data_api.PublicDataAPI.last_failure_kind", return_value=kind):
        with pytest.raises(PublicTradeFetchError) as exc:
            backfill_price_history("B1", months_back=3)

    assert exc.value.kind == kind
    _assert_plain(str(exc.value))  # 관리자 수동 소급 버튼의 응답 문구 원천
    db.expire_all()
    cpx = db.get(Complex, "B1")
    assert (cpx.public_data_attempted_at is not None) is stamped, (
        "한도 초과로 못 받은 단지에 시도 마커를 찍으면 90일 동안 재시도 대상에서 빠진다"
    )


def _run_batch(outcomes):
    """outcomes[i] = i번째 단지 결과("ok" 또는 실패 종류). 호출 수를 돌려준다."""
    from crawler.service_public import PublicTradeFetchError, backfill_price_batch
    calls = []

    def _fake(cno, months_back=24):
        calls.append(cno)
        o = outcomes[len(calls) - 1]
        if o != "ok":
            raise PublicTradeFetchError("정부 실거래가 창구 호출이 실패해", o)
        return {"collected": 0}

    with patch("crawler.quota_db.get_api_quota_status",
               return_value={"remaining": 5000, "count": 0, "limit": 9000}), \
         patch("crawler.service_public.backfill_price_history", side_effect=_fake):
        result = backfill_price_batch(batch_size=20, scheduler_job_id="backfill_price")
    return calls, result


def _backfill_job(db) -> CrawlJob:
    db.expire_all()
    return db.query(CrawlJob).filter(CrawlJob.job_type == "price_backfill").one()


def test_T6b_배치는_한도가_아닌_실패가_연속_3단지면_중단하고_failed(db):
    for k in range(6):
        _add_backfill_complex(db, f"B{k}", households=1000 - k)

    calls, result = _run_batch(["other"] * 6)

    assert len(calls) == 3, "첫 실패로 즉사하지도, 끝까지 헛돌지도 않고 3단지째에 멈춘다"
    job = _backfill_job(db)
    assert job.status == "failed"
    assert "한도" not in job.error_message
    assert "연속 실패" in job.error_message
    _assert_plain(job.error_message)
    assert result["failed"] == 3


def test_M3_배치는_한도_실패_한번이면_연속여부와_무관하게_즉시_중단(db):
    """검사관 M3 — 캐시 적중 단지가 "성공"으로 세어져 연속 카운터가 0 이 되므로
    연속 규칙만으로는 한도 폭주 속에서도 배치가 끝까지 헛돈다. 한도는 1건에 멈춘다."""
    for k in range(6):
        _add_backfill_complex(db, f"B{k}", households=1000 - k)

    calls, result = _run_batch(["ok", "ok", "quota", "ok", "ok", "ok"])

    assert len(calls) == 3, "한도 초과 뒤 단지는 부르지 않는다"
    job = _backfill_job(db)
    assert job.status == "failed"
    assert "한도" in job.error_message
    assert "6개 단지 중 2개까지만" in job.error_message
    _assert_plain(job.error_message)
    assert result["success"] == 2 and result["failed"] == 1


def test_M3_자체_일일_게이트도_한도_문구로_즉시_failed(db):
    """우리 쪽 일일 게이트(_check_daily_limit False)도 한도 실패로 배치를 바로 멈춘다 —
    실제 backfill_price_history·get_all_apt_trades 경로를 그대로 탄다(외부 호출 0)."""
    from crawler.public_data_api import PublicDataAPI
    from crawler.service_public import backfill_price_batch
    PublicDataAPI.reset()
    for k in range(3):
        _add_backfill_complex(db, f"G{k}", households=1000 - k)

    with patch.object(PublicDataAPI, "_get_service_key", return_value="test-key"), \
         patch.object(PublicDataAPI, "_check_daily_limit", return_value=False), \
         patch.object(PublicDataAPI, "_get_session") as mock_session, \
         patch("crawler.quota_db.get_api_quota_status",
               return_value={"remaining": 5000, "count": 0, "limit": 9000}):
        result = backfill_price_batch(batch_size=20, scheduler_job_id="backfill_price")

    assert mock_session.return_value.get.call_count == 0, "게이트에서 막혀 실제 호출은 0"
    assert result["failed"] == 1 and result["success"] == 0
    job = _backfill_job(db)
    assert job.status == "failed"
    assert "한도" in job.error_message
    _assert_plain(job.error_message)
    db.expire_all()
    assert all(db.get(Complex, f"G{k}").public_data_attempted_at is None for k in range(3))


def test_T6c_배치_성공이_끼면_연속_카운터_리셋(db):
    # 실패 2 → 성공 → 실패 2 → 성공 3 (연속 3 미도달, 실패 4 = 성공 4 → completed)
    for k in range(8):
        _add_backfill_complex(db, f"B{k}", households=1000 - k)

    calls, result = _run_batch(["other", "other", "ok", "other", "other", "ok", "ok", "ok"])

    assert len(calls) == 8
    job = _backfill_job(db)
    assert job.status == "completed"
    assert result == {"success": 4, "failed": 4, "total": 8, "quota_exhausted": False}


def test_M3_배치_끝까지_갔어도_실패가_성공보다_많으면_failed(db):
    for k in range(5):
        _add_backfill_complex(db, f"B{k}", households=1000 - k)

    calls, result = _run_batch(["other", "other", "ok", "other", "other"])

    assert len(calls) == 5
    job = _backfill_job(db)
    assert job.status == "failed"
    assert job.error_message == (
        "정부 실거래가 창구 호출이 실패해 4개 단지를 못 받음(받은 곳 1개) — 못 받은 단지는 90일 뒤에 다시 시도해요"
    )
    _assert_plain(job.error_message)


# ── T7: 문구 렌더 ───────────────────────────────────────────────────────


_QUOTA_ABORT = "정부 실거래가 창구가 하루 요청 한도 초과라고 답해 190/253개 시군구까지만 받고 중단 — 다음 회차가 다시 받아요"
_OTHER_ABORT = "정부 실거래가 창구 호출이 시군구 5곳 연속 실패해 190/253개 시군구까지만 받고 중단 — 다음 회차가 다시 받아요"

# service_public.py 가 만드는 문구 머리 전부 (error_message·PublicTradeFetchError 메시지).
_OUR_MESSAGES = [
    _QUOTA_ABORT,
    _OTHER_ABORT,
    "정부 실거래가 창구가 하루 요청 한도 초과라고 답해 12개 시군구를 못 받음(받은 곳 3개) — 다음 회차가 다시 받아요",
    "정부 실거래가 창구 호출이 실패해 12개 시군구를 못 받음(받은 곳 3개) — 다음 회차가 다시 받아요",
    "8개 시군구는 못 받음(다음 회차 재시도)",
    "정부 실거래가 창구가 하루 요청 한도 초과라고 답해 이 단지의 지난 실거래가를 다 받지 못했어요",
    "정부 실거래가 창구 호출이 실패해 이 단지의 지난 실거래가를 다 받지 못했어요",
    "정부 실거래가 창구가 하루 요청 한도 초과라고 답해 20개 단지 중 7개까지만 받고 중단 — 남은 단지는 내일 이어서 받아요",
    "정부 실거래가 창구 호출이 단지 3곳 연속 실패해 20개 단지 중 7개까지만 받고 중단 — 남은 단지는 내일 이어서 받아요",
    "정부 실거래가 창구 호출이 실패해 4개 단지를 못 받음(받은 곳 1개) — 못 받은 단지는 90일 뒤에 다시 시도해요",
]


@pytest.mark.parametrize("text", _OUR_MESSAGES)
def test_M2_우리_수집기_문구는_알림과_화면에서_원문_그대로(text):
    """검사관 M2 — 한도 규칙이 먼저 잡으면 "190/253개" 숫자가 사라지고, 한도가 아닌 문구는
    알림에서 "처음 보는 문제" 로 떨어졌다. 우리 문구는 이미 쉬운 말이라 원문 그대로 둔다."""
    from crawler.plain_words import explain_error, explain_stored_error

    _assert_plain(text)
    assert explain_error(text) == text
    assert explain_stored_error(text) == text


def test_M2_원문_보존은_영문이_섞이면_작동하지_않는다():
    """원문 보존 규칙이 개발자 원문 누출 통로가 되면 안 된다 — 영문이 섞이면 아래 규칙이 받는다."""
    from crawler.plain_words import UNKNOWN_ERROR_WORDS, explain_error

    leaked = "정부 실거래가 창구 호출이 실패해 HTTP 502 Bad Gateway"
    assert explain_error(leaked) != leaked
    assert "Bad" not in explain_error(leaked)
    odd = "정부 실거래가 창구 SomethingNew"
    assert explain_error(odd) == UNKNOWN_ERROR_WORDS


def test_M2_기존_한도_규칙은_다른_원문에_그대로_작동():
    from crawler.plain_words import explain_error, explain_stored_error

    words = "오늘 쓸 수 있는 정부 자료 요청 횟수를 다 썼어요."
    assert explain_error("INFO-300 LIMITED NUMBER OF SERVICE REQUESTS") == words
    assert explain_error("일 요청 건수(1000건)를 초과하였습니다") == words
    assert explain_stored_error("INFO-300") == words


def test_T7_한도_문구는_숫자를_지킨_채_남는다():
    from crawler.plain_words import explain_error, explain_stored_error

    for fn in (explain_error, explain_stored_error):
        out = fn(_QUOTA_ABORT)
        assert "190/253" in out and "한도 초과" in out
    assert explain_stored_error(_OTHER_ABORT) == _OTHER_ABORT


def test_T7b_텔레그램_알림으로_렌더해도_영문이_없다():
    """실제 알림 서식(format_issue_message)으로 렌더해 영문 낱말이 남는지 본다
    (test_plain_words.test_rendered_alert_has_no_english_identifiers 와 같은 방법)."""
    from crawler.alert_format import format_issue_message

    for text in (_QUOTA_ABORT, _OTHER_ABORT):
        _assert_plain(text)

    from datetime import datetime, timezone
    ctx = {"active_count": 1, "now": datetime(2026, 9, 26, 3, 0, tzinfo=timezone.utc)}
    msg = format_issue_message(
        "crawl_failed",
        {"job_type": "public_trade_data", "count": 1, "error": _QUOTA_ABORT, "processed": 0, "total": 0},
        event="new", header_ctx=ctx,
    )
    stripped = re.sub(r"<[^>]+>", "", msg)
    for a in ("K-apt", "Claude", "data.go.kr"):
        stripped = stripped.replace(a, "")
    assert not re.findall(r"[A-Za-z][A-Za-z0-9_.]{2,}", stripped), msg
    assert "190/253개 시군구까지만" in msg, "알림에서도 숫자가 살아 있어야 한다(M2)"
