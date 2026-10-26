"""세션 482 PR 1b — 소비자 단지 화면용 공개 API 두 가지(B1 공개 가격 기록 · B2 지역 흐름).

인증 없이 200 · 네이버 재료 칸 0 · 직거래 제외 규칙은 그래프 정부 줄과 같은 gov_month_range.
실행: python -m pytest tests/test_public_history_s482.py -q
"""
from decimal import Decimal

from crawler.metrics_helpers import _cutoff_month
from db.area_price_queries import gov_month_range
from db.models import Complex, ComplexAreaTradeStat, RegionStats
from db.price_queries import BASELINE_MONTHS

NO = "S482"
B1_KEYS = {"area_m2", "months", "two_year", "basis"}
B1_MONTH_KEYS = {"month", "trade_count", "price_min", "price_max", "price_median"}
B2_KEYS = {"region_code", "region_name", "source", "items"}


def _month_shift(ym: str, delta: int) -> str:
    total = int(ym[:4]) * 12 + int(ym[4:]) - 1 + delta
    y, m0 = divmod(total, 12)
    return f"{y:04d}{m0 + 1:02d}"


CUTOFF = _cutoff_month(BASELINE_MONTHS)          # 24개월 창의 첫 달(포함)
BEFORE = _month_shift(CUTOFF, -1)                # 25개월 전 달(제외)


def _complex(db, no=NO, rep=59, cortar="3020012300"):
    db.add(Complex(complex_no=no, complex_name="공개기록단지", sido="대전", sigungu="유성구",
                   cortar_no=cortar, rep_area_m2=rep))
    db.commit()


def _stat(db, month, area=59, prices=(15700, 18000), trades=None, no=NO):
    prices = sorted(prices)
    db.add(ComplexAreaTradeStat(
        complex_no=no, base_month=month, area_m2=area, trade_count=len(prices),
        price_median=prices[len(prices) // 2], price_min=prices[0], price_max=prices[-1],
        prices=list(prices), trades=trades or [],
    ))
    db.commit()


# ── 순수 함수 ──────────────────────────────────────────────────────────────


def test_gov_month_range_trades_있으면_직거래_빼고_세고_비면_저장값():
    trades = [{"p": 14000, "g": "직거래"}, {"p": 15700, "g": "중개거래"}, {"p": 18000, "g": "중개거래"}]
    assert gov_month_range(14000, 18000, trades, 3) == (15700, 18000, 2)
    assert gov_month_range(14000, 18000, [], 3) == (14000, 18000, 3)
    assert gov_month_range(14000, 14000, [{"p": 14000, "g": "직거래"}], 1) == (None, None, 0)


# ── B1 공개 가격 기록 ────────────────────────────────────────────────────────


def test_B1_비로그인_200_키_스냅샷_캐시_헤더(client, db):
    _complex(db)
    _stat(db, CUTOFF)
    res = client.get(f"/api/complexes/{NO}/public-price-history")
    assert res.status_code == 200
    assert res.headers["cache-control"] == "public, max-age=3600"
    body = res.json()
    assert set(body) == B1_KEYS
    assert body["area_m2"] == 59                                  # 면적 없으면 대표 면적
    assert set(body["months"][0]) == B1_MONTH_KEYS
    assert body["two_year"] == {"min": 15700, "max": 18000, "count": 2}
    assert "59㎡" in body["basis"] and "네이버" not in body["basis"]


def test_B1_직거래_제외(client, db):
    _complex(db)
    _stat(db, CUTOFF, prices=(14700, 15700, 18000), trades=[
        {"p": 14700, "d": f"{CUTOFF[:4]}-{CUTOFF[4:]}-03", "f": 3, "g": "직거래"},
        {"p": 15700, "d": f"{CUTOFF[:4]}-{CUTOFF[4:]}-10", "f": 7, "g": "중개거래"},
        {"p": 18000, "d": f"{CUTOFF[:4]}-{CUTOFF[4:]}-20", "f": 12, "g": "중개거래"},
    ])
    m = client.get(f"/api/complexes/{NO}/public-price-history").json()["months"][0]
    assert (m["price_min"], m["price_max"], m["trade_count"]) == (15700, 18000, 2)


def test_B1_직거래만_있던_달은_빠진다(client, db):
    _complex(db)
    _stat(db, CUTOFF, prices=(14000,), trades=[{"p": 14000, "g": "직거래"}])
    body = client.get(f"/api/complexes/{NO}/public-price-history").json()
    assert body["months"] == [] and body["two_year"] is None


def test_B1_24개월_경계_25개월_전_달_제외(client, db):
    _complex(db)
    _stat(db, BEFORE, prices=(10000, 30000))
    _stat(db, CUTOFF, prices=(15200, 18000))
    body = client.get(f"/api/complexes/{NO}/public-price-history").json()
    assert [m["month"] for m in body["months"]] == [CUTOFF]
    assert body["two_year"] == {"min": 15200, "max": 18000, "count": 2}


def test_B1_면적_지정과_다른_면적_분리(client, db):
    _complex(db)
    _stat(db, CUTOFF, area=59, prices=(15700, 18000))
    _stat(db, CUTOFF, area=84, prices=(22000, 23000))
    body = client.get(f"/api/complexes/{NO}/public-price-history?area_m2=84").json()
    assert body["area_m2"] == 84
    assert body["two_year"] == {"min": 22000, "max": 23000, "count": 2}


def test_B1_자료_없는_단지_200_빈_목록_대표면적도_없으면_area_None(client, db):
    _complex(db, rep=None)
    res = client.get(f"/api/complexes/{NO}/public-price-history")
    assert res.status_code == 200
    assert res.json() == {"area_m2": None, "months": [], "two_year": None, "basis": None}


def test_B1_없는_단지_404_캐시_헤더_없음(client, db):
    res = client.get("/api/complexes/NOPE482/public-price-history")
    assert res.status_code == 404
    assert "cache-control" not in res.headers


# ── B2 지역 흐름 ─────────────────────────────────────────────────────────────


def _region(db, code, period, jeonse=None, sale=None):
    if jeonse is not None:
        db.add(RegionStats(region_code=code, period=period, stat_code="reb_apt_jeonse_ratio_median",
                           value=Decimal(str(jeonse)), source="A_2024_00073"))
    if sale is not None:
        db.add(RegionStats(region_code=code, period=period, stat_code="reb_apt_sale_price_median",
                           value=Decimal(str(sale)), source="A_2024_00062"))
    db.commit()


def test_B2_24줄_키_스냅샷_캐시_헤더(client, db):
    _complex(db)
    _region(db, "30200", BEFORE, jeonse=60.0, sale=30000)              # 창 밖 — 빠진다
    for i in range(24):
        _region(db, "30200", _month_shift(CUTOFF, i), jeonse=69.2 + i * 0.01, sale=40000 + i * 25)
    _region(db, "30100", CUTOFF, jeonse=50.0, sale=1)                  # 다른 지역 — 빠진다
    res = client.get(f"/api/complexes/{NO}/region-trend")
    assert res.status_code == 200
    assert res.headers["cache-control"] == "public, max-age=3600"
    body = res.json()
    assert set(body) == B2_KEYS
    assert (body["region_code"], body["region_name"]) == ("30200", "유성구")
    assert body["source"] == "한국부동산원 전국주택가격동향조사"
    assert len(body["items"]) == 24
    assert body["items"][0] == {"period": CUTOFF, "jeonse_ratio": 69.2, "sale_price_median": 40000}
    assert body["items"][-1]["sale_price_median"] == 40575


def test_B2_한_통계만_있는_달은_다른_칸_None(client, db):
    _complex(db)
    _region(db, "30200", CUTOFF, jeonse=69.5454)
    items = client.get(f"/api/complexes/{NO}/region-trend").json()["items"]
    assert items == [{"period": CUTOFF, "jeonse_ratio": 69.5454, "sale_price_median": None}]


def test_B2_지역_연결_없음_200_빈_목록(client, db):
    _complex(db, cortar=None)
    res = client.get(f"/api/complexes/{NO}/region-trend")
    assert res.status_code == 200
    body = res.json()
    assert set(body) == B2_KEYS and body["items"] == [] and body["region_code"] is None


def test_B2_세종은_시도_줄로(client, db):
    _complex(db, cortar="3611011000")
    _region(db, "36000", CUTOFF, jeonse=55.0, sale=35000)
    body = client.get(f"/api/complexes/{NO}/region-trend").json()
    assert body["region_name"] == "세종시"
    assert body["items"] == [{"period": CUTOFF, "jeonse_ratio": 55.0, "sale_price_median": 35000}]
