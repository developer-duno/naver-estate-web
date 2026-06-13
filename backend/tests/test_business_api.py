"""국세청 사업자등록 진위확인 API 단위 테스트
실행: python -m pytest tests/test_business_api.py -v
"""

from unittest.mock import MagicMock, patch

import requests as std_requests

from crawler.business_api import check_business_status, verify_business_registration

# ── 환경 / 입력 검증 ──


def test_no_api_key():
    """PUBLIC_DATA_API_KEY 미설정 → valid=None"""
    with patch("crawler.business_api.os.getenv", return_value=None):
        result = verify_business_registration("1234567890", "홍길동")
    assert result["valid"] is None
    assert "키 미설정" in result["message"]


def test_invalid_business_number_short():
    """10자리 미만 사업자번호 → valid=False"""
    with patch("crawler.business_api.os.getenv", return_value="test-key"):
        result = verify_business_registration("12345", "홍길동")
    assert result["valid"] is False
    assert "10자리" in result["message"]


def test_invalid_business_number_alpha():
    """영문 포함 사업자번호 → valid=False"""
    with patch("crawler.business_api.os.getenv", return_value="test-key"):
        result = verify_business_registration("12345abcde", "홍길동")
    assert result["valid"] is False


# ── API 응답 처리 ──


def test_success_valid():
    """사업자등록 확인됨 (valid_code="01") → valid=True"""
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "data": [{"valid": "01", "valid_msg": ""}]
    }
    with (
        patch("crawler.business_api.os.getenv", return_value="test-key"),
        patch("crawler.business_api.std_requests.post", return_value=mock_resp),
    ):
        result = verify_business_registration("1234567890", "홍길동")
    assert result["valid"] is True
    assert "확인됨" in result["message"]


def test_start_date_passed_to_payload():
    """start_date 가 payload start_dt 로 전달되는지 단언 (세션 304 — 누락 시 odcloud 500)"""
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"data": [{"valid": "01", "valid_msg": ""}]}
    with (
        patch("crawler.business_api.os.getenv", return_value="test-key"),
        patch("crawler.business_api.std_requests.post", return_value=mock_resp) as mock_post,
    ):
        result = verify_business_registration("1234567890", "홍길동", "19990602")
    assert result["valid"] is True
    sent = mock_post.call_args.kwargs["json"]["businesses"][0]
    assert sent["start_dt"] == "19990602"
    assert sent["b_no"] == "1234567890"
    assert sent["p_nm"] == "홍길동"


def test_success_invalid():
    """유효하지 않은 사업자번호 (valid_code="02") → valid=False"""
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "data": [{"valid": "02", "valid_msg": "유효하지 않은 사업자번호"}]
    }
    with (
        patch("crawler.business_api.os.getenv", return_value="test-key"),
        patch("crawler.business_api.std_requests.post", return_value=mock_resp),
    ):
        result = verify_business_registration("1234567890", "홍길동")
    assert result["valid"] is False


def test_http_error():
    """API 서버 에러 (500) → valid=None"""
    mock_resp = MagicMock()
    mock_resp.status_code = 500
    with (
        patch("crawler.business_api.os.getenv", return_value="test-key"),
        patch("crawler.business_api.std_requests.post", return_value=mock_resp),
    ):
        result = verify_business_registration("1234567890", "홍길동")
    assert result["valid"] is None
    assert "500" in result["message"]


def test_timeout():
    """API 타임아웃 → valid=None"""
    with (
        patch("crawler.business_api.os.getenv", return_value="test-key"),
        patch(
            "crawler.business_api.std_requests.post",
            side_effect=std_requests.Timeout,
        ),
    ):
        result = verify_business_registration("1234567890", "홍길동")
    assert result["valid"] is None
    assert "시간 초과" in result["message"]


def test_empty_response_data():
    """API 응답 data 빈 배열 → valid=None"""
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"data": []}
    with (
        patch("crawler.business_api.os.getenv", return_value="test-key"),
        patch("crawler.business_api.std_requests.post", return_value=mock_resp),
    ):
        result = verify_business_registration("1234567890", "홍길동")
    assert result["valid"] is None
    assert "데이터 없음" in result["message"]


# ── check_business_status — 영업상태 조회 (세션 305 PR A) ──


def _status_resp(b_stt_cd):
    """status API 200 응답 mock (b_stt_cd 만 지정)"""
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"data": [{"b_no": "1234567890", "b_stt_cd": b_stt_cd}]}
    return mock_resp


def test_status_no_api_key():
    """PUBLIC_DATA_API_KEY 미설정 → None (키-가드, CI 외부호출 차단)"""
    with patch("crawler.business_api.os.getenv", return_value=None):
        assert check_business_status("1234567890") is None


def test_status_invalid_number():
    """10자리 아닌 사업자번호 → None (외부호출 전 차단)"""
    with patch("crawler.business_api.os.getenv", return_value="test-key"):
        assert check_business_status("12345") is None


def test_status_active_01():
    """계속사업자 (b_stt_cd="01") → "01" """
    with (
        patch("crawler.business_api.os.getenv", return_value="test-key"),
        patch("crawler.business_api.std_requests.post", return_value=_status_resp("01")),
    ):
        assert check_business_status("1234567890") == "01"


def test_status_closed_02():
    """휴업 (b_stt_cd="02") → "02" """
    with (
        patch("crawler.business_api.os.getenv", return_value="test-key"),
        patch("crawler.business_api.std_requests.post", return_value=_status_resp("02")),
    ):
        assert check_business_status("1234567890") == "02"


def test_status_closed_03():
    """폐업 (b_stt_cd="03") → "03" """
    with (
        patch("crawler.business_api.os.getenv", return_value="test-key"),
        patch("crawler.business_api.std_requests.post", return_value=_status_resp("03")),
    ):
        assert check_business_status("1234567890") == "03"


def test_status_unregistered_empty():
    """미등록 (b_stt_cd="") → "" (None 과 구분 — 모순 케이스 호출처가 pending 처리)"""
    with (
        patch("crawler.business_api.os.getenv", return_value="test-key"),
        patch("crawler.business_api.std_requests.post", return_value=_status_resp("")),
    ):
        assert check_business_status("1234567890") == ""


def test_status_http_error():
    """status API HTTP 500 → None"""
    mock_resp = MagicMock()
    mock_resp.status_code = 500
    with (
        patch("crawler.business_api.os.getenv", return_value="test-key"),
        patch("crawler.business_api.std_requests.post", return_value=mock_resp),
    ):
        assert check_business_status("1234567890") is None


def test_status_timeout():
    """status API 타임아웃 → None"""
    with (
        patch("crawler.business_api.os.getenv", return_value="test-key"),
        patch("crawler.business_api.std_requests.post", side_effect=std_requests.Timeout),
    ):
        assert check_business_status("1234567890") is None


def test_status_empty_data():
    """status API data 빈 배열 → None"""
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"data": []}
    with (
        patch("crawler.business_api.os.getenv", return_value="test-key"),
        patch("crawler.business_api.std_requests.post", return_value=mock_resp),
    ):
        assert check_business_status("1234567890") is None
