"""mibunyang API 라우터 통합 테스트
실행: python -m pytest tests/test_mb_router.py -v
"""

from datetime import date

from db.mb_models import Apartment, MBRegion, MBTrade, UnsoldHistory

# ── 팩토리 함수 ──────────────────────────────────────────────


def _add_apartment(db, id_="APT001", name="테스트아파트", region="서울", **kw):
    defaults = dict(id=id_, name=name, region=region, gu="강남", dong="역삼동")
    defaults.update(kw)
    a = Apartment(**defaults)
    db.add(a)
    db.commit()
    return a


def _add_trade(db, region="서울", **kw):
    defaults = dict(region=region, gu="강남", dong="역삼동", recorded_at=date.today())
    defaults.update(kw)
    t = MBTrade(**defaults)
    db.add(t)
    db.commit()
    return t


# ── 아파트 API ───────────────────────────────────────────────


def test_apartments_200(client, db):
    """지역별 아파트 조회 성공"""
    _add_apartment(db, "APT001", "래미안", region="서울")
    res = client.get("/api/mb/apartments?region=서울")
    assert res.status_code == 200
    data = res.json()
    assert "apartments" in data
    assert data["total"] == 1
    assert data["page"] == 1


def test_apartments_empty_200(client, db):
    """빈 결과 → 200, total=0"""
    res = client.get("/api/mb/apartments?region=제주")
    assert res.status_code == 200
    data = res.json()
    assert data["apartments"] == []
    assert data["total"] == 0


def test_apartments_missing_region_422(client):
    """region 파라미터 누락 → 422"""
    res = client.get("/api/mb/apartments")
    assert res.status_code == 422


def test_apartment_detail_200(client, db):
    """아파트 상세 조회 성공"""
    _add_apartment(db, "APT001", "래미안", region="서울", unsold=30)
    res = client.get("/api/mb/apartments/APT001")
    assert res.status_code == 200
    data = res.json()
    assert data["id"] == "APT001"
    assert data["name"] == "래미안"


def test_apartment_detail_404(client):
    """없는 아파트 → 404"""
    res = client.get("/api/mb/apartments/NONE")
    assert res.status_code == 404


# ── 미분양 API ───────────────────────────────────────────────


def test_unsold_200(client, db):
    """미분양 조회 성공"""
    _add_apartment(db, "APT001", "래미안", region="서울", unsold=50)
    _add_apartment(db, "APT002", "자이", region="서울", unsold=0)
    res = client.get("/api/mb/unsold?region=서울")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 1  # unsold > 0만


def test_unsold_history_200(client, db):
    """미분양 추이 조회 성공"""
    _add_apartment(db, "APT001")
    db.add(UnsoldHistory(apartment_id="APT001", base_month="202603", unsold_count=60, recorded_at=date.today()))
    db.commit()
    res = client.get("/api/mb/unsold/APT001/history")
    assert res.status_code == 200
    data = res.json()
    assert data["apartment_id"] == "APT001"
    assert len(data["items"]) == 1


# ── 지역 통계 API ────────────────────────────────────────────


def test_regions_200(client, db):
    """지역 통계 조회 성공"""
    db.add(MBRegion(region="서울", gu="강남", population=500000, recorded_at=date.today()))
    db.commit()
    res = client.get("/api/mb/regions?region=서울")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 1
    assert data["regions"][0]["population"] == 500000


# ── 실거래 API ───────────────────────────────────────────────


def test_trades_200(client, db):
    """실거래 조회 성공"""
    _add_trade(db, region="서울", price=80000, deal_month="202603")
    res = client.get("/api/mb/trades?region=서울")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 1
    assert "trades" in data


def test_trades_pagination(client, db):
    """실거래 페이지네이션"""
    for i in range(3):
        _add_trade(db, region="서울", price=50000 + i * 1000, deal_month=f"20260{i+1}")
    res = client.get("/api/mb/trades?region=서울&page=1&page_size=2")
    assert res.status_code == 200
    data = res.json()
    assert len(data["trades"]) == 2
    assert data["total"] == 3


# ── 정렬 + 키워드 API ───────────────────────────────────────


def test_apartments_sort_by_unsold_desc(client, db):
    """sort_by=unsold_desc → 200 정상 응답"""
    _add_apartment(db, "APT001", "래미안", region="서울", unsold=10)
    _add_apartment(db, "APT002", "자이", region="서울", unsold=50)
    res = client.get("/api/mb/apartments?region=서울&sort_by=unsold_desc")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 2
    # unsold 내림차순 → 자이(50)가 첫 번째
    assert data["apartments"][0]["name"] == "자이"


def test_apartments_keyword_search(client, db):
    """keyword 검색 → 200 + 필터링 결과"""
    _add_apartment(db, "APT001", "래미안퍼스티지", region="서울")
    _add_apartment(db, "APT002", "자이더빌리지", region="서울")
    res = client.get("/api/mb/apartments?region=서울&keyword=래미안")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 1
    assert data["apartments"][0]["name"] == "래미안퍼스티지"


def test_apartments_invalid_sort_by_422(client):
    """잘못된 sort_by → 422 유효성 검증 실패"""
    res = client.get("/api/mb/apartments?region=서울&sort_by=invalid")
    assert res.status_code == 422


def test_apartments_keyword_too_short_422(client):
    """keyword 1글자 → 422 (min_length=2)"""
    res = client.get("/api/mb/apartments?region=서울&keyword=a")
    assert res.status_code == 422


def test_unsold_sort_by_param(client, db):
    """미분양 sort_by=name_asc → 200"""
    _add_apartment(db, "APT001", "래미안", region="서울", unsold=30)
    _add_apartment(db, "APT002", "자이", region="서울", unsold=50)
    res = client.get("/api/mb/unsold?region=서울&sort_by=name_asc")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 2


def test_trades_sort_by_price(client, db):
    """실거래 sort_by=price_desc → 200"""
    _add_trade(db, region="서울", price=80000, deal_month="202603")
    _add_trade(db, region="서울", price=50000, deal_month="202602")
    res = client.get("/api/mb/trades?region=서울&sort_by=price_desc")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 2
    # price 내림차순 → 80000이 첫 번째
    assert data["trades"][0]["price"] == 80000
