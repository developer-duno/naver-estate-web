"""수익률 계산 테스트 — _calc_rent_yield, _calc_jeonse_ratio
실행: python -m pytest tests/test_yield_calc.py -v
"""
from db.models import Article, Complex
from routers.estate_serializers import article_to_dict


def _art(**kw):
    defaults = dict(article_no="A001", complex_no="C001", trade_type_name="매매", is_active=True, area2_m2=59.0, numeric_price=30000)
    defaults.update(kw)
    return Article(**defaults)


def _cpx(**kw):
    defaults = dict(complex_no="C001", complex_name="오피스텔A", sido="서울", sigungu="강남", heat_method_type="개별난방")
    defaults.update(kw)
    return Complex(**defaults)


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

# 세션 474 B27: 분모 = 매물 전용면적 묶음(59.0㎡ → 59)의 6개월 정부 실거래 중위(area_stats).
# 옛 분모 nearby_median_price(여러 면적이 섞인 값)는 더 쓰지 않는다 — 옛 시험 5건을 그 기준으로 정정.

def test_jeonse_ratio_basic():
    """전세 30000만 / 같은 면적(59㎡ 대) 매매중위 50000만 → 60.0%"""
    a = _art(trade_type_name="전세", numeric_price=30000)
    c = _cpx(nearby_median_price=99999)
    d = article_to_dict(a, c, {59: 50000, 84: 70000})
    assert d["article_jeonse_ratio"] == 60.0


def test_jeonse_ratio_none_without_complex():
    """complex_obj 없으면 전세가율 None"""
    a = _art(trade_type_name="전세", numeric_price=30000)
    d = article_to_dict(a)
    assert d["article_jeonse_ratio"] is None


def test_jeonse_ratio_none_no_median():
    """같은 면적 묶음 값이 없으면 전세가율 None — 다른 면적·섞인 값(nearby)으로 나누지 않는다"""
    a = _art(trade_type_name="전세", numeric_price=30000)
    c = _cpx(nearby_median_price=50000)
    assert article_to_dict(a, c, {84: 70000})["article_jeonse_ratio"] is None
    assert article_to_dict(a, c)["article_jeonse_ratio"] is None


def test_jeonse_ratio_none_for_sale():
    """매매 매물은 전세가율 None"""
    a = _art(trade_type_name="매매", numeric_price=50000)
    c = _cpx(nearby_median_price=50000)
    d = article_to_dict(a, c, {59: 50000})
    assert d["article_jeonse_ratio"] is None


def test_jeonse_ratio_zero_median():
    """매매중위가 0이면 전세가율 None (division by zero 방지)"""
    a = _art(trade_type_name="전세", numeric_price=30000)
    c = _cpx(nearby_median_price=0)
    d = article_to_dict(a, c, {59: 0})
    assert d["article_jeonse_ratio"] is None
