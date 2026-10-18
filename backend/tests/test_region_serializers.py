"""정부 지역 값·공식 기준값 직렬화 시험 (세션 473) — 단지 상세 전세가율 · 매물 상세 전환율·법정 상한.

전환율 산식 = 한국부동산원 월세 × 12 ÷ (전세가격 − 월세보증금) × 100. 전세가격 = 같은 단지·같은 평형 네이버 주간
전세 시세(B1, base_month 8자리) 최근 값. 매물 면적은 소수 버린 정수라 평형도 버림 값으로 대조한다.
"""

from types import SimpleNamespace

from db.models import Complex, ComplexPriceHistory, ComplexPyeongDetail, RegionStats
from routers.region_serializers import (
    article_region_fields,
    calc_rent_conversion_rate,
    complex_region_fields,
)

J = "reb_apt_jeonse_ratio_median"
C = "reb_rent_conversion_rate"


def _stat(db, code, period, value, stat):
    db.add(RegionStats(region_code=code, period=period, stat_code=stat, value=value, source="시험"))


def _complex(db, no="90001", cortar="4413110100"):
    c = Complex(complex_no=no, complex_name=f"단지{no}", cortar_no=cortar)
    db.add(c)
    db.commit()
    return c


def _pyeong(db, cno, pno, exclusive, supply):
    db.add(ComplexPyeongDetail(complex_no=cno, pyeong_no=pno, exclusive_area=exclusive, supply_area_double=supply))


def _jeonse(db, cno, area_no, base_month, price):
    db.add(ComplexPriceHistory(complex_no=cno, trade_type="B1", area_no=str(area_no), price_avg=price,
                               price_upper=price, price_lower=price, base_month=base_month))


def _wolse(cno="90001", rent=100, deposit=5000, area1=78.0, area2=59.0, kind="월세"):
    return SimpleNamespace(complex_no=cno, trade_type_name=kind, numeric_rent_price=rent, numeric_price=deposit,
                           area1_m2=area1, area2_m2=area2)


# ── 산식 ──

def test_conversion_formula_example():
    """지시서 예시: 월세 100 · 보증금 5,000 · 같은 평형 전세 30,000 → 100×12÷25,000×100 = 4.8"""
    assert calc_rent_conversion_rate(100, 5000, 30000) == 4.8


def test_conversion_formula_bad_denominator_or_missing():
    assert calc_rent_conversion_rate(100, 30000, 30000) is None   # 분모 0
    assert calc_rent_conversion_rate(100, 40000, 30000) is None   # 분모 음수
    assert calc_rent_conversion_rate(None, 5000, 30000) is None
    assert calc_rent_conversion_rate(100, 5000, None) is None


# ── 단지 상세 ──

def test_complex_region_fields_latest_month(db):
    c = _complex(db)
    _stat(db, "44131", "202512", 78.04, J)
    _stat(db, "44131", "202601", 79.4366, J)
    db.commit()
    f = complex_region_fields(db, c)
    assert f["region_jeonse_ratio"] == 79.4
    assert f["region_jeonse_period"] == "2026.01"
    assert f["region_name"] == "천안시 동남구"          # 시도 이름 없이 시군구 이름만
    assert "전국주택가격동향조사" in f["region_jeonse_source"]


def test_complex_region_fields_empty_when_no_value(db):
    c = _complex(db, "90002", "4117110100")
    f = complex_region_fields(db, c)
    assert f == {"region_jeonse_ratio": None, "region_jeonse_period": None, "region_name": None,
                 "region_jeonse_source": None}


def test_complex_detail_api_carries_region_fields(client, db, monkeypatch):
    """단지 상세 API 에 실린다(필터 옵션은 PostgreSQL unnest 라 SQLite 에서 가짜로 — test_complexes_router 선례)."""
    import routers.complexes as complexes_mod

    monkeypatch.setattr(complexes_mod.queries, "get_filter_options", lambda db, no: {})
    _complex(db, "90003", "4413110100")
    _stat(db, "44131", "202601", 79.41, J)
    db.commit()
    res = client.get("/api/complexes/90003")
    assert res.status_code == 200
    body = res.json()
    assert (body["region_jeonse_ratio"], body["region_jeonse_period"], body["region_name"]) == (79.4, "2026.01", "천안시 동남구")


# ── 매물 상세 ──

def test_article_fields_wolse_full(db):
    c = _complex(db, "90010", "4812110100")   # 창원 의창구 → 시도 경남
    _pyeong(db, "90010", 1, "59.94", 78.26)
    _pyeong(db, "90010", 5, "84.96", 110.56)
    _jeonse(db, "90010", 1, "20261001", 29000)
    _jeonse(db, "90010", 1, "20261008", 30000)
    _jeonse(db, "90010", 1, "202609", 1)       # 월 단위(실거래) 행은 안 본다
    _stat(db, "48000", "202601", 5.94, C)
    db.commit()
    f = article_region_fields(db, _wolse("90010"), c)
    assert f["article_rent_conversion_rate"] == 4.8
    assert f["article_rent_conversion_basis"] == "네이버 시세 전세가 기준(같은 평형, 2026.10.08)"
    assert (f["region_rent_conversion_rate"], f["region_rent_conversion_name"], f["region_rent_conversion_period"]) == (5.9, "경남", "2026.01")
    assert (f["legal_rent_conversion_cap"], f["bok_base_rate"], f["bok_base_rate_date"]) == (5.0, 3.0, "2026-08-27")


def test_article_fields_ambiguous_pyeong_is_none(db):
    """같은 버림 면적 평형 둘이 모두 전세 시세를 가지면 어느 평형인지 몰라 비운다(지어내지 않음)."""
    c = _complex(db, "90011", "4812110100")
    _pyeong(db, "90011", 1, "59.94", 78.26)
    _pyeong(db, "90011", 2, "59.85", 78.31)
    _jeonse(db, "90011", 1, "20261008", 30000)
    _jeonse(db, "90011", 2, "20261008", 31000)
    db.commit()
    assert article_region_fields(db, _wolse("90011"), c)["article_rent_conversion_rate"] is None


def test_article_fields_no_same_pyeong_jeonse_is_none(db):
    c = _complex(db, "90012", "4812110100")
    _pyeong(db, "90012", 5, "84.96", 110.56)
    _jeonse(db, "90012", 5, "20261008", 30000)   # 다른 평형의 시세뿐
    db.commit()
    assert article_region_fields(db, _wolse("90012"), c)["article_rent_conversion_rate"] is None


def test_article_fields_non_wolse_has_only_constants(db):
    c = _complex(db, "90013", "4812110100")
    _stat(db, "48000", "202601", 5.94, C)
    db.commit()
    f = article_region_fields(db, _wolse("90013", kind="전세"), c)
    assert f["region_rent_conversion_rate"] is None
    assert f["article_rent_conversion_rate"] is None
    assert f["legal_rent_conversion_cap"] == 5.0


def test_article_fields_gwangju_uses_name_not_prefix(db):
    """전남광주 체계(12xxx) 광주 동구 매물 → 시도 = 광주(29000), 전남(46000) 값과 안 섞인다."""
    c = _complex(db, "90014", "1221010100")
    _stat(db, "29000", "202601", 6.1, C)
    _stat(db, "46000", "202601", 7.27, C)
    db.commit()
    f = article_region_fields(db, _wolse("90014"), c)
    assert (f["region_rent_conversion_rate"], f["region_rent_conversion_name"]) == (6.1, "광주")
