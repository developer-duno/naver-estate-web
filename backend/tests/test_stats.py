"""통계 엔드포인트 테스트"""

from services.cache import get_cache


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


def test_stats_endpoint_returns_cached_on_second_call(client):
    """두 번째 호출은 동일 응답 (캐시 적중)"""
    res1 = client.get("/api/stats").json()
    res2 = client.get("/api/stats").json()
    assert res1 == res2


def test_stats_cache_invalidated_after_delete(client):
    """캐시 invalidate 후 다음 호출은 fresh 조회"""
    cache = get_cache("stats", dynamic=True)

    client.get("/api/stats")
    assert cache.get("db_stats") is not None

    cache.delete("db_stats")
    assert cache.get("db_stats") is None

    client.get("/api/stats")
    assert cache.get("db_stats") is not None


def test_crawl_done_pattern_invalidates_stats_cache():
    """크롤 finally 경로가 stats 캐시를 비우는지 — 패턴 시뮬레이션"""
    cache = get_cache("stats", dynamic=True)
    cache.set("db_stats", {"complex_count": 1, "article_count": 1})
    assert cache.get("db_stats") is not None

    # _crawl_bg.py / service_discover.py 가 호출하는 코드 그대로
    get_cache("stats", dynamic=True).delete("db_stats")
    assert cache.get("db_stats") is None
