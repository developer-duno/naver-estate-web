"""단지 공동주택 공시가격 API 테스트 (PR-B) — 무료 공개, 게이트 없음"""

from decimal import Decimal

from db.models import Complex, ComplexOfficialPrice


def _add_complex(db, no="C001", name="래미안"):
    c = Complex(complex_no=no, complex_name=name)
    db.add(c)
    db.commit()
    return c


def _add_official_price(db, complex_no="C001", stdr_year="2026", prvuse_ar="84.99",
                         price_median=1_000_000_000, ho_count=100, **kw):
    p = ComplexOfficialPrice(
        complex_no=complex_no,
        stdr_year=stdr_year,
        prvuse_ar=Decimal(prvuse_ar),
        price_median=price_median,
        ho_count=ho_count,
        **kw,
    )
    db.add(p)
    db.commit()
    return p


def test_official_prices_no_auth_required_200(client, db):
    """게이트 없음 — 인증 헤더 없이도 200 (공시가격은 무료 공개, 플랜 §0-2)"""
    _add_complex(db, "CAUTH")
    _add_official_price(db, complex_no="CAUTH")

    res = client.get("/api/complexes/CAUTH/official-prices")

    assert res.status_code == 200


def test_official_prices_normal(client, db):
    """정상 조회: 최신 연도의 평형별 공시가격 반환"""
    _add_complex(db, "CNORM")
    _add_official_price(db, complex_no="CNORM", stdr_year="2026", prvuse_ar="84.99", price_median=1_200_000_000, ho_count=120)

    res = client.get("/api/complexes/CNORM/official-prices")

    assert res.status_code == 200
    data = res.json()
    assert data["complex_no"] == "CNORM"
    assert data["year"] == "2026"
    assert len(data["items"]) == 1
    assert data["items"][0]["prvuse_ar"] == 84.99
    assert data["items"][0]["price_median"] == 1_200_000_000
    assert data["items"][0]["ho_count"] == 120


def test_official_prices_empty(client, db):
    """데이터 없는 단지 → items:[] + year:None (404 아님)"""
    _add_complex(db, "C999")

    res = client.get("/api/complexes/C999/official-prices")

    assert res.status_code == 200
    data = res.json()
    assert data["complex_no"] == "C999"
    assert data["year"] is None
    assert data["items"] == []


def test_official_prices_multi_area_sorted_asc(client, db):
    """복수 평형은 prvuse_ar 오름차순 정렬"""
    _add_complex(db, "CSORT")
    _add_official_price(db, complex_no="CSORT", prvuse_ar="114.98", price_median=1_500_000_000, ho_count=50)
    _add_official_price(db, complex_no="CSORT", prvuse_ar="59.96", price_median=800_000_000, ho_count=200)
    _add_official_price(db, complex_no="CSORT", prvuse_ar="84.99", price_median=1_200_000_000, ho_count=120)

    res = client.get("/api/complexes/CSORT/official-prices")

    assert res.status_code == 200
    items = res.json()["items"]
    assert [item["prvuse_ar"] for item in items] == [59.96, 84.99, 114.98]


def test_official_prices_latest_year_only(client, db):
    """여러 연도 쌓이면 최신 연도(max stdr_year)만 반환"""
    _add_complex(db, "CYEAR")
    _add_official_price(db, complex_no="CYEAR", stdr_year="2025", prvuse_ar="84.99", price_median=1_100_000_000, ho_count=110)
    _add_official_price(db, complex_no="CYEAR", stdr_year="2026", prvuse_ar="84.99", price_median=1_200_000_000, ho_count=120)

    res = client.get("/api/complexes/CYEAR/official-prices")

    assert res.status_code == 200
    data = res.json()
    assert data["year"] == "2026"
    assert len(data["items"]) == 1
    assert data["items"][0]["price_median"] == 1_200_000_000
