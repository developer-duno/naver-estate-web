"""이메일 서비스 테스트 — send_email, 템플릿 빌더, 보안 검증
실행: python -m pytest tests/test_email.py -v
"""

from unittest.mock import MagicMock, patch

from services.email import (
    build_approval_email,
    build_rejection_email,
    send_email,
)

# ── 템플릿 빌더 ──


def test_approval_email_format():
    """승인 이메일 제목+본문 생성"""
    subject, html = build_approval_email("user@example.com")
    assert "승인" in subject
    assert "user@example.com" in html
    assert "전문가" in html


def test_rejection_email_format():
    """거부 이메일 제목+본문 생성 — reason 포함"""
    subject, html = build_rejection_email("user@example.com", "서류 불충분")
    assert "반려" in subject
    assert "서류 불충분" in html
    assert "재신청" in html


def test_rejection_email_xss_escape():
    """거부 사유에 HTML 태그가 이스케이프되는지 확인 (XSS 방지)"""
    _, html = build_rejection_email("u@test.com", '<script>alert("xss")</script>')
    assert "<script>" not in html
    assert "&lt;script&gt;" in html


# ── send_email ──


@patch.dict("os.environ", {"SMTP_USER": "u@g.com", "SMTP_PASS": "pw"})
@patch("services.email.smtplib.SMTP_SSL")
def test_send_email_success(mock_smtp_cls):
    """SMTP 성공 시 True 반환"""
    mock_server = MagicMock()
    mock_smtp_cls.return_value.__enter__ = MagicMock(return_value=mock_server)
    mock_smtp_cls.return_value.__exit__ = MagicMock(return_value=False)

    result = send_email("to@example.com", "제목", "<p>본문</p>")
    assert result is True
    mock_server.login.assert_called_once_with("u@g.com", "pw")
    mock_server.sendmail.assert_called_once()


@patch.dict("os.environ", {"SMTP_USER": "u@g.com", "SMTP_PASS": "pw"})
@patch("services.email.smtplib.SMTP_SSL", side_effect=ConnectionError("timeout"))
def test_send_email_failure_returns_false(mock_smtp_cls):
    """SMTP 실패 시 False 반환 (예외 전파 안 함)"""
    result = send_email("to@example.com", "제목", "<p>본문</p>")
    assert result is False


@patch.dict("os.environ", {"SMTP_USER": "", "SMTP_PASS": ""})
def test_send_email_no_credentials():
    """SMTP 자격증명 미설정 시 False"""
    assert send_email("to@example.com", "제목", "<p>본문</p>") is False


def test_send_email_invalid_address():
    """유효하지 않은 이메일 주소 → False"""
    assert send_email("", "제목", "<p>본문</p>") is False


def test_send_email_header_injection():
    """SMTP 헤더 인젝션 시도 → False"""
    assert send_email("evil@test.com\nBcc: hack@evil.com", "제목", "<p>본문</p>") is False
