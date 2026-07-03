"""APScheduler 잡 예외/누락(misfire) 최후 안전망 테스트.

conftest.py:26 이 TELEGRAM_ENABLED=false 를 강제하므로 실제 텔레그램 발송은 절대 안 나간다
(세션 325 사고 재발방지 답습). 여기서는 job_error_listener.send_telegram 을 mock 해
"알림을 보내려 시도했는지"만 검증한다.

실행: python -m pytest tests/test_job_error_listener.py -v
"""

from types import SimpleNamespace
from unittest.mock import patch

from apscheduler.events import EVENT_JOB_ERROR, EVENT_JOB_MISSED

from crawler import job_error_listener
from crawler.job_error_listener import (
    JOB_LISTENER_MASK,
    job_event_listener,
)


def setup_function():
    """테스트 간 쿨다운 dict 초기화 — 순서 의존 방지."""
    job_error_listener._last_alert_at.clear()


def _error_event(job_id="test_job", exception=None):
    """EVENT_JOB_ERROR 모양 fake event (JobExecutionEvent 답습)."""
    return SimpleNamespace(
        code=EVENT_JOB_ERROR,
        job_id=job_id,
        jobstore="default",
        scheduled_run_time=None,
        retval=None,
        exception=exception or ValueError("결제 실패"),
        traceback="Traceback (most recent call last): ...",
    )


def _missed_event(job_id="test_job", scheduled_run_time="2026-07-04T04:50:00+00:00"):
    """EVENT_JOB_MISSED 모양 fake event (JobEvent 답습)."""
    return SimpleNamespace(
        code=EVENT_JOB_MISSED,
        job_id=job_id,
        jobstore="default",
        scheduled_run_time=scheduled_run_time,
    )


def test_job_listener_mask_combines_both_events():
    """마스크가 EVENT_JOB_ERROR|EVENT_JOB_MISSED 를 모두 포함."""
    assert JOB_LISTENER_MASK & EVENT_JOB_ERROR
    assert JOB_LISTENER_MASK & EVENT_JOB_MISSED


def test_job_error_sends_telegram_with_job_id_and_exception():
    """EVENT_JOB_ERROR → send_telegram 1회 호출, 메시지에 job_id·예외 텍스트 포함."""
    with patch("services.telegram.send_telegram") as mock_send:
        event = _error_event(job_id="billing_charge", exception=ValueError("PortOne 500"))
        job_event_listener(event)

    mock_send.assert_called_once()
    msg = mock_send.call_args[0][0]
    assert "billing_charge" in msg
    assert "PortOne 500" in msg


def test_job_missed_sends_telegram_with_misfire_wording():
    """EVENT_JOB_MISSED → 메시지에 누락/misfire 표현 포함."""
    with patch("services.telegram.send_telegram") as mock_send:
        event = _missed_event(job_id="collect_prices")
        job_event_listener(event)

    mock_send.assert_called_once()
    msg = mock_send.call_args[0][0]
    assert "누락" in msg or "misfire" in msg.lower()
    assert "collect_prices" in msg


def test_cooldown_suppresses_duplicate_alert_within_window():
    """같은 (kind, job_id) 키는 쿨다운 안에 두 번째 호출이 재발송 안 함."""
    with patch("services.telegram.send_telegram") as mock_send:
        job_event_listener(_error_event(job_id="dup_job"))
        job_event_listener(_error_event(job_id="dup_job"))

    mock_send.assert_called_once()


def test_cooldown_is_independent_per_kind_and_job_id():
    """다른 job_id / 다른 kind(error vs missed) 는 쿨다운 공유 안 함."""
    with patch("services.telegram.send_telegram") as mock_send:
        job_event_listener(_error_event(job_id="job_a"))
        job_event_listener(_error_event(job_id="job_b"))
        job_event_listener(_missed_event(job_id="job_a"))

    assert mock_send.call_count == 3


def test_telegram_failure_does_not_raise():
    """send_telegram 이 예외를 던져도 리스너는 조용히 흡수 (best-effort)."""
    with patch("services.telegram.send_telegram", side_effect=RuntimeError("network down")):
        job_event_listener(_error_event(job_id="resilient_job"))
    # 여기까지 도달하면 예외가 전파되지 않은 것 — assert 불필요, 통과 자체가 검증.


def test_missed_event_without_exception_attr_does_not_crash():
    """JobEvent(EVENT_JOB_MISSED) 는 exception 속성이 없다 — hasattr 접근 없이 code 분기만 사용."""
    with patch("services.telegram.send_telegram") as mock_send:
        event = _missed_event(job_id="no_exc_job")
        assert not hasattr(event, "exception")
        job_event_listener(event)

    mock_send.assert_called_once()
