"""B20 덤 회귀 테스트 — 시세 수집 네 곳이 네이버 429 소진 응답에 간격을 늘리는가

shared/naver_api.py 는 429 를 재시도 끝까지 받으면 예외가 아니라 {"error": 문구} 를 돌려준다.
그 문구일 때만 on_rate_limit, 정상 응답일 때만 on_success, 그 밖의 실패는 간격을 건드리지 않는다.

네 곳 = ① 요청 시 시세 ② 요청 시 실거래가 ③ 주간 배치 시세 ④ B1 재수집.
각 곳에서 "대상 호출 1번"만 시험 응답을 받고, 나머지 호출은 빈 응답({} — 간격 무관)을 받는다.

네이버 호출 0 — NaverEstateAPI 메서드만 가짜, throttle 은 호출 횟수를 세는 가짜.
"""

from unittest.mock import MagicMock, patch

import pytest

from db.models import Complex
from services.enricher import RATE_LIMIT_EXHAUSTED_ERROR

# ── 팩토리 함수 ──

_RATE_LIMITED = "rate_limited"
_OTHER_ERROR = "other_error"
_NORMAL = "normal"

_CASES = [_RATE_LIMITED, _OTHER_ERROR, _NORMAL]

# (on_rate_limit 횟수, on_success 횟수) 기대값
_EXPECTED = {
    _RATE_LIMITED: (1, 0),
    _OTHER_ERROR: (0, 0),
    _NORMAL: (0, 1),
}


def _response(case, kind="prices"):
    """시험 응답 — 429 소진 / 다른 오류 / 정상"""
    if case == _RATE_LIMITED:
        return {"error": RATE_LIMIT_EXHAUSTED_ERROR}
    if case == _OTHER_ERROR:
        return {"error": "API 요청 실패: 상태 코드 404"}
    if kind == "real":
        return {"realPriceOnMonthList": []}
    return {"marketPrices": []}


def _prices_once(case, complex_no, trade_type="A1"):
    """get_complex_prices 가짜 — (단지, 거래유형)이 맞는 첫 호출만 시험 응답, 나머지는 {}"""
    state = {"used": False}
    target_trade_type = trade_type

    def _fake(no, trade_type=None, **kwargs):
        if not state["used"] and no == complex_no and trade_type == target_trade_type:
            state["used"] = True
            return _response(case)
        return {}

    return _fake


def _counts(throttle):
    """(on_rate_limit 횟수, on_success 횟수)"""
    return throttle.on_rate_limit.call_count, throttle.on_success.call_count


# ── ① 요청 시 시세 ──


@pytest.mark.parametrize("case", _CASES)
def test_ondemand_prices_throttle(db, case):
    """① 요청 시 시세: A1 첫 호출만 시험 응답, 실거래가는 {}"""
    throttle = MagicMock()
    with (
        patch("crawler.service_price._throttle_ondemand", throttle),
        patch(
            "crawler.service_price.NaverEstateAPI.get_complex_prices",
            side_effect=_prices_once(case, "b20p1"),
        ),
        patch("crawler.service_price.NaverEstateAPI.get_complex_real_prices", return_value={}),
    ):
        from crawler.service_price import collect_price_history_for_complex
        collect_price_history_for_complex(db, "b20p1")

    assert _counts(throttle) == _EXPECTED[case]


# ── ② 요청 시 실거래가 ──


@pytest.mark.parametrize("case", _CASES)
def test_ondemand_real_prices_throttle(db, case):
    """② 요청 시 실거래가: 시세는 전부 {}, 실거래가 A1 만 시험 응답"""
    throttle = MagicMock()

    def _fake_real(no, trade_type=None, **kwargs):
        return _response(case, kind="real") if trade_type == "A1" else {}

    with (
        patch("crawler.service_price._throttle_ondemand", throttle),
        patch("crawler.service_price.NaverEstateAPI.get_complex_prices", return_value={}),
        patch("crawler.service_price.NaverEstateAPI.get_complex_real_prices", side_effect=_fake_real),
    ):
        from crawler.service_price import collect_price_history_for_complex
        collect_price_history_for_complex(db, "b20p2")

    assert _counts(throttle) == _EXPECTED[case]


# ── ③ 주간 배치 시세 ──


@pytest.mark.parametrize("case", _CASES)
def test_batch_prices_throttle(db, case):
    """③ 주간 배치: 단지 하나의 A1 호출만 시험 응답, B1·다른 단지는 {}"""
    db.add(Complex(complex_no="b20p3", complex_name="B20배치단지"))
    db.commit()
    throttle = MagicMock()
    with (
        patch("crawler.service_price._throttle", throttle),
        patch(
            "crawler.service_price.NaverEstateAPI.get_complex_prices",
            side_effect=_prices_once(case, "b20p3"),
        ),
    ):
        from crawler.service_price import collect_price_history
        collect_price_history(batch_size=50, scheduler_job_id="collect_prices")

    assert _counts(throttle) == _EXPECTED[case]


# ── ④ B1 재수집 ──


@pytest.mark.parametrize("case", _CASES)
def test_recollect_b1_throttle(db, case):
    """④ B1 재수집: 평형 없음 → 호출 1번이 시험 응답"""
    throttle = MagicMock()
    with (
        patch("crawler.service_price._throttle", throttle),
        patch(
            "crawler.service_price.NaverEstateAPI.get_complex_prices",
            side_effect=_prices_once(case, "b20p4", trade_type="B1"),
        ),
    ):
        from crawler.service_price import recollect_b1_price_for_complex
        recollect_b1_price_for_complex(db, "b20p4")

    assert _counts(throttle) == _EXPECTED[case]


# ── 판정 도우미 ──


@pytest.mark.parametrize(
    "result, expected",
    [
        ({"error": RATE_LIMIT_EXHAUSTED_ERROR}, True),
        ({"error": "API 인증 실패 (HTTP 403)"}, False),
        ({"error": {"code": "errorCode.NotExistInformation"}}, False),
        ({}, False),
        (None, False),
        ({"marketPrices": []}, False),
    ],
    ids=["429", "403", "dict_error", "empty", "none", "normal"],
)
def test_is_rate_limit_exhausted(result, expected):
    """판정 도우미: 429 소진 문구일 때만 True"""
    from crawler.service_price import _is_rate_limit_exhausted
    assert _is_rate_limit_exhausted(result) is expected
