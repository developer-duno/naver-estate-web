"""미분양 거래 통계 직렬화 — 단지 단위 전세가율 칸 (세션 471)

운영 표 trade_stats.complex_jeonse_rate 는 NUMERIC(5,1) 이라 psycopg2 가 Decimal 로 준다.
응답은 JSON 숫자(float)여야 하고, 값이 없으면 None 이어야 한다(화면이 "-" 를 찍는다).
실행: python -m pytest tests/test_mb_serializers_complex_jeonse.py -q
"""
from decimal import Decimal

from db.mb_models import TradeStats
from routers.mb_serializers import trade_stats_to_dict


def _make_trade_stats(**kw):
    defaults = dict(apartment_id="APT001", jeonse_rate=65.3)
    defaults.update(kw)
    return TradeStats(**defaults)


def test_complex_jeonse_rate_decimal_becomes_float():
    """Decimal('61.2') 는 float 61.2 로, 표본 건수는 그대로 나간다"""
    d = trade_stats_to_dict(
        _make_trade_stats(complex_jeonse_rate=Decimal("61.2"), complex_jeonse_n=8, complex_sale_n=15)
    )
    assert d["complex_jeonse_rate"] == 61.2
    assert type(d["complex_jeonse_rate"]) is float
    assert d["complex_jeonse_n"] == 8
    assert d["complex_sale_n"] == 15
    # 구 단위 값은 다른 키로 그대로 — 두 값이 섞이지 않는다
    assert d["jeonse_rate"] == 65.3


def test_complex_jeonse_rate_none_stays_none():
    """표본이 없어 값이 NULL 이면 None (건수는 적혀 있을 수 있다)"""
    d = trade_stats_to_dict(_make_trade_stats(complex_jeonse_rate=None, complex_jeonse_n=1, complex_sale_n=0))
    assert d["complex_jeonse_rate"] is None
    assert d["complex_jeonse_n"] == 1
    assert d["complex_sale_n"] == 0
