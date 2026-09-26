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


def _run_collect_with(plan, kind: str = "quota"):
    """plan(k) = k번째로 만난 시군구가 성공이면 True. DB distinct 순서가 보장되지 않으므로
    시군구 코드가 아니라 **만난 순서**로 성공/실패를 정한다. 만난 순서를 돌려준다."""
    seen: list[str] = []

    def _fake(lawd_cd, deal_ymd):
        if lawd_cd not in seen:
            seen.append(lawd_cd)
        return [] if plan(seen.index(lawd_cd)) else None

    _FakeDate._today = _real_date(2026, 3, 14)  # 토요일, 10일 아님
    with patch.dict("os.environ", {"PUBLIC_DATA_API_KEY": "test-key"}), \
         patch("datetime.date", _FakeDate), \
         patch("crawler.public_data_api.PublicDataAPI.get_all_apt_trades", side_effect=_fake), \
         patch("crawler.public_data_api.PublicDataAPI.last_failure_kind", return_value=kind):
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


def test_T6b_배치는_연속_3단지_실패면_중단하고_failed(db):
    for k in range(6):
        _add_backfill_complex(db, f"B{k}", households=1000 - k)

    calls, result = _run_batch(["quota"] * 6)

    assert len(calls) == 3, "첫 실패로 즉사하지도, 끝까지 헛돌지도 않고 3단지째에 멈춘다"
    job = _backfill_job(db)
    assert job.status == "failed"
    assert "한도" in job.error_message
    _assert_plain(job.error_message)
    assert result["failed"] == 3


def test_T6c_배치_성공이_끼면_연속_카운터_리셋(db):
    for k in range(6):
        _add_backfill_complex(db, f"B{k}", households=1000 - k)

    calls, result = _run_batch(["other", "other", "ok", "other", "other", "ok"])

    assert len(calls) == 6
    job = _backfill_job(db)
    assert job.status == "completed"
    assert result == {"success": 2, "failed": 4, "total": 6, "quota_exhausted": False}


# ── T7: 문구 렌더 ───────────────────────────────────────────────────────


_QUOTA_ABORT = "정부 실거래가 창구가 하루 요청 한도 초과라고 답해 190/253개 시군구까지만 받고 중단 — 다음 회차가 이어받아요"
_OTHER_ABORT = "정부 실거래가 창구 호출이 시군구 5곳 연속 실패해 190/253개 시군구까지만 받고 중단 — 다음 회차가 이어받아요"


def test_T7_한도_문구는_알림에서_한도_안내로_번역된다():
    from crawler.plain_words import explain_error, explain_stored_error

    assert explain_error(_QUOTA_ABORT) == "오늘 쓸 수 있는 정부 자료 요청 횟수를 다 썼어요."
    assert explain_stored_error(_QUOTA_ABORT) == "오늘 쓸 수 있는 정부 자료 요청 횟수를 다 썼어요."
    # 한도가 아닌 실패는 관리자 화면에 원문(이미 우리말) 그대로 남는다
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
    assert "요청 횟수를 다 썼어요" in msg
