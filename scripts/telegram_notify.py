"""watchdog 용 소형 텔레그램 발송 — backend/services/telegram.py 와 동일 로직.

watchdog 은 백엔드와 별도 프로세스라 backend 모듈 import 불가 → 격리 복제.
환경변수는 backend/.env 를 명시 로드.
"""

import logging
import os

import requests
from dotenv import load_dotenv

# backend/.env 명시 로드 (watchdog cwd 는 scripts/)
_ENV = os.path.join(os.path.dirname(__file__), "..", "backend", ".env")
load_dotenv(_ENV)

logger = logging.getLogger("startup")


def notify(text: str) -> bool:
    """텔레그램 발송. 실패해도 예외 전파 안 함."""
    if os.getenv("TELEGRAM_ENABLED", "false").lower() != "true":
        return False
    token = os.getenv("TELEGRAM_BOT_TOKEN", "")
    chat_id = os.getenv("TELEGRAM_CHAT_ID", "")
    if not token or not chat_id:
        return False
    try:
        resp = requests.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": chat_id, "text": text},
            timeout=10,
        )
        return resp.status_code == 200
    except Exception as e:
        logger.warning("[watchdog] 텔레그램 발송 실패 — %s", type(e).__name__)
        return False
