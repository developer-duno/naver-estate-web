"""API Rate Limit 테스트 — 429 응답, Retry-After 헤더
실행: python -m pytest tests/test_api_rate_limit.py -v

NOTE: RateLimitMiddleware는 미들웨어로 등록되어 있어 TestClient로 직접 테스트.
in-memory 모드에서 테스트.
"""
import time

import pytest

from auth.rate_limiter import _check_rate_limit_memory, _ip_counters


@pytest.fixture(autouse=True)
def clear_counters():
    _ip_counters.clear()
    yield
    _ip_counters.clear()


def test_under_threshold_passes(client):
    """한도 미만 요청 → 200"""
    res = client.get("/api/stats")
    assert res.status_code == 200


def test_rate_limit_triggers_429(client):
    """동일 경로 60회 초과 → 429"""
    # 테스트 전 카운터 초기화
    _ip_counters.clear()
    for i in range(61):
        res = client.get("/api/stats")
        if res.status_code == 429:
            break
    assert res.status_code == 429
    assert "한도" in res.json()["detail"]


def test_429_has_retry_after(client):
    """429 응답에 Retry-After 헤더 포함"""
    _ip_counters.clear()
    for i in range(65):
        res = client.get("/api/stats")
        if res.status_code == 429:
            break
    assert "retry-after" in res.headers


def test_different_paths_separate_counters():
    """다른 경로는 별도 카운터"""
    key_a = f"test_path_a_{time.time()}"
    key_b = f"test_path_b_{time.time()}"
    for _ in range(3):
        _check_rate_limit_memory(key_a, max_req=3, window=60)
    # key_a는 초과
    assert _check_rate_limit_memory(key_a, max_req=3, window=60) is True
    # key_b는 아직 여유
    assert _check_rate_limit_memory(key_b, max_req=3, window=60) is False
