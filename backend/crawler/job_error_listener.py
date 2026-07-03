"""APScheduler 잡 예외/누락(misfire) 최후 안전망 — DB 도달 전 죽는 잡도 알림.

배경: monitor.py 는 CrawlJob row 가 이미 기록된 실패만 감지한다. 잡이 CrawlJob 을
기록하기 전에 예외를 던지거나(예: 빌링키 04:50 크론이 시작 직후 죽음), APScheduler
가 misfire(누락)로 스킵하면 DB 흔적도 텔레그램도 없이 silent 로 사라진다.
본 모듈은 스케줄러 이벤트 레벨에서 이 두 상황을 감지하는 최후의 그물이다.

등록은 main.py 에서 register_job_listener(scheduler) 호출로 이뤄진다(본 모듈은 안 함).
"""

import logging
import time

from apscheduler.events import EVENT_JOB_ERROR, EVENT_JOB_MISSED

logger = logging.getLogger(__name__)

# 두 이벤트를 한 리스너에서 같이 받기 위한 마스크 (add_listener 두 번째 인자)
JOB_LISTENER_MASK = EVENT_JOB_ERROR | EVENT_JOB_MISSED

# 알림 쿨다운 — billing_charge.py _ALERT_COOLDOWN_SEC 패턴 답습.
# 같은 (kind, job_id) 조합은 이 시간 안에 재알림 억제 (스케줄러 폭주 시 텔레그램 스팸 방지).
_COOLDOWN_SEC = 600  # 10분
_last_alert_at: dict[str, float] = {}


def _should_alert(key: str) -> bool:
    """쿨다운 확인 — 억제 대상이면 False, 아니면 발송 허용하며 시각 기록."""
    now = time.monotonic()
    last = _last_alert_at.get(key)
    if last is not None and (now - last) < _COOLDOWN_SEC:
        return False
    _last_alert_at[key] = now
    return True


def _send_alert(message: str) -> None:
    """텔레그램 발송 — 실패해도 리스너를 죽이지 않음(best-effort, lazy import)."""
    try:
        from services.telegram import send_telegram
        send_telegram(message)
    except Exception:
        logger.warning("[scheduler] 텔레그램 알림 발송 실패", exc_info=True)


def job_event_listener(event) -> None:
    """APScheduler 잡 예외(EVENT_JOB_ERROR)/누락(EVENT_JOB_MISSED) 리스너.

    monitor.py 가 못 잡는, CrawlJob row 기록 이전 단계의 실패를 last-resort 로 감지.
    """
    if event.code == EVENT_JOB_ERROR:
        job_id = event.job_id
        exc_text = str(event.exception)[:300]
        logger.error("[scheduler] 잡 예외 job_id=%s: %s", job_id, event.exception)
        key = f"job_error:{job_id}"
        if _should_alert(key):
            _send_alert(f"[SCHEDULER] 잡 실패 job_id={job_id}: {exc_text}")
    elif event.code == EVENT_JOB_MISSED:
        job_id = event.job_id
        logger.warning(
            "[scheduler] 잡 누락(misfire) job_id=%s 예정시각=%s",
            job_id, event.scheduled_run_time,
        )
        key = f"job_missed:{job_id}"
        if _should_alert(key):
            _send_alert(
                f"[SCHEDULER] 잡 누락(misfire) job_id={job_id} "
                f"예정시각={event.scheduled_run_time}"
            )


def register_job_listener(scheduler) -> None:
    """scheduler 에 job_event_listener 를 등록 — main.py 에서 호출."""
    scheduler.add_listener(job_event_listener, JOB_LISTENER_MASK)
