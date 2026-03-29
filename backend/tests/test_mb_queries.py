"""mibunyang 쿼리 단위 테스트
실행: python -m pytest tests/test_mb_queries.py -v
"""

from datetime import date

from db import mb_queries
from db.mb_models import Apartment, MBRegion, MBTrade, UnsoldHistory


# ── 팩토리 함수 ──────────────────────────────────────────────


def _add_apartment(db, id_="APT001", name="테스트아파트", region="서울", **kw):
    defaults = dict(id=id_, name=name, region=region, gu="강남", dong="역삼동")
    defaults.update(kw)
    a = Apartment(**defaults)
    db.add(a)
    db.commit()
    return a


def _add_unsold_history(db, apartment_id="APT001", base_month="202603", **kw):
    defaults = dict(apartment_id=apartment_id, base_month=base_month, recorded_at=date.today())
    defaults.update(kw)
    u = UnsoldHistory(**defaults)
    db.add(u)
    db.commit()
    return u


def _add_region(db, region="서울", gu="강남", **kw):
    defaults = dict(region=region, gu=gu, recorded_at=date.today())
    defaults.update(kw)
    r = MBRegion(**defaults)
    db.add(r)
    db.commit()
    return r


def _add_trade(db, region="서울", **kw):
    defaults = dict(region=region, gu="강남", dong="역삼동", recorded_at=date.today())
    defaults.update(kw)
    t = MBTrade(**defaults)
    db.add(t)
    db.commit()
    return t


# ── 아파트 조회 ──────────────────────────────────────────────


def test_get_apartments_by_region(db):
    """지역별 아파트 조회 성공"""
    _add_apartment(db, "APT001", "래미안", region="서울", gu="강남")
    _add_apartment(db, "APT002", "자이", region="서울", gu="서초")
    _add_apartment(db, "APT003", "힐스", region="경기")

    results = mb_queries.get_apartments(db, region="서울")
    assert len(results) == 2


def test_get_apartments_by_region_and_gu(db):
    """시도+시군구 필터링"""
    _add_apartment(db, "APT001", "래미안", region="서울", gu="강남")
    _add_apartment(db, "APT002", "자이", region="서울", gu="서초")

    results = mb_queries.get_apartments(db, region="서울", gu="강남")
    assert len(results) == 1
    assert results[0].name == "래미안"


def test_get_apartments_empty(db):
    """빈 결과 → 빈 리스트"""
    results = mb_queries.get_apartments(db, region="제주")
    assert results == []


def test_count_apartments(db):
    """아파트 수 카운트"""
    _add_apartment(db, "APT001", region="서울")
    _add_apartment(db, "APT002", region="서울")
    assert mb_queries.count_apartments(db, region="서울") == 2
    assert mb_queries.count_apartments(db, region="부산") == 0


def test_get_apartment_by_id(db):
    """아파트 상세 조회"""
    _add_apartment(db, "APT001", "래미안")
    apt = mb_queries.get_apartment_by_id(db, "APT001")
    assert apt is not None
    assert apt.name == "래미안"


def test_get_apartment_by_id_not_found(db):
    """없는 아파트 → None"""
    assert mb_queries.get_apartment_by_id(db, "NONE") is None


# ── 미분양 ───────────────────────────────────────────────────


def test_get_unsold_by_region(db):
    """미분양 아파트 조회 (unsold > 0)"""
    _add_apartment(db, "APT001", "래미안", region="서울", unsold=50)
    _add_apartment(db, "APT002", "자이", region="서울", unsold=0)
    _add_apartment(db, "APT003", "힐스", region="서울", unsold=None)

    results = mb_queries.get_unsold_by_region(db, region="서울")
    assert len(results) == 1
    assert results[0].unsold == 50


def test_get_unsold_history(db):
    """미분양 추이 조회"""
    _add_apartment(db, "APT001")
    _add_unsold_history(db, "APT001", "202601", unsold_count=100)
    _add_unsold_history(db, "APT001", "202602", unsold_count=80)
    _add_unsold_history(db, "APT001", "202603", unsold_count=60)

    results = mb_queries.get_unsold_history(db, "APT001", limit=2)
    # 최신순 정렬이므로 202603, 202602
    assert len(results) == 2
    assert results[0].base_month == "202603"


# ── 지역 통계 ────────────────────────────────────────────────


def test_get_region_stats(db):
    """지역 통계 조회"""
    _add_region(db, "서울", "강남", population=500000)
    _add_region(db, "서울", "서초", population=400000)

    results = mb_queries.get_region_stats(db, region="서울")
    assert len(results) == 2


def test_get_region_stats_with_gu(db):
    """시군구 필터링"""
    _add_region(db, "서울", "강남", population=500000)
    _add_region(db, "서울", "서초", population=400000)

    results = mb_queries.get_region_stats(db, region="서울", gu="강남")
    assert len(results) == 1


# ── 실거래 ───────────────────────────────────────────────────


def test_get_trades(db):
    """실거래 조회"""
    _add_trade(db, region="서울", gu="강남", price=80000, deal_month="202603")
    _add_trade(db, region="서울", gu="서초", price=70000, deal_month="202602")

    results = mb_queries.get_trades(db, region="서울")
    assert len(results) == 2


def test_get_trades_pagination(db):
    """실거래 페이지네이션"""
    for i in range(5):
        _add_trade(db, region="서울", gu="강남", price=50000 + i * 1000, deal_month=f"20260{i+1}")

    page1 = mb_queries.get_trades(db, "서울", page=1, page_size=2)
    page2 = mb_queries.get_trades(db, "서울", page=2, page_size=2)
    assert len(page1) == 2
    assert len(page2) == 2

    total = mb_queries.count_trades(db, "서울")
    assert total == 5
