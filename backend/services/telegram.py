"""운영 알림 텔레그램 발송 — best-effort (실패해도 예외 전파 안 함)

크롤링 수집기 장애 알림용. 사용자(공인중개사) 대상 알림은 services/email.py.
"""

import logging
import os

import requests

logger = logging.getLogger(__name__)


def send_telegram(text: str, parse_mode: str | None = None, disable_link_preview: bool = False) -> bool:
    """텔레그램 봇으로 메시지 발송. 실패 시 False 반환 (예외 전파 금지).

    환경변수: TELEGRAM_ENABLED / TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID.
    parse_mode: None 이면 평문, "HTML"/"MarkdownV2" 면 텔레그램 서식 적용.
    disable_link_preview: True 면 본문 속 주소의 미리보기 카드를 끈다 — Bot API sendMessage 의
      `link_preview_options` = LinkPreviewOptions{is_disabled: true}(공식 문서 core.telegram.org/bots/api,
      옛 disable_web_page_preview 칸은 지금 문서에 없다). 기본값 False = 예전 동작 그대로.
    """
    if os.getenv("TELEGRAM_ENABLED", "false").lower() != "true":
        logger.info("[telegram] TELEGRAM_ENABLED 아님 — 발송 건너뜀")
        return False

    token = os.getenv("TELEGRAM_BOT_TOKEN", "")
    chat_id = os.getenv("TELEGRAM_CHAT_ID", "")
    if not token or not chat_id:
        logger.info("[telegram] BOT_TOKEN/CHAT_ID 미설정 — 발송 건너뜀")
        return False

    payload: dict = {"chat_id": chat_id, "text": text}
    if parse_mode is not None:
        payload["parse_mode"] = parse_mode
    if disable_link_preview:
        payload["link_preview_options"] = {"is_disabled": True}

    try:
        resp = requests.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json=payload,
            timeout=10,
        )
        if resp.status_code == 200:
            logger.info("[telegram] 발송 성공")
            return True
        logger.warning("[telegram] 발송 실패 — status %s, %s", resp.status_code, resp.text[:200])
        return False
    except Exception as e:
        logger.warning("[telegram] 발송 예외 — %s", type(e).__name__)
        return False
