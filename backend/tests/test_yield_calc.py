"""수익률 계산 테스트 — _calc_rent_yield · 매물 전세가율 옛 칸 삭제 확인(세션 497)
실행: python -m pytest tests/test_yield_calc.py -v
"""
from db.models import Article
from routers.estate_serializers import article_to_dict


def _art(**kw):
    defaults = dict(article_no="A001", complex_no="C001", trade_type_name="매매", is_active=True, area2_m2=59.0, numeric_price=30000)
    defaults.update(kw)
    return Article(**defaults)


# --- 월세 수익률 ---

def test_rent_yield_basic():
    """월세 50만, 보증금 5000만 → 수익률 12%"""
    a = _art(trade_type_name="월세", numeric_price=5000, numeric_rent_price=50)
    d = article_to_dict(a)
    assert d["monthly_rent_yield"] == 12.0


def test_rent_yield_high():
    """월세 100만, 보증금 10000만 → 수익률 12%"""
    a = _art(trade_type_name="월세", numeric_price=10000, numeric_rent_price=100)
    d = article_to_dict(a)
    assert d["monthly_rent_yield"] == 12.0


def test_rent_yield_none_for_sale():
    """매매 매물은 수익률 None"""
    a = _art(trade_type_name="매매", numeric_price=50000)
    d = article_to_dict(a)
    assert d["monthly_rent_yield"] is None


def test_rent_yield_none_for_jeonse():
    """전세 매물은 월세 수익률 None"""
    a = _art(trade_type_name="전세", numeric_price=30000)
    d = article_to_dict(a)
    assert d["monthly_rent_yield"] is None


def test_rent_yield_zero_deposit():
    """보증금 0이면 수익률 None (division by zero 방지)"""
    a = _art(trade_type_name="월세", numeric_price=0, numeric_rent_price=50)
    d = article_to_dict(a)
    assert d["monthly_rent_yield"] is None


def test_rent_yield_no_rent_price():
    """월세액 없으면 수익률 None"""
    a = _art(trade_type_name="월세", numeric_price=5000, numeric_rent_price=None)
    d = article_to_dict(a)
    assert d["monthly_rent_yield"] is None


# --- 전세가율 ---

# 세션 497 B29: 옛 한 값 article_jeonse_ratio(같은 면적 6개월 중위 분모)는 응답에서 삭제했다.
# 범위 두 칸(article_jeonse_ratio_min/max)만 남는다 — 범위 계산 시험은 test_area_price_range_b29.py.

def test_article_jeonse_ratio_옛칸_없음():
    """전세 매물이어도 옛 한 값 칸은 없고, 범위 두 칸은 분모(area_ranges)를 안 넘기면 None"""
    a = _art(trade_type_name="전세", numeric_price=30000)
    d = article_to_dict(a)
    assert "article_jeonse_ratio" not in d
    assert d["article_jeonse_ratio_min"] is None
    assert d["article_jeonse_ratio_max"] is None
