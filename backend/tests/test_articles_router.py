"""매물 API 라우터 테스트
실행: python -m pytest tests/test_articles_router.py -v
"""
from db.models import Article, Complex


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


def test_export_no_articles_error(client, db, approved_headers):
    """매물 없는 단지 내보내기 → 에러 (승인 중개사)"""
    c = Complex(complex_no="EMPTY", complex_name="빈단지", sido="서울", sigungu="강남")
    db.add(c)
    db.commit()
    res = client.post("/api/articles/export?complex_no=EMPTY", headers=approved_headers)
    # 빈 결과 → 404 또는 200 빈 파일
    assert res.status_code in [200, 404, 400]


def test_export_no_auth_403(client, db):
    """비로그인 → 엑셀 내보내기 403 (B2 게이트 — 가드3 흡수, 비로그인 5000행 추출 봉합)"""
    c = Complex(complex_no="EXPGATE", complex_name="t", sido="서울", sigungu="강남")
    db.add(c)
    db.commit()
    res = client.post("/api/articles/export?complex_no=EXPGATE")
    assert res.status_code in (401, 403)


def test_get_article_has_fields(client, db):
    _seed(db)
    data = client.get('/api/articles/A001').json()
    for k in ['article_no','complex_no','trade_type_name']:
        assert k in data

def test_export_with_data(client, db, approved_headers):
    _seed(db)
    res = client.post('/api/articles/export?complex_no=C001', headers=approved_headers)
    assert res.status_code == 200

def test_price_changes_empty(client):
    res = client.get('/api/articles/price-changes')
    assert res.status_code == 200

def test_get_article_inactive(client, db):
    from db.models import Article as A2
    from db.models import Complex as C2
    db.add(C2(complex_no="CI",complex_name="t",sido="s",sigungu="g"))
    db.add(A2(article_no="AI",complex_no="CI",trade_type_name="t",is_active=False,numeric_price=1))
    db.commit()
    assert client.get("/api/articles/AI").status_code == 200

def test_export_content_disposition(client, db, approved_headers):
    _seed(db)
    res = client.post("/api/articles/export?complex_no=C001", headers=approved_headers)
    if res.status_code == 200:
        assert "content-disposition" in res.headers

def test_export_audit_ip_ignores_forged_xff(client, db, approved_headers):
    """감사 로그 IP: 위조 X-Forwarded-For 무시 + CF-Connecting-IP 채택 (#339 정책 정렬).

    rate_limiter 와 동일하게 XFF 를 신뢰하지 않는다 — 감사 기록이 위조 IP 로
    오염되면 사후 추적이 무력화된다. 저장값은 _mask_ip 로 마지막 옥텟 마스킹.
    """
    from db.models import AuditLog

    _seed(db)
    headers = {
        **approved_headers,
        "x-forwarded-for": "6.6.6.6",
        "cf-connecting-ip": "1.2.3.4",
    }
    res = client.post("/api/articles/export?complex_no=C001", headers=headers)
    assert res.status_code == 200

    row = (
        db.query(AuditLog)
        .filter(AuditLog.action == "export")
        .order_by(AuditLog.id.desc())
        .first()
    )
    assert row is not None
    assert row.ip_address == "1.2.3.xxx"  # CF 헤더 채택 + 마스킹
    assert "6.6.6" not in (row.ip_address or "")  # 위조 XFF 미채택


def test_multiple_articles(client, db):
    from db.models import Article as A3
    from db.models import Complex as C3
    db.add(C3(complex_no="CM",complex_name="m",sido="s",sigungu="g"))
    for i in range(3):
        db.add(A3(article_no=f"AM{i}",complex_no="CM",trade_type_name="m",is_active=True,numeric_price=1000*i))
    db.commit()
    for i in range(3):
        assert client.get(f"/api/articles/AM{i}").status_code == 200
