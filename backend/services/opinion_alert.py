"""새 의견 텔레그램 알림 — best-effort (실패해도 예외 전파 안 함, 세션 433).

손님이 "의견 보내기"로 글을 보내면 사장님 텔레그램에 한 통 보낸다. 의견 자체는 이미 DB 에
저장된 뒤라, 알림이 실패해도 관리자 화면 "의견함"에서 보인다.

⚠ 손님 글이 그대로 들어가는 알림이라 지키는 것:
  - parse_mode=None(평문) — `<b>` 같은 글을 서식으로 해석하지 않고 글자 그대로 보낸다.
  - 줄바꿈·연속 공백을 공백 하나로 접는다 — 손님이 "[서버 알림]" 같은 가짜 줄을 만들 수 없다.
  - 내용은 150자로 자른다 · 이메일은 가린다(routers/payment.py _mask_email 재사용).
  - 폭주 방지: 한국 시각 기준 한 시간에 20통까지만 한 건씩 보내고, 그 뒤로 오는 것은
    그 시간이 끝날 때 "이번 시간에 의견 N건이 더 왔어요" **한 통**으로 묶는다(모듈 메모리 카운터 —
    재시작하면 0 부터 다시 센다).
"""

import logging
import re
import threading
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)

KST = ZoneInfo("Asia/Seoul")
HOURLY_LIMIT = 20
ADMIN_URL = "https://2u.pe.kr/admin/opinions"
_MESSAGE_PREVIEW_CHARS = 150

KIND_WORDS = {
    "bug": "버그·오류",
    "data": "정보가 틀려요",
    "suggest": "건의·제안",
    "other": "기타",
}

_lock = threading.Lock()
_hour_key: str | None = None  # 지금 세는 시간 "YYYY-MM-DD HH"(한국 시각)
_sent_in_hour = 0
_overflow: dict[str, int] = {}  # 시간 → 한도 넘어 묶인 건수(아직 안 보낸 것)


def _reset_for_tests() -> None:
    """시험 사이 카운터 초기화(모듈 메모리라 시험끼리 섞이지 않게)."""
    global _hour_key, _sent_in_hour
    with _lock:
        _hour_key = None
        _sent_in_hour = 0
        _overflow.clear()


def _key_of(now: datetime) -> str:
    return now.astimezone(KST).strftime("%Y-%m-%d %H")


def _seconds_to_next_hour(now: datetime) -> float:
    local = now.astimezone(KST)
    next_hour = local.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
    return max(1.0, (next_hour - local).total_seconds())


def _preview(message: str) -> str:
    flat = re.sub(r"\s+", " ", message or "").strip()
    if len(flat) > _MESSAGE_PREVIEW_CHARS:
        return flat[:_MESSAGE_PREVIEW_CHARS] + "…"
    return flat


def build_new_opinion_text(kind: str, page_path: str | None, user_email: str | None, message: str) -> str:
    """새 의견 알림 본문(평문)."""
    if user_email:
        from routers.payment import _mask_email

        sender = f"로그인({_mask_email(user_email)})"
    else:
        sender = "로그인 안 함"
    return "\n".join([
        "[서버 알림] 💬 새 의견이 왔어요",
        f"종류: {KIND_WORDS.get(kind, '기타')}",
        f"화면: {page_path or '알 수 없음'}",
        f"보낸 분: {sender}",
        f"내용: {_preview(message)}",
        f"답하기: {ADMIN_URL}",
    ])


def build_overflow_text(count: int) -> str:
    """시간당 한도를 넘은 의견 묶음 알림 본문(평문)."""
    return "\n".join([
        f"[서버 알림] 💬 이번 시간에 의견 {count}건이 더 왔어요(관리자 화면에서 보세요)",
        f"답하기: {ADMIN_URL}",
    ])


def _send(text: str) -> None:
    from services.telegram import send_telegram

    send_telegram(text, parse_mode=None)


def flush_overflow(hour_key: str) -> None:
    """그 시간에 묶인 의견 수를 한 통으로 보낸다(시간이 끝날 때 타이머가 부른다)."""
    try:
        with _lock:
            count = _overflow.pop(hour_key, 0)
        if count:
            _send(build_overflow_text(count))
    except Exception:
        logger.warning("의견 묶음 알림 실패 (의견은 저장돼 있음)", exc_info=True)


def _schedule_overflow_flush(hour_key: str, delay_seconds: float) -> None:
    timer = threading.Timer(delay_seconds, flush_overflow, args=(hour_key,))
    timer.daemon = True
    timer.start()


def notify_new_opinion(
    *,
    kind: str,
    page_path: str | None,
    user_email: str | None,
    message: str,
    now: datetime | None = None,
) -> None:
    """새 의견 알림 — 시간당 20통까지 한 건씩, 그 뒤는 묶음 한 통. 예외를 밖으로 내지 않는다."""
    global _hour_key, _sent_in_hour
    try:
        now = now or datetime.now(KST)
        key = _key_of(now)
        text: str | None = None
        schedule = False
        with _lock:
            if _hour_key != key:
                _hour_key = key
                _sent_in_hour = 0
            if _sent_in_hour < HOURLY_LIMIT:
                _sent_in_hour += 1
                text = build_new_opinion_text(kind, page_path, user_email, message)
            else:
                _overflow[key] = _overflow.get(key, 0) + 1
                schedule = _overflow[key] == 1  # 그 시간의 첫 초과 때만 타이머 1개
        if text is not None:
            _send(text)
        elif schedule:
            _schedule_overflow_flush(key, _seconds_to_next_hour(now))
    except Exception:
        logger.warning("새 의견 알림 실패 (의견은 저장돼 있음)", exc_info=True)
