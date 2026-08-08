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
