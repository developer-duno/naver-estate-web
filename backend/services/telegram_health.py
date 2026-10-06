"""텔레그램 알림 통로 매일 점검 — best-effort (세션 439, 사장님 결정 2026-10-06).

왜: 서버 알림은 전부 텔레그램 한 통로로 나간다. 봇 열쇠가 만료되거나 봇이 대화방에서 빠지면
알림이 조용히 끊기는데, 그 사실을 알려 줄 통로가 바로 그 텔레그램이라 아무도 모른다.
그래서 매일 03:50 정비 잡(crawler/vacuum_maintenance.py)이 이 점검을 한 번 부른다.

무엇을: 서버가 쓰는 열쇠로 getMe(봇 열쇠가 살아 있나) + getChat(알림 받는 대화방에 닿나)
2번만 부른다 — 메시지는 보내지 않는다(사장님 폰이 울리지 않는다). 둘 중 하나라도 실패하면
보내는 Gmail 주소 자신(SMTP_FROM, 없으면 SMTP_USER)에게 우리말 메일 1통.

지키는 것:
  - 열쇠·대화방 번호·메일 주소·텔레그램 응답 원문은 로그·메일에 찍지 않는다(HTTP 상태 숫자만).
    네트워크 예외 문장에는 열쇠가 든 주소가 섞이므로 예외는 종류 이름만 남긴다.
  - TELEGRAM_ENABLED 가 true 가 아니거나 열쇠·대화방 값이 없으면 점검을 건너뛴다(INFO 1줄)
    — 알림을 안 쓰는 환경(시험 포함)에서 바깥 호출 0.
  - 무슨 일이 있어도 예외를 밖으로 내지 않는다 — 정비 잡 본체를 실패시키지 않는다.
"""

import logging
import os
from html import escape

import requests

logger = logging.getLogger(__name__)

API_BASE = "https://api.telegram.org"
MAIL_SUBJECT = "[2u부동산] 텔레그램 알림 통로가 막혔어요"
MAIL_SENDER_NAME = "2u부동산"
_TIMEOUT_SEC = 10

# (부를 기능, 사람이 읽는 이름, 실패했을 때 짐작되는 까닭)
_CHECKS = (
    ("getMe", "알림 봇 열쇠 확인", "봇 열쇠가 바뀌었거나 지워졌을 수 있어요."),
    ("getChat", "알림 받는 대화방 확인", "봇이 대화방에서 빠졌거나 대화방 번호가 바뀌었을 수 있어요."),
)


def _call(token: str, method: str, params: dict | None) -> str | None:
    """한 번 불러 보고, 괜찮으면 None · 실패면 쉬운 말 한 줄."""
    try:
        resp = requests.get(f"{API_BASE}/bot{token}/{method}", params=params, timeout=_TIMEOUT_SEC)
    except Exception as e:  # 예외 문장에 열쇠가 든 주소가 섞인다 — 종류 이름만
        logger.warning("[텔레그램 통로 점검] %s 연결 실패 — %s", method, type(e).__name__)
        return "텔레그램 서버에 닿지 못했어요(인터넷 연결 문제일 수 있어요)."
    if resp.status_code != 200:
        logger.warning("[텔레그램 통로 점검] %s 실패 — 상태 번호 %s", method, resp.status_code)
        return f"텔레그램이 거절했어요(상태 번호 {resp.status_code})."
    try:
        ok = resp.json().get("ok") is True
    except Exception:
        ok = False
    if not ok:
        logger.warning("[텔레그램 통로 점검] %s 실패 — 답이 '실패'", method)
        return "텔레그램 답이 '실패'였어요."
    return None


def build_mail_html(problems: list[str]) -> str:
    items = "".join(f"<li>{escape(p)}</li>" for p in problems)
    return f"""\
<div style="max-width:520px;margin:0 auto;font-family:sans-serif">
  <h2 style="color:#c5221f">텔레그램 알림 통로가 막혔어요</h2>
  <p>오늘 새벽 서버 점검에서 텔레그램으로 알림을 보낼 수 없는 상태를 발견했어요.
     이대로면 서버에 문제가 생겨도 휴대폰으로 알림이 오지 않아요.</p>
  <ul>{items}</ul>
  <p>봇 설정(봇 열쇠·대화방)을 확인해 주세요. 고쳐지면 다음 날 새벽 점검부터 이 메일이 오지 않아요.</p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
  <p style="color:#888;font-size:12px">매일 새벽 3시 50분 서버 정비 때 자동으로 확인해 보내는 메일이에요.</p>
</div>"""


def check_telegram_channel() -> dict:
    """텔레그램 통로 점검 1회. 결과 요약을 돌려준다(예외 전파 없음).

    {"checked": 점검했나, "ok": 통로가 멀쩡한가(점검 안 했으면 None), "mail_sent": 메일을 보냈나}
    """
    result: dict = {"checked": False, "ok": None, "mail_sent": False}
    try:
        if os.getenv("TELEGRAM_ENABLED", "false").lower() != "true":
            logger.info("[텔레그램 통로 점검] 알림이 꺼져 있어 건너뜀")
            return result
        token = os.getenv("TELEGRAM_BOT_TOKEN", "")
        chat_id = os.getenv("TELEGRAM_CHAT_ID", "")
        if not token or not chat_id:
            logger.info("[텔레그램 통로 점검] 봇 열쇠·대화방 값이 없어 건너뜀")
            return result

        result["checked"] = True
        problems: list[str] = []
        for method, label, cause in _CHECKS:
            params = {"chat_id": chat_id} if method == "getChat" else None
            why = _call(token, method, params)
            if why:
                problems.append(f"{label}: {why} {cause}")
        result["ok"] = not problems
        if not problems:
            logger.info("[텔레그램 통로 점검] 정상")
            return result

        to = os.getenv("SMTP_FROM") or os.getenv("SMTP_USER")
        if not to:
            logger.warning("[텔레그램 통로 점검] 막혔는데 알릴 메일 주소가 설정돼 있지 않음")
            return result
        from services.email import send_email

        result["mail_sent"] = send_email(
            to, MAIL_SUBJECT, build_mail_html(problems), sender_name=MAIL_SENDER_NAME
        )
        return result
    except Exception:
        logger.warning("[텔레그램 통로 점검] 점검 자체가 실패 (정비 잡에는 영향 없음)", exc_info=True)
        return result
