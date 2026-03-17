"""통계 엔드포인트 테스트"""


def test_stats_endpoint(client):
    """GET /api/stats → 200 + complex_count/article_count"""
    res = client.get("/api/stats")
    assert res.status_code == 200
    data = res.json()
    assert "complex_count" in data
    assert "article_count" in data
    assert isinstance(data["complex_count"], int)
    assert isinstance(data["article_count"], int)


def test_stats_returns_zero_on_empty_db(client):
    """빈 DB에서 통계는 0"""
    res = client.get("/api/stats")
    data = res.json()
    assert data["complex_count"] == 0
    assert data["article_count"] == 0
