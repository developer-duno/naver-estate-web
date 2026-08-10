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
    """EVENT_JOB_ERROR → send_telegram 1회 호출, 메시지에 (한글 라벨로 치환된)
    잡 식별 정보·예외 텍스트 포함.

    세션 359: 예전엔 영문 job_id 를 그대로 노출했으나(사장님이 "뭔지 모르겠다"고
    지적), 이제 한글 라벨로 치환한다 — 이 테스트도 새 동작에 맞게 정정
    (§testing.md "통과하던 테스트가 결함을 박제했을 수 있다" 답습). 한글 라벨
    자체의 상세 검증은 test_job_error_message_falls_back_to_label_table_without_scheduler.
    """
    with patch("services.telegram.send_telegram") as mock_send:
        event = _error_event(job_id="billing_charge", exception=ValueError("PortOne 500"))
        job_event_listener(event)

    mock_send.assert_called_once()
    msg = mock_send.call_args[0][0]
    assert "빌링키 자동결제" in msg  # 영문 job_id 대신 한글 라벨(폴백 표 경유)
    assert "PortOne 500" in msg


def test_job_missed_sends_telegram_with_misfire_wording():
    """EVENT_JOB_MISSED → 메시지에 누락/misfire 표현 + 한글 라벨 포함 (세션 359 정정)."""
    with patch("services.telegram.send_telegram") as mock_send:
        event = _missed_event(job_id="collect_prices")
        job_event_listener(event)

    mock_send.assert_called_once()
    msg = mock_send.call_args[0][0]
    assert "누락" in msg or "misfire" in msg.lower()
    assert "시세 이력 수집" in msg  # 영문 job_id 대신 한글 라벨


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


# ── 세션 359: 두루뭉술한 알림 개선(한글 라벨·원인 위치·관리자 링크) ──
#
# 배경: 옛 메시지("[내부즉시] 잡 실패 job_id=crawl_details: InFailedSqlTransaction...")
# 가 영문 job_id·raw 예외타입만 찍혀 "뭐가 문제인지 안 나온다"는 지적을 받음.
# 사장님이 명시한 3요구사항(한글 설명/원인 추적/관리자 링크)을 직접 재현·검증한다.

def _error_event_with_traceback(job_id, exception, tb_text):
    """traceback 필드를 담은 EVENT_JOB_ERROR fake event."""
    return SimpleNamespace(
        code=EVENT_JOB_ERROR,
        job_id=job_id,
        jobstore="default",
        scheduled_run_time=None,
        retval=None,
        exception=exception,
        traceback=tb_text,
    )


class _FakeJob:
    def __init__(self, name):
        self.name = name


class _FakeScheduler:
    """scheduler.get_job(job_id) 를 흉내내는 최소 더블."""

    def __init__(self, jobs: dict):
        self._jobs = jobs

    def get_job(self, job_id):
        return self._jobs.get(job_id)


def test_job_error_message_uses_korean_label_via_scheduler():
    """scheduler 가 주입되면 job_id 대신 scheduler.get_job(...).name(한글) 사용."""
    scheduler = _FakeScheduler({"crawl_details": _FakeJob("매물 상세 보강")})
    with patch("services.telegram.send_telegram") as mock_send:
        event = _error_event(job_id="crawl_details", exception=ValueError("DB 오류"))
        job_event_listener(event, scheduler)

    msg = mock_send.call_args[0][0]
    assert "매물 상세 보강" in msg
    # 사람이 못 알아보는 영문 코드가 본문 라벨 자리에 그대로 노출되지 않아야 함
    assert "job_id=crawl_details" not in msg


def test_job_error_message_falls_back_to_label_table_without_scheduler():
    """scheduler 조회가 안 될 때(테스트·초기화 전) 폴백 표로 한글 라벨을 채운다."""
    with patch("services.telegram.send_telegram") as mock_send:
        event = _error_event(job_id="billing_charge", exception=ValueError("PortOne 500"))
        # scheduler=None → _JOB_LABEL_FALLBACK 경유
        job_event_listener(event, None)

    msg = mock_send.call_args[0][0]
    assert "빌링키 자동결제" in msg
    assert "PortOne 500" in msg  # 실제 예외 메시지는 항상 보존


def test_job_error_message_extracts_own_code_location_not_library_frame():
    """traceback 에 우리 코드+라이브러리 프레임이 섞이면 우리 코드 위치를 우선 노출.

    오늘 실사고 재현: crawl_details 가 service_discover.py 에서 db.commit() 하다
    InFailedSqlTransaction 으로 죽고, 그 아래 sqlalchemy 내부 프레임까지 traceback
    에 남는 상황. site-packages 프레임이 아니라 우리 소스 위치가 나와야 한다.
    """
    tb = (
        '  File "/app/backend/crawler/service_discover.py", line 481, in crawl_article_details\n'
        "    db.commit()\n"
        '  File "/app/backend/venv/lib/site-packages/sqlalchemy/orm/session.py", line 1234, in commit\n'
        "    self._transaction.commit()\n"
        "psycopg2.errors.InFailedSqlTransaction: current transaction is aborted, "
        "commands ignored until end of transaction block"
    )
    scheduler = _FakeScheduler({"crawl_details": _FakeJob("매물 상세 보강")})
    with patch("services.telegram.send_telegram") as mock_send:
        event = _error_event_with_traceback(
            "crawl_details", ValueError("InFailedSqlTransaction"), tb,
        )
        job_event_listener(event, scheduler)

    msg = mock_send.call_args[0][0]
    assert "service_discover.py" in msg
    assert "481" in msg
    assert "site-packages" not in msg  # 라이브러리 내부 프레임이 아니라 우리 코드가 나와야 함


def test_job_error_message_includes_admin_link():
    """모든 실패 알림에 관리자 화면 바로가기 링크가 포함된다."""
    with patch("services.telegram.send_telegram") as mock_send:
        event = _error_event(job_id="collect_emergency", exception=ValueError("API 실패"))
        job_event_listener(event, None)

    msg = mock_send.call_args[0][0]
    assert "/admin#scheduler" in msg


def test_job_error_message_sends_as_html_and_escapes_label():
    """HTML parse_mode 로 발송되고, 라벨·원인 등 동적 텍스트는 이스케이프된다(태그 주입 방지)."""
    scheduler = _FakeScheduler({"weird_job": _FakeJob("<script>위험</script>")})
    with patch("services.telegram.send_telegram") as mock_send:
        event = _error_event(job_id="weird_job", exception=ValueError("오류"))
        job_event_listener(event, scheduler)

    args, kwargs = mock_send.call_args
    msg = args[0]
    assert kwargs.get("parse_mode") == "HTML" or (len(args) > 1 and args[1] == "HTML")
    assert "<script>" not in msg  # 이스케이프돼 &lt;script&gt; 형태여야 함
    assert "&lt;script&gt;" in msg


def test_job_error_without_traceback_still_shows_exception_message():
    """traceback 이 없거나 File 줄이 없어도 실제 예외 메시지는 반드시 보여준다.

    위치 추출 실패가 정작 중요한 예외 메시지를 가리면 안 된다(회귀 재발 방지 —
    이전 구현이 traceback 마지막 줄을 잘못 원인으로 채택해 실제 예외 메시지가
    통째로 누락된 적이 있었다)."""
    with patch("services.telegram.send_telegram") as mock_send:
        event = _error_event_with_traceback(
            "billing_charge", ValueError("PortOne 500"),
            tb_text="Traceback (most recent call last): ...",  # File 줄 없는 비정형 텍스트
        )
        job_event_listener(event, None)

    msg = mock_send.call_args[0][0]
    assert "PortOne 500" in msg
