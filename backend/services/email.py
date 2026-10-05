"""검증 승인/거부 이메일 알림 — Gmail SMTP, best-effort (실패해도 예외 전파 안 함)"""

import email.utils
import logging
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from html import escape

logger = logging.getLogger(__name__)


def send_email(to: str, subject: str, html_body: str, sender_name: str = "네이버부동산") -> bool:
    """SMTP로 HTML 이메일 발송. 실패 시 False 반환 (예외 전파 금지).

    sender_name: 받는 사람 메일함에 보이는 보낸 사람 이름. 기존 호출은 기본값 그대로,
    의견 답장 메일만 "2u부동산"(세션 433).
    """
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
        msg["From"] = email.utils.formataddr((sender_name, sender))
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


def build_billing_failed_email(user_email: str) -> tuple[str, str]:
    """자동결제 연속 실패 → 구독 중단 안내. 사용자가 카드를 재등록하도록 유도 (적대검증 #6)."""
    subject = "[네이버부동산] 자동결제에 실패하여 구독이 중단되었습니다"
    html = f"""\
<div style="max-width:480px;margin:0 auto;font-family:sans-serif">
  <h2 style="color:#d93025">자동결제 실패 안내</h2>
  <p>{escape(user_email)}님의 이용권 자동결제가 연속 실패하여 <strong>자동결제가 중단</strong>되었습니다.</p>
  <p>카드 잔액·한도·유효기간을 확인하신 후, 마이페이지에서 <strong>카드를 다시 등록</strong>해 주세요.</p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
  <p style="color:#888;font-size:12px">본 메일은 자동 발송되었습니다.</p>
</div>"""
    return subject, html


OPINION_REPLY_SENDER_NAME = "2u부동산"
_OPINION_ORIGINAL_CHARS = 200


def build_opinion_reply_email(user_email: str, original: str | None, reply: str) -> tuple[str, str]:
    """의견 답장 메일 제목+본문 (세션 433). 손님 원문(200자)과 관리자 답 **둘 다** HTML 이스케이프.

    원문은 손님이 쓴 글이라 `<script>`·`<a href>` 같은 것이 들어올 수 있다 — 이스케이프하지
    않으면 우리 이름으로 나가는 메일에 남이 만든 링크·서식이 박힌다.
    원문이 1년 정리로 지워졌으면(None) 원문 칸을 비운다.
    """
    subject = "[2u부동산] 보내 주신 의견에 답장이 왔어요"
    original_text = (original or "")[:_OPINION_ORIGINAL_CHARS]
    if original and len(original) > _OPINION_ORIGINAL_CHARS:
        original_text += "…"
    html = f"""<div style="max-width:480px;margin:0 auto;font-family:sans-serif">
  <h2 style="color:#1a73e8">보내 주신 의견에 답장이 왔어요</h2>
  <p>{escape(user_email)}님, 2u부동산에 의견을 보내 주셔서 고맙습니다.</p>
  <div style="background:#f5f5f5;border-radius:8px;padding:12px 16px;margin:16px 0">
    <p style="margin:0;font-weight:600;color:#555">보내 주신 의견</p>
    <p style="margin:4px 0 0;color:#333;white-space:pre-wrap">{escape(original_text)}</p>
  </div>
  <div style="background:#eef4fd;border-radius:8px;padding:12px 16px;margin:16px 0">
    <p style="margin:0;font-weight:600;color:#1a4fa0">답장</p>
    <p style="margin:4px 0 0;color:#1f2937;white-space:pre-wrap">{escape(reply)}</p>
  </div>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
  <p style="color:#888;font-size:12px">본 메일은 자동 발송되었습니다. 이 메일에 회신해도 답을 받을 수 없어요 — 사이트의 "의견 보내기"를 이용해 주세요.</p>
</div>"""
    return subject, html
