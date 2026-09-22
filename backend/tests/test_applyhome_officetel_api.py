"""청약홈 오피스텔·민간임대 API 클라이언트 + 파서 회귀 가드 (이슈 #323)."""
from datetime import date

from crawler.applyhome_officetel_api import parse_comma_amount, parse_compact_date


def test_parse_compact_date_iso_format():
    """기존 아파트 API 형식(ISO, 2026-08-06)을 그대로 통과."""
    assert parse_compact_date("2026-08-06") == date(2026, 8, 6)


def test_parse_compact_date_compact_format():
    """오피스텔 API 특유 형식(YYYYMMDD, 20260804) 을 ISO 로 변환.

    mibunyang 실측(§3-2): getOPTLttotPblancDetail 계열이 compact 형식을 준다 —
    같은 odcloud.kr 시스템이라 오피스텔 API도 동일 함정일 수 있어 방어.
    """
    assert parse_compact_date("20260804") == date(2026, 8, 4)


def test_parse_compact_date_invalid_returns_none():
    assert parse_compact_date("미정") is None
    assert parse_compact_date(None) is None
    assert parse_compact_date("") is None


def test_parse_comma_amount_with_comma():
    """콤마 낀 금액 형식(mibunyang §3-3 getOPTLttotPblancMdl 실측 패턴)."""
    assert parse_comma_amount("62,342") == 62342


def test_parse_comma_amount_without_comma():
    assert parse_comma_amount("134190") == 134190


def test_parse_comma_amount_invalid_returns_none():
    assert parse_comma_amount("-") is None
    assert parse_comma_amount(None) is None


# ---------------------------------------------------------------------------
# parse_comma_amount 경계 가드 (세션558 적대검증)
#
# 이 함수의 반환값은 전부 PostgreSQL INTEGER(INT4) 컬럼에 들어간다
# (ApplyhomeUnitSupply.top_amount · RentalUnitSupply.supply_amount /
#  subscrpt_reqst_amount 등). 그래서 두 종류의 오버플로를 함께 막아야 한다:
#
#   ① Python 단계 — int(float("1e400")) 은 ValueError 가 아니라 OverflowError
#   ② DB 단계 — 파싱에 성공해도 INT4 범위를 넘으면 INSERT 에서
#      NumericValueOutOfRange("integer out of range") 로 죽는다.
#      실측: `"9"*20` → 1e20 → 파싱 성공 → INSERT 실패.
#
# ②를 안 막으면 값 하나 때문에 그 배치의 나머지 행까지 롤백된다(주 1회 잡이라
# 다음 주까지 데이터가 비는 것).
# ---------------------------------------------------------------------------


def test_parse_comma_amount_rejects_infinity():
    """무한대로 발산하는 문자열 — Python OverflowError 경로."""
    assert parse_comma_amount("1e400") is None
    assert parse_comma_amount("inf") is None
    assert parse_comma_amount("-inf") is None
    assert parse_comma_amount("nan") is None


def test_parse_comma_amount_rejects_int4_overflow():
    """파싱은 되지만 INT4 를 넘는 값 — DB INSERT 를 죽이는 경로."""
    assert parse_comma_amount("99999999999999999999") is None
    assert parse_comma_amount("2147483648") is None      # INT4 최대 +1
    assert parse_comma_amount("-2147483649") is None     # INT4 최소 -1


def test_parse_comma_amount_keeps_int4_boundary_values():
    """경계값 자체는 유효하므로 살려야 한다(과잉 차단 방지)."""
    assert parse_comma_amount("2147483647") == 2147483647
    assert parse_comma_amount("-2147483648") == -2147483648
