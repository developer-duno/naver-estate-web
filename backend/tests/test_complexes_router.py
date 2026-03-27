"""단지 API 라우터 테스트 — 검색, 상세, 매물 필터/정렬/페이지
실행: python -m pytest tests/test_complexes_router.py -v
"""
import pytest

from db.models import Article, Complex


def _add_complex(db, no="C001", name="래미안", **kw):
    c = Complex(complex_no=no, complex_name=name, sido="서울", sigungu="강남", **kw)
    db.add(c)
    db.commit()
    return c


def _add_article(db, no="A001", complex_no="C001", trade="매매", price=50000, **kw):
    defaults = dict(complex_no=complex_no, trade_type_name=trade, is_active=True, numeric_price=price)
    defaults.update(kw)
    a = Article(article_no=no, **defaults)
    db.add(a)
    db.commit()
    return a


def test_search_complexes_200(client, db):
    """단지 검색 성공"""
    _add_complex(db, "C001", "래미안")
    res = client.get("/api/complexes/search?q=래미안")
    assert res.status_code == 200
    data = res.json()
    assert "complexes" in data or isinstance(data, list)


def test_search_empty_keyword_422(client):
    """빈 키워드 → 422"""
    res = client.get("/api/complexes/search?q=")
    assert res.status_code == 422


@pytest.mark.skip(reason="PostgreSQL unnest() not available in SQLite")
def test_get_complex_200(client, db):
    """단지 상세 조회 성공"""
    _add_complex(db, "C001", "래미안")
    res = client.get("/api/complexes/C001")
    assert res.status_code == 200
    data = res.json()
    assert data["complex_no"] == "C001"


def test_get_complex_404(client):
    """존재하지 않는 단지 → 404"""
    res = client.get("/api/complexes/NOEXIST")
    assert res.status_code == 404


def test_get_articles_200(client, db):
    """매물 목록 조회"""
    _add_complex(db, "C001")
    _add_article(db, "A001", "C001")
    _add_article(db, "A002", "C001")
    res = client.get("/api/complexes/C001/articles")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] >= 2


def test_get_articles_filter_trade(client, db):
    """거래유형 필터"""
    _add_complex(db, "C001")
    _add_article(db, "A001", "C001", trade="매매")
    _add_article(db, "A002", "C001", trade="전세")
    res = client.get("/api/complexes/C001/articles?trade_types=매매")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 1


def test_get_articles_sort(client, db):
    """가격순 정렬"""
    _add_complex(db, "C001")
    _add_article(db, "A001", "C001", price=80000)
    _add_article(db, "A002", "C001", price=30000)
    res = client.get("/api/complexes/C001/articles?sort_by=price_asc")
    assert res.status_code == 200
    articles = res.json()["articles"]
    if len(articles) >= 2:
        assert articles[0]["numeric_price"] <= articles[1]["numeric_price"]


def test_get_articles_pagination(client, db):
    """페이지네이션"""
    _add_complex(db, "C001")
    for i in range(5):
        _add_article(db, f"A{i:03d}", "C001")
    res = client.get("/api/complexes/C001/articles?page=1&page_size=2")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 5
    assert len(data["articles"]) == 2


def test_get_pyeong_details(client, db):
    """평형 상세"""
    _add_complex(db, "C001")
    res = client.get("/api/complexes/C001/pyeong-details")
    assert res.status_code == 200


def test_search_korean(client, db):
    _add_complex(db, 'CK', name='자이')
    assert client.get('/api/complexes/search?q=%EC%9E%90%EC%9D%B4').status_code == 200

def test_articles_empty_complex(client, db):
    _add_complex(db, 'CE', name='빈단지')
    res = client.get('/api/complexes/CE/articles')
    assert res.status_code == 200 and res.json()['total'] == 0

def test_articles_sort_area(client, db):
    _add_complex(db, 'CS')
    _add_article(db, 'SA1', 'CS', area2_m2=60.0)
    _add_article(db, 'SA2', 'CS', area2_m2=84.0)
    assert client.get('/api/complexes/CS/articles?sort_by=area_asc').status_code == 200

def test_articles_multi_trade(client, db):
    _add_complex(db, 'CT')
    _add_article(db, 'MT1', 'CT', trade='매매')
    _add_article(db, 'MT2', 'CT', trade='전세')
    _add_article(db, 'MT3', 'CT', trade='월세')
    res = client.get('/api/complexes/CT/articles?trade_types=매매,전세')
    assert res.status_code == 200 and res.json()['total'] == 2

def test_search_returns_structure(client, db):
    _add_complex(db, 'CR', name='래미안')
    data = client.get('/api/complexes/search?q=래미안').json()
    assert 'total' in data or 'complexes' in data


# 매물유형(estate_type) 필터 테스트
def test_articles_filter_estate_type_apt(client, db):
    """estate_type=apt → 아파트 매물만 반환"""
    _add_complex(db, "CE1")
    _add_article(db, "EA1", "CE1", article_real_estate_type_name="아파트")
    _add_article(db, "EA2", "CE1", article_real_estate_type_name="오피스텔")
    res = client.get("/api/complexes/CE1/articles?estate_type=apt")
    assert res.status_code == 200
    assert res.json()["total"] == 1

def test_articles_filter_estate_type_opst(client, db):
    """estate_type=opst → 오피스텔 매물만 반환"""
    _add_complex(db, "CE2")
    _add_article(db, "EO1", "CE2", article_real_estate_type_name="오피스텔")
    _add_article(db, "EO2", "CE2", article_real_estate_type_name="아파트")
    res = client.get("/api/complexes/CE2/articles?estate_type=opst")
    assert res.status_code == 200
    assert res.json()["total"] == 1

def test_articles_filter_estate_type_jgc(client, db):
    """estate_type=jgc → 재건축 매물만 반환"""
    _add_complex(db, "CE3")
    _add_article(db, "EJ1", "CE3", article_real_estate_type_name="재건축")
    _add_article(db, "EJ2", "CE3", article_real_estate_type_name="아파트")
    res = client.get("/api/complexes/CE3/articles?estate_type=jgc")
    assert res.status_code == 200
    assert res.json()["total"] == 1

def test_articles_filter_estate_type_rdv(client, db):
    """estate_type=rdv → 재개발 매물만 반환"""
    _add_complex(db, "CE4")
    _add_article(db, "ER1", "CE4", article_real_estate_type_name="재개발")
    _add_article(db, "ER2", "CE4", article_real_estate_type_name="아파트")
    res = client.get("/api/complexes/CE4/articles?estate_type=rdv")
    assert res.status_code == 200
    assert res.json()["total"] == 1
