"""새 의견 텔레그램 알림 — best-effort (실패해도 예외 전파 안 함, 세션 433).

손님이 "의견 보내기"로 글을 보내면 사장님 텔레그램에 한 통 보낸다. 의견 자체는 이미 DB 에
저장된 뒤라, 알림이 실패해도 관리자 화면 "의견함"에서 보인다.

⚠ 손님 글이 그대로 들어가는 알림이라 지키는 것:
  - parse_mode=None(평문) — `<b>` 같은 글을 서식으로 해석하지 않고 글자 그대로 보낸다.
  - 링크 미리보기 끔 — 주소가 카드로 펼쳐지지 않게(다른 알림 창구는 기본값 그대로).
  - 줄바꿈·연속 공백을 공백 하나로 접는다 — 손님이 "[서버 알림]" 같은 가짜 줄을 만들 수 없다.
  - 내용은 150자로 자른다 · 이메일은 가린다(routers/payment.py _mask_email 재사용).
  - 폭주 방지: 한국 시각 기준 한 시간에 20통까지만 한 건씩 보내고, 21번째가 오는 **그 순간**
    "알림을 잠시 멈춰요" 한 통을 보낸 뒤 그 시간 동안은 더 안 보낸다(모듈 메모리 카운터 —
    재시작하면 0 부터 다시 센다). 타이머를 두지 않는 이유 = 웹 프로세스 안 타이머는 재시작·시험에서
    새는 자원이고, 시간이 끝나야 알리면 사장님이 늦게 안다.
  - 처음 보는 화면 오류 알림은 **따로 센다**(시간당 10통, 11번째에 오류 전용 "잠시 멈춤" 1통 —
    2026-10-06 사장님 결정). 오류가 몰려도 손님 의견 알림은 막히지 않고, 의견이 몰려도 오류 알림은 막히지 않는다.
"""

import logging
import re
import threading
from datetime import datetime
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)

KST = ZoneInfo("Asia/Seoul")
HOURLY_LIMIT = 20  # 새 의견 알림 시간당 상한
ERROR_HOURLY_LIMIT = 10  # 처음 보는 오류 알림 시간당 상한(의견과 카운터가 따로다)
ADMIN_URL = "https://2u.pe.kr/admin/opinions"
_MESSAGE_PREVIEW_CHARS = 150
_ERROR_PREVIEW_CHARS = 100

KIND_WORDS = {
    "bug": "버그·오류",
    "data": "정보가 틀려요",
    "suggest": "건의·제안",
    "other": "기타",
}

_lock = threading.Lock()
# 카운터 이름("opinion"·"error") → (지금 세는 시간 "YYYY-MM-DD HH"(한국 시각), 그 시간에 들어온 수 —
# 알림을 보냈든 안 보냈든)
_counters: dict[str, tuple[str, int]] = {}


def _reset_for_tests() -> None:
    """시험 사이 카운터 초기화(모듈 메모리라 시험끼리 섞이지 않게) — 의견·오류 카운터 둘 다."""
    with _lock:
        _counters.clear()


def _key_of(now: datetime) -> str:
    return now.astimezone(KST).strftime("%Y-%m-%d %H")


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


def build_pause_text() -> str:
    """시간당 한도(20통)를 넘은 순간 한 번 보내는 "잠시 멈춤" 알림 본문(평문)."""
    return "\n".join([
        f"[서버 알림] 💬 이번 시간엔 의견이 {HOURLY_LIMIT}건을 넘어 알림을 잠시 멈춰요(관리자 화면에서 보세요)",
        f"답하기: {ADMIN_URL}",
    ])


def build_error_pause_text() -> str:
    """처음 보는 오류 알림이 시간당 한도(10통)를 넘은 순간 한 번 보내는 "잠시 멈춤" 알림 본문(평문)."""
    return "\n".join([
        f"[서버 알림] 🧯 이번 시간엔 처음 보는 오류가 {ERROR_HOURLY_LIMIT}건을 넘어 오류 알림을 잠시 멈춰요"
        "(관리자 화면에서 보세요)",
        f"보기: {ADMIN_URL}",
    ])


def _send(text: str) -> None:
    from services.telegram import send_telegram

    # 링크 미리보기 끔 — "답하기" 주소가 카드로 펼쳐져 손님 글이 밀려 보이지 않게(2026-10-06 사장님 결정).
    send_telegram(text, parse_mode=None, disable_link_preview=True)


def _send_limited(text: str, now: datetime | None, *, counter: str, limit: int, build_pause) -> None:
    """시간당 상한을 지키며 한 통 — limit 통까지 그대로, limit+1 번째에 "잠시 멈춤" 1통, 그 뒤 그 시간엔 0통.

    counter 이름마다 카운터가 따로다 — 새 의견("opinion", 20통)과 처음 보는 오류("error", 10통)는 서로의 몫을 안 먹는다.
    """
    now = now or datetime.now(KST)
    key = _key_of(now)
    with _lock:
        hour_key, count = _counters.get(counter, (None, 0))
        if hour_key != key:
            count = 0
        count += 1
        _counters[counter] = (key, count)
    if count <= limit:
        _send(text)
    elif count == limit + 1:
        _send(build_pause())


def notify_new_opinion(
    *,
    kind: str,
    page_path: str | None,
    user_email: str | None,
    message: str,
    now: datetime | None = None,
) -> None:
    """새 의견 알림 — 시간당 20통까지 한 건씩, 21번째에 "잠시 멈춤" 1통, 그 뒤 그 시간엔 0통.

    예외를 밖으로 내지 않는다.
    """
    try:
        _send_limited(
            build_new_opinion_text(kind, page_path, user_email, message), now,
            counter="opinion", limit=HOURLY_LIMIT, build_pause=build_pause_text,
        )
    except Exception:
        logger.warning("새 의견 알림 실패 (의견은 저장돼 있음)", exc_info=True)


def build_new_error_text(page_path: str | None, error_line: str) -> str:
    """처음 보는 손님 화면 오류 알림 본문(평문). 오류 글은 줄바꿈을 접고 100자로 자른다."""
    flat = re.sub(r"\s+", " ", error_line or "").strip()
    if len(flat) > _ERROR_PREVIEW_CHARS:
        flat = flat[:_ERROR_PREVIEW_CHARS] + "…"
    return "\n".join([
        "[서버 알림] 🧯 손님 화면에서 처음 보는 오류가 났어요",
        f"화면: {page_path or '알 수 없음'}",
        f"오류: {flat or '내용 없음'}",
        "→ 같은 오류가 또 나면 알림 없이 횟수만 셉니다. 관리자 의견함에서 볼 수 있어요.",
    ])


def notify_new_error(*, page_path: str | None, error_line: str, now: datetime | None = None) -> None:
    """처음 보는 오류 알림 1통 — 새 의견 알림과 **따로 센다**: 시간당 10통까지, 11번째에 오류 전용 "잠시 멈춤" 1통,
    그 뒤 그 시간엔 0통. 예외를 밖으로 내지 않는다.

    반복된 오류(이미 있는 지문)는 라우터가 이 함수를 부르지 않는다.
    """
    try:
        _send_limited(
            build_new_error_text(page_path, error_line), now,
            counter="error", limit=ERROR_HOURLY_LIMIT, build_pause=build_error_pause_text,
        )
    except Exception:
        logger.warning("새 오류 알림 실패 (오류 기록은 저장돼 있음)", exc_info=True)
