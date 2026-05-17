"""텔레그램 발송 서비스 테스트 — send_telegram
실행: python -m pytest tests/test_telegram.py -v
"""

from unittest.mock import MagicMock, patch

from services.telegram import send_telegram


@patch.dict("os.environ", {"TELEGRAM_ENABLED": "false"}, clear=False)
def test_send_telegram_disabled_returns_false():
    """TELEGRAM_ENABLED=false 면 발송 안 하고 False"""
    assert send_telegram("테스트") is False


@patch.dict("os.environ", {
    "TELEGRAM_ENABLED": "true", "TELEGRAM_BOT_TOKEN": "", "TELEGRAM_CHAT_ID": "",
}, clear=False)
def test_send_telegram_no_credentials_returns_false():
    """토큰·chat_id 미설정이면 False"""
    assert send_telegram("테스트") is False


@patch.dict("os.environ", {
    "TELEGRAM_ENABLED": "true", "TELEGRAM_BOT_TOKEN": "tok", "TELEGRAM_CHAT_ID": "123",
}, clear=False)
@patch("services.telegram.requests.post")
def test_send_telegram_success(mock_post):
    """정상: requests.post 200 → True"""
    mock_post.return_value = MagicMock(status_code=200)
    assert send_telegram("테스트") is True
    mock_post.assert_called_once()
    url, kwargs = mock_post.call_args[0][0], mock_post.call_args[1]
    assert "bottok/sendMessage" in url
    assert kwargs["json"]["chat_id"] == "123"
    assert kwargs["json"]["text"] == "테스트"


@patch.dict("os.environ", {
    "TELEGRAM_ENABLED": "true", "TELEGRAM_BOT_TOKEN": "tok", "TELEGRAM_CHAT_ID": "123",
}, clear=False)
@patch("services.telegram.requests.post")
def test_send_telegram_http_error_returns_false(mock_post):
    """엣지: requests.post 가 예외 → False (예외 전파 안 함)"""
    mock_post.side_effect = ConnectionError("network down")
    assert send_telegram("테스트") is False


@patch.dict("os.environ", {
    "TELEGRAM_ENABLED": "true", "TELEGRAM_BOT_TOKEN": "tok", "TELEGRAM_CHAT_ID": "123",
}, clear=False)
@patch("services.telegram.requests.post")
def test_send_telegram_non_200_returns_false(mock_post):
    """엣지: 200 아닌 응답 → False"""
    mock_post.return_value = MagicMock(status_code=400)
    assert send_telegram("테스트") is False
