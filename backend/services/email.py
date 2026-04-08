"""검증 승인/거부 이메일 알림 — Gmail SMTP, best-effort (실패해도 예외 전파 안 함)"""

import email.utils
import logging
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from html import escape

logger = logging.getLogger(__name__)


def send_email(to: str, subject: str, html_body: str) -> bool:
    """SMTP로 HTML 이메일 발송. 실패 시 False 반환 (예외 전파 금지)."""
    # 이메일 주소 검증 — SMTP 헤더 인젝션 방지
    parsed = email.utils.parseaddr(to)
    if not parsed[1] or "\n" in parsed[1] or "\r" in parsed[1]:
        logger.warning("[email] 유효하지 않은 이메일 주소: %s", to)
        return False

    host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    port = int(os.getenv("SMTP_PORT", "465"))
    user = os.getenv("SMTP_USER", "")
    password = os.getenv("SMTP_PASS", "")
    sender = os.getenv("SMTP_FROM", user)

    if not user or not password:
        logger.info("[email] SMTP_USER/SMTP_PASS 미설정 — 이메일 건너뜀")
        return False

    try:
        msg = MIMEMultipart("alternative")
        msg["From"] = email.utils.formataddr(("네이버부동산", sender))
        msg["To"] = to
        msg["Subject"] = subject
        msg.attach(MIMEText(html_body, "html", "utf-8"))

        with smtplib.SMTP_SSL(host, port, timeout=10) as server:
            server.login(user, password)
            server.sendmail(sender, [to], msg.as_string())

        logger.info("[email] 발송 성공: %s", to)
        return True
    except Exception:
        logger.warning("[email] 발송 실패: %s", to, exc_info=True)
        return False


def build_approval_email(user_email: str) -> tuple[str, str]:
    """승인 알림 이메일 제목+본문 반환."""
    subject = "[네이버부동산] 중개사 인증이 승인되었습니다"
    html = f"""\
<div style="max-width:480px;margin:0 auto;font-family:sans-serif">
  <h2 style="color:#1a73e8">인증 승인 완료</h2>
  <p>{escape(user_email)}님의 중개사 인증이 <strong>승인</strong>되었습니다.</p>
  <p>전문가(Expert) 권한이 부여되어 추가 기능을 이용하실 수 있습니다.</p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
  <p style="color:#888;font-size:12px">본 메일은 자동 발송되었습니다.</p>
</div>"""
    return subject, html


def build_rejection_email(user_email: str, reason: str) -> tuple[str, str]:
    """거부 알림 이메일 제목+본문 반환. reason은 HTML 이스케이프됨."""
    safe_reason = escape(reason)
    subject = "[네이버부동산] 중개사 인증이 반려되었습니다"
    html = f"""\
<div style="max-width:480px;margin:0 auto;font-family:sans-serif">
  <h2 style="color:#d93025">인증 반려 안내</h2>
  <p>{escape(user_email)}님의 중개사 인증이 <strong>반려</strong>되었습니다.</p>
  <div style="background:#fef2f2;border-radius:8px;padding:12px 16px;margin:16px 0">
    <p style="margin:0;font-weight:600;color:#991b1b">반려 사유</p>
    <p style="margin:4px 0 0;color:#7f1d1d">{safe_reason}</p>
  </div>
  <p>사유 확인 후 재신청이 가능합니다.</p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
  <p style="color:#888;font-size:12px">본 메일은 자동 발송되었습니다.</p>
</div>"""
    return subject, html
