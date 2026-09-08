"""security_headers_middleware 의 Cache-Control 분기 회귀 가드 (세션 395)

진행 상태 폴링 엔드포인트(crawl-status·collect-status)는 `/api/live/` 접두어를 공유하는 탓에
실시간 검색 결과용 `private, max-age={동적 TTL}`(야간 10800초)을 함께 뒤집어쓰고 있었다.
그 결과 브라우저가 첫 폴링 응답을 최대 3시간 캐시해 이후 폴링을 전부 캐시로 답했고,
크롤이 끝나도 화면이 "크롤 중"에 멈췄다(라이브 재현: 브라우저 44회 요청 중 서버 도착 1회).

⚠ 뮤테이션 검증 완료 — main.py 의 crawl-status/collect-status 분기를 제거하면
아래 test_crawl_status_no_store·test_collect_status_no_store 가 실패한다(세션 395 실측).
"""


def test_crawl_status_no_store(client):
    """크롤 진행 상태 폴링 → Cache-Control: no-store (브라우저 캐시 금지)"""
    res = client.get("/api/live/102102/articles/crawl-status")
    assert res.status_code == 200
    assert res.headers["Cache-Control"] == "no-store"


def test_collect_status_no_store(client):
    """실거래가 수집 진행 상태 폴링 → Cache-Control: no-store"""
    res = client.get("/api/live/102102/price-history/collect-status")
    assert res.status_code == 200
    assert res.headers["Cache-Control"] == "no-store"


def test_regions_cache_unchanged(client):
    """회귀: /api/regions 는 기존 24시간 public 캐시 유지"""
    res = client.get("/api/regions")
    assert res.headers["Cache-Control"] == "public, max-age=86400"


def test_default_api_cache_unchanged(client):
    """회귀: 그 밖의 /api/ GET 은 기본 30초 캐시 유지"""
    res = client.get("/api/stats")
    assert res.headers["Cache-Control"] == "private, max-age=30"


def test_live_non_status_cache_unchanged(client):
    """회귀: 상태 조회가 아닌 /api/live/ GET 은 동적 TTL(private, max-age=) 유지.

    live_search 는 네이버 실호출 경로라 결과 본문·상태코드는 환경마다 갈리지만,
    Cache-Control 은 미들웨어가 붙이므로 상태코드와 무관하게 단언 가능하다.
    """
    res = client.get("/api/live/search?q=test")
    cache_control = res.headers["Cache-Control"]
    assert cache_control.startswith("private, max-age="), cache_control
    assert cache_control != "no-store"
