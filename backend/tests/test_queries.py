"""DB 쿼리 함수 테스트 — 검색, 필터, 정렬, 페이지네이션
실행: python -m pytest tests/test_queries.py -v
"""
from db import queries
from db.models import Article, Complex


def _add_complex(db, no="C001", name="래미안아파트", sido="서울특별시", sigungu="강남구", dong="역삼동"):
    c = Complex(complex_no=no, complex_name=name, sido=sido, sigungu=sigungu, dong=dong)
    db.add(c)
    db.commit()
    return c


def _add_article(db, no="A001", complex_no="C001", trade="매매", price=50000, active=True, **kw):
    a = Article(article_no=no, complex_no=complex_no, trade_type_name=trade, numeric_price=price, is_active=active, **kw)
    db.add(a)
    db.commit()
    return a


def test_search_complexes_by_name(db):
    """단지명으로 검색"""
    _add_complex(db, "C001", "래미안")
    _add_complex(db, "C002", "자이")
    results = queries.search_complexes(db, "래미안")
    assert len(results) >= 1
    assert any(c.complex_name == "래미안" for c in results)


def test_search_complexes_no_results(db):
    """검색 결과 없음"""
    _add_complex(db, "C001", "래미안")
    results = queries.search_complexes(db, "존재하지않는단지")
    assert len(results) == 0


def test_get_complex_by_no_exists(db):
    """존재하는 단지 조회"""
    _add_complex(db, "C001", "래미안")
    c = queries.get_complex_by_no(db, "C001")
    assert c is not None
    assert c.complex_name == "래미안"


def test_get_complex_by_no_not_found(db):
    """존재하지 않는 단지 조회 → None"""
    c = queries.get_complex_by_no(db, "NOEXIST")
    assert c is None


def test_get_articles_basic(db):
    """기본 매물 조회"""
    _add_complex(db, "C001")
    _add_article(db, "A001", "C001")
    _add_article(db, "A002", "C001")
    articles, total = queries.get_articles_by_complex(db, "C001")
    assert total >= 2


def test_get_articles_only_active(db):
    """활성 매물만 반환"""
    _add_complex(db, "C001")
    _add_article(db, "A001", "C001", active=True)
    _add_article(db, "A002", "C001", active=False)
    articles, total = queries.get_articles_by_complex(db, "C001")
    assert total == 1
    assert articles[0].article_no == "A001"


def test_get_articles_filter_trade_types(db):
    """거래유형 필터"""
    _add_complex(db, "C001")
    _add_article(db, "A001", "C001", trade="매매")
    _add_article(db, "A002", "C001", trade="전세")
    articles, total = queries.get_articles_by_complex(db, "C001", filters={"trade_types": ["매매"]})
    assert total == 1
    assert articles[0].trade_type_name == "매매"


def test_get_articles_filter_price_range(db):
    """가격 범위 필터"""
    _add_complex(db, "C001")
    _add_article(db, "A001", "C001", price=30000)
    _add_article(db, "A002", "C001", price=50000)
    _add_article(db, "A003", "C001", price=80000)
    articles, total = queries.get_articles_by_complex(
        db, "C001", filters={"min_price": 40000, "max_price": 60000}
    )
    assert total == 1
    assert articles[0].numeric_price == 50000


def test_get_articles_sort_price_asc(db):
    """가격 오름차순 정렬"""
    _add_complex(db, "C001")
    _add_article(db, "A001", "C001", price=80000)
    _add_article(db, "A002", "C001", price=30000)
    _add_article(db, "A003", "C001", price=50000)
    articles, _ = queries.get_articles_by_complex(db, "C001", sort_by="price_asc")
    prices = [a.numeric_price for a in articles]
    assert prices == sorted(prices)


def test_get_articles_sort_price_desc(db):
    """가격 내림차순 정렬"""
    _add_complex(db, "C001")
    _add_article(db, "A001", "C001", price=80000)
    _add_article(db, "A002", "C001", price=30000)
    articles, _ = queries.get_articles_by_complex(db, "C001", sort_by="price_desc")
    prices = [a.numeric_price for a in articles]
    assert prices == sorted(prices, reverse=True)


def test_get_articles_pagination(db):
    """페이지네이션 (page=2, page_size=2)"""
    _add_complex(db, "C001")
    for i in range(5):
        _add_article(db, f"A{i:03d}", "C001", price=10000 * (i + 1))
    articles, total = queries.get_articles_by_complex(db, "C001", page=2, page_size=2)
    assert total == 5
    assert len(articles) == 2


def test_get_db_stats(db):
    """DB 통계"""
    _add_complex(db, "C001")
    _add_article(db, "A001", "C001")
    stats = queries.get_db_stats(db)
    assert stats["complex_count"] >= 1
    assert stats["article_count"] >= 1


def test_get_db_stats_empty(db):
    """빈 DB 통계"""
    stats = queries.get_db_stats(db)
    assert stats["complex_count"] == 0
    assert stats["article_count"] == 0


def test_get_article_by_no(db):
    """단일 매물 조회"""
    _add_complex(db, "C001")
    _add_article(db, "A001", "C001")
    a = queries.get_article_by_no(db, "A001")
    assert a is not None
    assert a.article_no == "A001"


def test_get_article_by_no_not_found(db):
    """존재하지 않는 매물 → None"""
    a = queries.get_article_by_no(db, "NOEXIST")
    assert a is None


def test_get_complexes_by_region(db):
    """지역별 단지 조회"""
    _add_complex(db, "C001", sido="서울특별시", sigungu="강남구")
    _add_complex(db, "C002", sido="부산광역시", sigungu="해운대구")
    results = queries.get_complexes_by_region(db, "서울특별시")
    assert len(results) == 1
    assert results[0].complex_no == "C001"


def test_filter_direction(db):
    _add_complex(db, 'CD')
    _add_article(db, 'FD1', 'CD', direction='남향')
    _add_article(db, 'FD2', 'CD', direction='북향')
    arts, total = queries.get_articles_by_complex(db, 'CD', filters={'direction': '남향'})
    assert total == 1

def test_filter_building(db):
    _add_complex(db, 'CB')
    _add_article(db, 'FB1', 'CB', building_name='101동')
    _add_article(db, 'FB2', 'CB', building_name='102동')
    arts, total = queries.get_articles_by_complex(db, 'CB', filters={'building_name': '101동'})
    assert total == 1

def test_search_partial(db):
    _add_complex(db, 'CP', '래미안타워')
    assert len(queries.search_complexes(db, '래미안')) >= 1

def test_region_sigungu_filter(db):
    _add_complex(db, 'RS1', sido='서울특별시', sigungu='서초구')
    _add_complex(db, 'RS2', sido='서울특별시', sigungu='강남구')
    results = queries.get_complexes_by_region(db, '서울특별시', sigungu='서초구')
    assert len(results) == 1


def test_trade_type_counts_basic(db):
    """거래유형별 매물 수 — 4종 키 항상 포함, 없는 유형은 0"""
    _add_complex(db, "TC1")
    _add_article(db, "TC1A", "TC1", trade="매매")
    _add_article(db, "TC1B", "TC1", trade="매매")
    _add_article(db, "TC1C", "TC1", trade="전세")
    counts = queries.get_trade_type_counts(db, "TC1")
    assert counts == {"매매": 2, "전세": 1, "월세": 0, "단기임대": 0}


def test_trade_type_counts_empty(db):
    """매물 0건 단지 → 4키 전부 0"""
    _add_complex(db, "TC2")
    counts = queries.get_trade_type_counts(db, "TC2")
    assert counts == {"매매": 0, "전세": 0, "월세": 0, "단기임대": 0}


def test_trade_type_counts_excludes_inactive(db):
    """비활성 매물(is_active=False)은 카운트 제외"""
    _add_complex(db, "TC3")
    _add_article(db, "TC3A", "TC3", trade="매매", active=True)
    _add_article(db, "TC3B", "TC3", trade="매매", active=False)
    counts = queries.get_trade_type_counts(db, "TC3")
    assert counts["매매"] == 1


def test_trade_type_counts_by_complexes(db):
    """복수 단지 배치 조회 — 각 단지별 4키 dict 반환"""
    _add_complex(db, "TC4")
    _add_complex(db, "TC5")
    _add_article(db, "TC4A", "TC4", trade="월세")
    _add_article(db, "TC5A", "TC5", trade="단기임대")
    _add_article(db, "TC5B", "TC5", trade="전세")
    result = queries.get_trade_type_counts_by_complexes(db, ["TC4", "TC5"])
    assert result["TC4"] == {"매매": 0, "전세": 0, "월세": 1, "단기임대": 0}
    assert result["TC5"] == {"매매": 0, "전세": 1, "월세": 0, "단기임대": 1}


def test_trade_type_counts_by_complexes_empty(db):
    """빈 단지 목록 → 빈 dict"""
    assert queries.get_trade_type_counts_by_complexes(db, []) == {}
