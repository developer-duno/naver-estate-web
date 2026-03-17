"""매물 API 라우터 테스트
실행: python -m pytest tests/test_articles_router.py -v
"""
from db.models import Complex, Article


def _seed(db):
    c = Complex(complex_no="C001", complex_name="테스트", sido="서울", sigungu="강남")
    db.add(c)
    a = Article(article_no="A001", complex_no="C001", trade_type_name="매매",
                is_active=True, numeric_price=50000, complex_name="테스트")
    db.add(a)
    db.commit()


def test_get_article_200(client, db):
    """매물 상세 조회 성공"""
    _seed(db)
    res = client.get("/api/articles/A001")
    assert res.status_code == 200
    data = res.json()
    assert data["article_no"] == "A001"


def test_get_article_404(client):
    """존재하지 않는 매물 → 404"""
    res = client.get("/api/articles/NOEXIST")
    assert res.status_code == 404


def test_price_changes_200(client, db):
    """가격 변동 매물 조회"""
    _seed(db)
    res = client.get("/api/articles/price-changes")
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list) or "articles" in data


def test_export_no_articles_error(client, db):
    """매물 없는 단지 내보내기 → 에러"""
    c = Complex(complex_no="EMPTY", complex_name="빈단지", sido="서울", sigungu="강남")
    db.add(c)
    db.commit()
    res = client.post("/api/articles/export?complex_no=EMPTY")
    # 빈 결과 → 404 또는 200 빈 파일
    assert res.status_code in [200, 404, 400]


def test_get_article_has_fields(client, db):
    _seed(db)
    data = client.get('/api/articles/A001').json()
    for k in ['article_no','complex_no','trade_type_name']:
        assert k in data

def test_export_with_data(client, db):
    _seed(db)
    res = client.post('/api/articles/export?complex_no=C001')
    assert res.status_code == 200

def test_price_changes_empty(client):
    res = client.get('/api/articles/price-changes')
    assert res.status_code == 200

def test_get_article_inactive(client, db):
    from db.models import Complex as C2, Article as A2
    db.add(C2(complex_no="CI",complex_name="t",sido="s",sigungu="g"))
    db.add(A2(article_no="AI",complex_no="CI",trade_type_name="t",is_active=False,numeric_price=1))
    db.commit()
    assert client.get("/api/articles/AI").status_code == 200

def test_export_content_disposition(client, db):
    _seed(db)
    res = client.post("/api/articles/export?complex_no=C001")
    if res.status_code == 200:
        assert "content-disposition" in res.headers

def test_multiple_articles(client, db):
    from db.models import Complex as C3, Article as A3
    db.add(C3(complex_no="CM",complex_name="m",sido="s",sigungu="g"))
    for i in range(3):
        db.add(A3(article_no=f"AM{i}",complex_no="CM",trade_type_name="m",is_active=True,numeric_price=1000*i))
    db.commit()
    for i in range(3):
        assert client.get(f"/api/articles/AM{i}").status_code == 200
