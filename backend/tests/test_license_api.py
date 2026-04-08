"""한국산업인력공단 자격증 진위확인 API 단위 테스트
실행: python -m pytest tests/test_license_api.py -v
"""

from unittest.mock import MagicMock, patch

import requests as std_requests

from crawler.license_api import verify_license

# ── 기능 비활성화 / 환경 검증 ──


def test_disabled():
    """HRDKOREA_ENABLED=false → valid=None, 미활성화 메시지"""
    with patch.dict("os.environ", {"HRDKOREA_ENABLED": "false"}, clear=False):
        result = verify_license("12345", "홍길동")
    assert result["valid"] is None
    assert "미활성화" in result["message"]


def test_enabled_no_api_key():
    """활성화됐지만 HRDKOREA_API_KEY 미설정 → valid=None"""
    with patch.dict("os.environ", {"HRDKOREA_ENABLED": "true"}, clear=False):
        with patch("crawler.license_api.os.getenv", side_effect=lambda k, *d: "true" if k == "HRDKOREA_ENABLED" else (d[0] if d else None)):
            result = verify_license("12345", "홍길동")
    assert result["valid"] is None
    assert "키 미설정" in result["message"]


def test_empty_license_number():
    """빈 자격증번호 → valid=False"""
    with patch.dict("os.environ", {"HRDKOREA_ENABLED": "true", "HRDKOREA_API_KEY": "test-key"}, clear=False):
        result = verify_license("", "홍길동")
    assert result["valid"] is False


# ── API 응답 처리 ──


def test_success_valid():
    """자격증 확인됨 — 일치 데이터 존재 → valid=True"""
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"data": [{"QUAL_NUM": "12345", "NM": "홍길동"}]}
    with (
        patch.dict("os.environ", {"HRDKOREA_ENABLED": "true", "HRDKOREA_API_KEY": "test-key"}, clear=False),
        patch("crawler.license_api.std_requests.get", return_value=mock_resp),
    ):
        result = verify_license("12345", "홍길동")
    assert result["valid"] is True
    assert "확인됨" in result["message"]


def test_success_invalid():
    """일치하는 자격증 없음 → valid=False"""
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"data": []}
    with (
        patch.dict("os.environ", {"HRDKOREA_ENABLED": "true", "HRDKOREA_API_KEY": "test-key"}, clear=False),
        patch("crawler.license_api.std_requests.get", return_value=mock_resp),
    ):
        result = verify_license("99999", "없는이름")
    assert result["valid"] is False


def test_timeout():
    """API 타임아웃 → valid=None"""
    with (
        patch.dict("os.environ", {"HRDKOREA_ENABLED": "true", "HRDKOREA_API_KEY": "test-key"}, clear=False),
        patch("crawler.license_api.std_requests.get", side_effect=std_requests.Timeout),
    ):
        result = verify_license("12345", "홍길동")
    assert result["valid"] is None
    assert "시간 초과" in result["message"]


def test_http_error():
    """API 서버 에러 (500) → valid=None"""
    mock_resp = MagicMock()
    mock_resp.status_code = 500
    with (
        patch.dict("os.environ", {"HRDKOREA_ENABLED": "true", "HRDKOREA_API_KEY": "test-key"}, clear=False),
        patch("crawler.license_api.std_requests.get", return_value=mock_resp),
    ):
        result = verify_license("12345", "홍길동")
    assert result["valid"] is None
    assert "500" in result["message"]
