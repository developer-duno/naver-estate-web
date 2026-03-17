"""API 입력 검증 테스트 — 잘못된 파라미터에 대한 422 응답 확인
실행: python -m pytest tests/test_api_validation.py -v
"""


def test_search_empty_keyword_422(client):
    """빈 키워드 검색 → 422 (min_length=1)"""
    res = client.get("/api/complexes/search?q=")
    assert res.status_code == 422


def test_search_missing_keyword_422(client):
    """키워드 파라미터 누락 → 422"""
    res = client.get("/api/complexes/search")
    assert res.status_code == 422


def test_articles_invalid_sort_422(client):
    """잘못된 sort_by 값 → 422"""
    res = client.get("/api/complexes/12345/articles?sort_by=invalid_sort")
    assert res.status_code == 422


def test_articles_page_zero_422(client):
    """page=0 → 422 (ge=1)"""
    res = client.get("/api/complexes/12345/articles?page=0")
    assert res.status_code == 422


def test_articles_negative_page_size_422(client):
    """page_size 음수 → 422"""
    res = client.get("/api/complexes/12345/articles?page_size=-1")
    assert res.status_code == 422


def test_articles_page_size_too_large_422(client):
    """page_size 초과 → 422 (le=200)"""
    res = client.get("/api/complexes/12345/articles?page_size=999")
    assert res.status_code == 422


def test_valid_sort_200(client):
    assert client.get('/api/complexes/12345/articles?sort_by=price_asc').status_code == 200

def test_valid_page_200(client):
    assert client.get('/api/complexes/12345/articles?page=1&page_size=10').status_code == 200

def test_special_chars_search(client):
    assert client.get('/api/complexes/search?q=%3Cscript%3E').status_code in [200, 422]

def test_long_keyword(client):
    assert client.get('/api/complexes/search?q=' + '%ED%85%8C' * 30).status_code == 200

def test_string_price_422(client):
    assert client.get('/api/complexes/12345/articles?min_price=abc').status_code == 422

def test_float_rooms_422(client):
    assert client.get('/api/complexes/12345/articles?min_rooms=2.5').status_code == 422
