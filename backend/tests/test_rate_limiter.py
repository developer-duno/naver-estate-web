"""Rate Limiter 테스트 — IP 추출, 메모리 카운터, 윈도우 리셋
실행: python -m pytest tests/test_rate_limiter.py -v
"""
import time
from unittest.mock import MagicMock
from auth.rate_limiter import _get_client_ip, _check_rate_limit_memory, _ip_counters


def _mock_request(forwarded=None, client_host="127.0.0.1"):
    """테스트용 Request mock"""
    req = MagicMock()
    req.headers = {}
    if forwarded:
        req.headers["x-forwarded-for"] = forwarded
    req.client = MagicMock()
    req.client.host = client_host
    return req


# ── IP 추출 ──

def test_get_ip_from_single_forwarded():
    """X-Forwarded-For 단일 IP"""
    req = _mock_request(forwarded="1.2.3.4")
    assert _get_client_ip(req) == "1.2.3.4"


def test_get_ip_from_multiple_forwarded():
    """X-Forwarded-For 다중 IP → 끝에서 두 번째"""
    req = _mock_request(forwarded="1.1.1.1, 2.2.2.2, 3.3.3.3")
    assert _get_client_ip(req) == "2.2.2.2"


def test_get_ip_from_client():
    """X-Forwarded-For 없으면 client.host"""
    req = _mock_request(client_host="10.0.0.1")
    assert _get_client_ip(req) == "10.0.0.1"


def test_get_ip_no_client():
    """client도 없으면 'unknown'"""
    req = MagicMock()
    req.headers = {}
    req.client = None
    assert _get_client_ip(req) == "unknown"


# ── 메모리 Rate Limit ──

def test_memory_under_limit():
    """한도 미만 → False (통과)"""
    key = f"test_under_{time.time()}"
    result = _check_rate_limit_memory(key, max_req=5, window=60)
    assert result is False


def test_memory_at_limit():
    """한도 도달 → True (차단)"""
    key = f"test_at_{time.time()}"
    for _ in range(5):
        _check_rate_limit_memory(key, max_req=5, window=60)
    result = _check_rate_limit_memory(key, max_req=5, window=60)
    assert result is True


def test_memory_window_reset():
    """윈도우 만료 후 리셋"""
    key = f"test_reset_{time.time()}"
    # 1초 윈도우로 2회 제한
    _check_rate_limit_memory(key, max_req=2, window=1)
    _check_rate_limit_memory(key, max_req=2, window=1)
    assert _check_rate_limit_memory(key, max_req=2, window=1) is True  # 차단
    time.sleep(1.1)
    assert _check_rate_limit_memory(key, max_req=2, window=1) is False  # 리셋 후 통과
