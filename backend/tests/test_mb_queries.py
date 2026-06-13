"""mibunyang 쿼리 단위 테스트
실행: python -m pytest tests/test_mb_queries.py -v
"""

from datetime import date, datetime

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
    _add_apartment(db, "APT001", "래미안", region="서울")
    _add_apartment(db, "APT002", "자이", region="서울")
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

    results, total = mb_queries.get_unsold_by_region(db, region="서울")
    assert len(results) == 1
    assert total == 1
    assert results[0].unsold == 50


def test_get_unsold_by_region_pagination(db):
    """미분양 조회 페이지네이션 — page/page_size 로 분할, total 은 전체 수"""
    for i in range(5):
        _add_apartment(db, f"UNS{i:03d}", f"단지{i}", region="부산", unsold=10 + i)

    # page_size=2 → 1페이지에 2건, total 은 5 유지
    page1, total = mb_queries.get_unsold_by_region(
        db, region="부산", page=1, page_size=2
    )
    assert len(page1) == 2
    assert total == 5

    # 마지막 페이지(3페이지)는 1건
    page3, total3 = mb_queries.get_unsold_by_region(
        db, region="부산", page=3, page_size=2
    )
    assert len(page3) == 1
    assert total3 == 5

    # 페이지가 겹치지 않음
    ids1 = {a.id for a in page1}
    ids3 = {a.id for a in page3}
    assert ids1.isdisjoint(ids3)


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


# ── 정렬 헬퍼 ───────────────────────────────────────────────


def test_build_mb_order_clause_valid():
    """유효한 정렬 키 → 올바른 ORDER BY 절 반환"""
    clause = mb_queries._build_mb_order_clause("unsold_desc")
    # SQLAlchemy UnaryExpression — 컬럼명+방향 확인
    compiled = str(clause)
    assert "unsold" in compiled.lower()


def test_build_mb_order_clause_invalid():
    """잘못된 정렬 키 → 기본값 name_asc 반환"""
    default_clause = mb_queries._build_mb_order_clause("name_asc")
    invalid_clause = mb_queries._build_mb_order_clause("invalid_key")
    assert str(default_clause) == str(invalid_clause)


def test_build_mb_trade_order_clause_valid():
    """유효한 실거래 정렬 키 → 올바른 ORDER BY 절 반환"""
    clause = mb_queries._build_mb_trade_order_clause("price_desc")
    compiled = str(clause)
    assert "price" in compiled.lower()


def test_build_mb_trade_order_clause_invalid():
    """잘못된 실거래 정렬 키 → 기본값 deal_month_desc 반환"""
    default_clause = mb_queries._build_mb_trade_order_clause("deal_month_desc")
    invalid_clause = mb_queries._build_mb_trade_order_clause("no_such_key")
    assert str(default_clause) == str(invalid_clause)


# ── 정렬 + 키워드 통합 ──────────────────────────────────────


def test_get_apartments_sorted_by_unsold(db):
    """미분양 수 내림차순 정렬 확인"""
    _add_apartment(db, "APT001", "래미안", region="서울", unsold=10)
    _add_apartment(db, "APT002", "자이", region="서울", unsold=50)

    results = mb_queries.get_apartments(db, region="서울", sort_by="unsold_desc")
    assert len(results) == 2
    # unsold 50이 먼저
    assert results[0].name == "자이"
    assert results[1].name == "래미안"


def test_get_apartments_keyword_match(db):
    """키워드 필터 — 이름에 포함된 단지만 반환"""
    _add_apartment(db, "APT001", "래미안퍼스티지", region="서울")
    _add_apartment(db, "APT002", "자이더빌리지", region="서울")

    results = mb_queries.get_apartments(db, region="서울", keyword="래미안")
    assert len(results) == 1
    assert results[0].name == "래미안퍼스티지"

    # count도 동일하게 필터링
    cnt = mb_queries.count_apartments(db, region="서울", keyword="래미안")
    assert cnt == 1


def test_get_apartments_keyword_wildcard_escape(db):
    """키워드에 %가 포함되면 이스케이프 — 전체 매칭 방지"""
    _add_apartment(db, "APT001", "래미안", region="서울")
    _add_apartment(db, "APT002", "자이", region="서울")

    # "%" 자체를 검색 → 이름에 %가 없으므로 결과 0건
    results = mb_queries.get_apartments(db, region="서울", keyword="%%")
    assert len(results) == 0


def test_get_apartments_sort_and_keyword_combined(db):
    """정렬 + 키워드 동시 사용"""
    _add_apartment(db, "APT001", "래미안레이크", region="서울", unsold=20)
    _add_apartment(db, "APT002", "래미안퍼스트", region="서울", unsold=80)
    _add_apartment(db, "APT003", "자이더빌리지", region="서울", unsold=100)

    results = mb_queries.get_apartments(
        db, region="서울", sort_by="unsold_desc", keyword="래미안",
    )
    # "자이"는 제외, 래미안 2개만 unsold 내림차순
    assert len(results) == 2
    assert results[0].name == "래미안퍼스트"  # unsold=80
    assert results[1].name == "래미안레이크"  # unsold=20


# ── 중복 제거 (extract_base_name + dedup) ───────────────────


def test_extract_base_name_with_suffix():
    """차수 접미사가 있는 단지명 → 접미사 제거"""
    assert mb_queries.extract_base_name("관저 푸르지오 2단지(무순위 1차)") == "관저 푸르지오 2단지"


def test_extract_base_name_without_suffix():
    """괄호 없는 단지명 → 그대로 반환"""
    assert mb_queries.extract_base_name("대전 씨엘리오 스위첸") == "대전 씨엘리오 스위첸"


def test_extract_base_name_type_suffix():
    """타입·층수 접미사 → 제거"""
    assert mb_queries.extract_base_name("대전 씨엘리오 스위첸(81A타입, 7층)") == "대전 씨엘리오 스위첸"


def test_extract_base_name_number_only():
    """숫자 차수만 있는 접미사 → 제거"""
    assert mb_queries.extract_base_name("아파트(5차)") == "아파트"


def test_extract_base_name_none_or_empty():
    """None이나 빈 문자열 → 빈 문자열 반환 (방어적 처리)"""
    assert mb_queries.extract_base_name("") == ""


def test_dedup_keeps_latest_by_created_at(db):
    """같은 단지 여러 차수 중 가장 최근 created_at만 반환"""
    _add_apartment(db, "APT01", "푸르지오(1차)", region="서울", unsold=97, created_at=datetime(2026, 1, 1))
    _add_apartment(db, "APT02", "푸르지오(2차)", region="서울", unsold=97, created_at=datetime(2026, 2, 1))
    _add_apartment(db, "APT03", "푸르지오(3차)", region="서울", unsold=97, created_at=datetime(2026, 3, 1))

    results = mb_queries.get_apartments(db, region="서울")
    assert len(results) == 1
    assert results[0].id == "APT03"


def test_dedup_falls_back_to_id_when_no_created_at(db):
    """created_at이 없으면 id 순서로 마지막 선택"""
    _add_apartment(db, "APT_A", "래미안(1차)", region="서울")
    _add_apartment(db, "APT_B", "래미안(2차)", region="서울")

    results = mb_queries.get_apartments(db, region="서울")
    assert len(results) == 1
    assert results[0].id == "APT_B"


def test_count_apartments_dedup(db):
    """count_apartments — 중복 제거 후 카운트"""
    _add_apartment(db, "APT01", "푸르지오(1차)", region="서울", created_at=datetime(2026, 1, 1))
    _add_apartment(db, "APT02", "푸르지오(2차)", region="서울", created_at=datetime(2026, 2, 1))
    _add_apartment(db, "APT03", "자이", region="서울")

    assert mb_queries.count_apartments(db, region="서울") == 2  # 푸르지오 + 자이


def test_unsold_dedup(db):
    """미분양 목록에서도 중복 제거"""
    _add_apartment(db, "APT01", "푸르지오(1차)", region="서울", unsold=97, created_at=datetime(2026, 1, 1))
    _add_apartment(db, "APT02", "푸르지오(2차)", region="서울", unsold=97, created_at=datetime(2026, 2, 1))

    results, total = mb_queries.get_unsold_by_region(db, region="서울")
    assert len(results) == 1
    assert total == 1
    assert results[0].id == "APT02"


def test_dedup_different_regions_not_merged(db):
    """같은 이름이라도 다른 지역이면 별도 유지"""
    _add_apartment(db, "APT01", "푸르지오(1차)", region="서울", gu="강남")
    _add_apartment(db, "APT02", "푸르지오(1차)", region="경기", gu="성남")

    assert len(mb_queries.get_apartments(db, region="서울")) == 1
    assert len(mb_queries.get_apartments(db, region="경기")) == 1


def test_dedup_pagination(db):
    """중복 제거 후 페이지네이션 정상 작동"""
    # 3개 단지 × 2차수 = 6행 → 중복 제거 후 3개
    for i, name in enumerate(["가단지", "나단지", "다단지"]):
        _add_apartment(db, f"A{i}1", f"{name}(1차)", region="서울", created_at=datetime(2026, 1, 1))
        _add_apartment(db, f"A{i}2", f"{name}(2차)", region="서울", created_at=datetime(2026, 2, 1))

    page1 = mb_queries.get_apartments(db, region="서울", page=1, page_size=2)
    page2 = mb_queries.get_apartments(db, region="서울", page=2, page_size=2)
    assert len(page1) == 2
    assert len(page2) == 1  # 3개 중 나머지 1개
    total = mb_queries.count_apartments(db, region="서울")
    assert total == 3


def test_dedup_sort_unsold_desc(db):
    """중복 제거 + 정렬 일관성"""
    _add_apartment(db, "A01", "래미안(1차)", region="서울", unsold=10, created_at=datetime(2026, 1, 1))
    _add_apartment(db, "A02", "래미안(2차)", region="서울", unsold=10, created_at=datetime(2026, 2, 1))
    _add_apartment(db, "A03", "자이", region="서울", unsold=50)

    results = mb_queries.get_apartments(db, region="서울", sort_by="unsold_desc")
    assert len(results) == 2
    assert results[0].id == "A03"  # 자이 unsold=50 먼저
    assert results[1].id == "A02"  # 래미안(2차) unsold=10


def test_get_apartments_page_returns_items_and_total(db):
    """get_apartments_page — 목록 + 전체 수를 단일 호출로 반환"""
    for i, name in enumerate(["가단지", "나단지", "다단지"]):
        _add_apartment(db, f"P{i}1", f"{name}(1차)", region="서울", created_at=datetime(2026, 1, 1))
        _add_apartment(db, f"P{i}2", f"{name}(2차)", region="서울", created_at=datetime(2026, 2, 1))

    items, total = mb_queries.get_apartments_page(db, region="서울", page=1, page_size=2)
    assert len(items) == 2
    assert total == 3  # 중복 제거 후 3개


# ── 정렬 NULLS LAST + pp 정렬 (세션 297) ────────────────────


def test_build_mb_order_clause_nullslast():
    """nullable 정렬 컬럼 전부 NULLS LAST — PG 기본(DESC 시 NULLS FIRST)의 빈 값 상단 노출 차단"""
    nullable_keys = [
        "unsold_desc", "unsold_asc", "unsold_rate_desc", "units_desc",
        "price_asc", "price_desc", "pp_asc", "pp_desc",
    ]
    for key in nullable_keys:
        compiled = str(mb_queries._build_mb_order_clause(key)).upper()
        assert "NULLS LAST" in compiled, key
    # name 은 NOT NULL — nullslast 불필요
    assert "NULLS LAST" not in str(mb_queries._build_mb_order_clause("name_asc")).upper()


def test_build_mb_order_clause_pp():
    """pp_asc/pp_desc → presale_pp 컬럼 정렬 (데스크톱 '평당가' 헤더 짝꿍)"""
    assert "presale_pp" in str(mb_queries._build_mb_order_clause("pp_desc")).lower()
    assert "presale_pp" in str(mb_queries._build_mb_order_clause("pp_asc")).lower()


def test_build_mb_trade_order_clause_nullslast():
    """실거래 정렬 전 키 NULLS LAST (deal_month/price/area 전 컬럼 nullable)"""
    for key in ["deal_month_desc", "deal_month_asc", "price_desc", "price_asc", "area_desc"]:
        compiled = str(mb_queries._build_mb_trade_order_clause(key)).upper()
        assert "NULLS LAST" in compiled, key


def test_get_apartments_pp_sort_none_last(db):
    """pp 정렬 — presale_pp 빈 단지는 asc/desc 모두 맨 뒤 (Python 경로 NULLS LAST parity)"""
    _add_apartment(db, "PP1", "가단지", region="서울", presale_pp=3000)
    _add_apartment(db, "PP2", "나단지", region="서울", presale_pp=1000)
    _add_apartment(db, "PP3", "다단지", region="서울")  # presale_pp None

    desc_rows = mb_queries.get_apartments(db, region="서울", sort_by="pp_desc")
    assert [a.id for a in desc_rows] == ["PP1", "PP2", "PP3"]

    asc_rows = mb_queries.get_apartments(db, region="서울", sort_by="pp_asc")
    assert [a.id for a in asc_rows] == ["PP2", "PP1", "PP3"]


def test_get_apartments_pp_sort_zero_last(db):
    """pp 정렬 — presale_pp=0(미공개/적재결함) 단지는 None 과 동급으로 asc/desc 모두 맨 뒤.

    0 과 None 은 별개 케이스 — Python 경로(_sort_apartments)는 `or` 가 falsy 0 을 NULL 과
    같게 처리해 0 안전. SQL 경로(_build_mb_order_clause func.nullif(pp,0))는 prod(PG) 전용이라
    CI(SQLite Python fallback)가 직접 검증 못 함 → 본 케이스가 0 처리 실효 회귀 가드 (세션 300).
    """
    _add_apartment(db, "PZ1", "가단지", region="서울", presale_pp=2000)
    _add_apartment(db, "PZ2", "나단지", region="서울", presale_pp=1000)
    _add_apartment(db, "PZ3", "다단지", region="서울", presale_pp=0)  # 평당가 0 (미공개)
    _add_apartment(db, "PZ4", "라단지", region="서울")  # presale_pp None

    asc_rows = mb_queries.get_apartments(db, region="서울", sort_by="pp_asc")
    # 양수 오름차순 먼저, 0/None 은 맨 뒤 (둘의 상호 순서는 미정 — 둘 다 후미면 통과)
    assert [a.id for a in asc_rows[:2]] == ["PZ2", "PZ1"]
    assert set(a.id for a in asc_rows[2:]) == {"PZ3", "PZ4"}

    desc_rows = mb_queries.get_apartments(db, region="서울", sort_by="pp_desc")
    assert [a.id for a in desc_rows[:2]] == ["PZ1", "PZ2"]
    assert set(a.id for a in desc_rows[2:]) == {"PZ3", "PZ4"}


def test_get_apartments_unsold_asc_none_last(db):
    """unsold_asc — 빈 값 단지가 맨 앞에 오던 마스킹(None→0) 정정 회귀 가드"""
    _add_apartment(db, "UA1", "가단지", region="서울", unsold=5)
    _add_apartment(db, "UA2", "나단지", region="서울")  # unsold None

    rows = mb_queries.get_apartments(db, region="서울", sort_by="unsold_asc")
    assert [a.id for a in rows] == ["UA1", "UA2"]


def test_get_trades_price_desc_none_last(db):
    """실거래 price_desc — price 빈 거래는 맨 뒤 (SQL 경로 NULLS LAST, SQLite 3.30+ 실행)"""
    _add_trade(db, region="서울", gu="강남", price=50000, deal_month="202601")
    _add_trade(db, region="서울", gu="강남", price=None, deal_month="202602")
    _add_trade(db, region="서울", gu="강남", price=80000, deal_month="202603")

    rows = mb_queries.get_trades(db, region="서울", sort_by="price_desc")
    assert [t.price for t in rows] == [80000, 50000, None]
