"""Rate Limiter 테스트 — IP 추출, 메모리 카운터, 윈도우 리셋
실행: python -m pytest tests/test_rate_limiter.py -v
"""
import time
from unittest.mock import MagicMock

from auth.rate_limiter import _check_rate_limit_memory, _get_client_ip


def _mock_request(forwarded=None, cf_ip=None, client_host="127.0.0.1"):
    """테스트용 Request mock"""
    req = MagicMock()
    req.headers = {}
    if forwarded:
        req.headers["x-forwarded-for"] = forwarded
    if cf_ip:
        req.headers["cf-connecting-ip"] = cf_ip
    req.client = MagicMock()
    req.client.host = client_host
    return req


# ── IP 추출 ──
# 보안 방침(세션 355): X-Forwarded-For 는 클라이언트 위조 가능 → 신뢰하지 않는다.
# Cloudflare Named Tunnel 이 항상 덮어쓰는 CF-Connecting-IP 만 신뢰, 없으면 직접 연결 IP.

def test_get_ip_from_cf_connecting_ip():
    """CF-Connecting-IP 있으면 그 값 채택 (Cloudflare 가 위조 불가하게 덮어씀)"""
    req = _mock_request(cf_ip="1.2.3.4", client_host="10.0.0.1")
    assert _get_client_ip(req) == "1.2.3.4"


def test_cf_connecting_ip_wins_over_forged_forwarded():
    """CF-Connecting-IP 와 위조 XFF 공존 시 CF 값 우선"""
    req = _mock_request(forwarded="9.9.9.9, 8.8.8.8", cf_ip="1.2.3.4", client_host="10.0.0.1")
    assert _get_client_ip(req) == "1.2.3.4"


def test_forged_forwarded_ignored_falls_back_to_client():
    """위조 X-Forwarded-For 만 있으면 무시하고 직접 연결 IP 폴백 (429 우회 차단)"""
    req = _mock_request(forwarded="1.1.1.1, 2.2.2.2, 3.3.3.3", client_host="10.0.0.1")
    assert _get_client_ip(req) == "10.0.0.1"

    # 단일 IP 위조도 동일하게 무시
    req_single = _mock_request(forwarded="1.2.3.4", client_host="10.0.0.1")
    assert _get_client_ip(req_single) == "10.0.0.1"


def test_get_ip_from_client():
    """헤더 전무 시 client.host"""
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
