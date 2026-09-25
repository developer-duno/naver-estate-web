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
    잡 식별 정보 + 우리말 까닭 한 줄 포함.

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
    assert "구독료 자동 결제" in msg  # 영문 job_id 대신 한글 라벨(폴백 표 경유, 세션 418 이름 통일)
    # 세션 410: 예외 원문("PortOne 500")은 알림에 안 싣는다 — 사장님이 못 읽는 글자라서.
    # 대신 "왜 실패했는지 한 줄"이 반드시 있어야 알림이 쓸모가 있다. 원문은 바로 위
    # logger.error 에 남아 추적에 지장 없다(test_job_error_location_goes_to_log_not_telegram).
    assert "PortOne 500" not in msg, msg
    assert "까닭:" in msg and "처음 보는 문제예요" in msg, msg


def test_job_missed_sends_telegram_with_misfire_wording():
    """EVENT_JOB_MISSED → "정해진 시각에 못 돌렸다"는 뜻 + 한글 라벨 포함.

    단언의 의도는 "이 알림이 '예정된 실행을 건너뛴 것'임을 사장님이 알 수 있는가" 다
    — 그 의도는 그대로 두고 표현만 새 문구에 맞춘다. 세션 408 에 '누락(misfire)' 을
    뺀 이유: 둘 다 사장님이 쓰지 않는 말이다(지시: "어려운 말은 금지").
    """
    with patch("services.telegram.send_telegram") as mock_send:
        event = _missed_event(job_id="collect_prices")
        job_event_listener(event)

    mock_send.assert_called_once()
    msg = mock_send.call_args[0][0]
    assert "정해진 시각에 못 돌렸어요" in msg, msg
    # 개발자용 낱말이 되돌아오지 않았는지도 함께 지킨다
    assert "누락" not in msg and "misfire" not in msg.lower(), msg
    assert "단지 시세 기록 모으기" in msg  # 영문 job_id 대신 한글 라벨(add_job 정본, 세션 418)


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
    assert "구독료 자동 결제" in msg
    # 세션 410: 예외 원문은 알림에 안 싣는다(로그에 보존). 이 테스트의 주제는
    # "scheduler 없이도 한글 라벨이 채워지나" 이므로 위 단언이 본체다.
    assert "PortOne 500" not in msg, msg


def test_job_error_location_goes_to_log_not_telegram(caplog):
    """traceback 의 우리 코드 위치는 **서버 로그**에 남고 텔레그램에는 안 나간다.

    세션 359 의 원래 의도("라이브러리 프레임이 아니라 우리 소스 위치를 우선 뽑는다")는
    그대로 지킨다 — 다만 그 값이 나가는 곳이 바뀌었다. 파일명·줄번호는 사장님께
    의미가 없는 개발자용 단서라 세션 408 에 알림 본문에서 빼고 logger.error 로 옮겼다
    (사장님 지시: "어려운 말은 금지"). 내가 원인을 추적할 근거는 로그에 그대로 있다.

    뮤테이션: job_event_listener 의 logger.error 에서 위치=%s 를 빼면 이 테스트가 FAIL.
    """
    import logging as _logging

    tb = (
        '  File "/app/backend/crawler/service_discover.py", line 481, in crawl_article_details\n'
        "    db.commit()\n"
        '  File "/app/backend/venv/lib/site-packages/sqlalchemy/orm/session.py", line 1234, in commit\n'
        "    self._transaction.commit()\n"
        "psycopg2.errors.InFailedSqlTransaction: current transaction is aborted, "
        "commands ignored until end of transaction block"
    )
    scheduler = _FakeScheduler({"crawl_details": _FakeJob("매물 상세 보강")})
    with caplog.at_level(_logging.ERROR, logger="crawler.job_error_listener"):
        with patch("services.telegram.send_telegram") as mock_send:
            event = _error_event_with_traceback(
                "crawl_details", ValueError("InFailedSqlTransaction"), tb,
            )
            job_event_listener(event, scheduler)

    # ① 로그에는 우리 코드 위치가 남는다 (라이브러리 프레임이 아니라)
    log_text = caplog.text
    assert "service_discover.py" in log_text, log_text
    assert "481" in log_text, log_text
    assert "site-packages" not in log_text, log_text

    # ② 텔레그램 본문에는 개발자용 위치가 없다
    msg = mock_send.call_args[0][0]
    assert "service_discover.py" not in msg, msg
    assert "File " not in msg, msg
    assert "line " not in msg, msg


def test_job_error_alert_has_no_developer_jargon():
    """알림 본문에 개발자용 글자(트레이스백·라이브러리명·영문 예외)가 없어야 한다.

    사장님 지시(2026-09-15): "텔레그램 알림은 일반인이 봐도 무엇이 어떻게 잘못되었는지
    손쉽게 알 수 있어야 해. 어려운 말은 금지야."

    뮤테이션: `explain_error(exc_text)` 를 `exc_text` 로 되돌리면 psycopg2 가 새어 FAIL.
    """
    tb = (
        '  File "/app/backend/crawler/service_discover.py", line 481, in crawl\n'
        "psycopg2.errors.QueryCanceled: canceling statement due to statement timeout"
    )
    with patch("services.telegram.send_telegram") as mock_send:
        event = _error_event_with_traceback(
            "crawl_details",
            ValueError("(psycopg2.errors.QueryCanceled) canceling statement due to "
                       "statement timeout"),
            tb,
        )
        job_event_listener(event, None)

    msg = mock_send.call_args[0][0]
    for jargon in ('File "', "line ", "psycopg2", "Error", "Traceback", "statement timeout"):
        assert jargon not in msg, f"개발자용 글자가 남았다({jargon}): {msg}"
    # 아는 에러는 우리말 한 줄로 번역돼 있어야 한다
    assert "데이터베이스가 너무 오래 걸려" in msg, msg


def test_job_error_alert_uses_unified_prefix():
    """접두어가 3채널 공통 `[서버 알림]` 이고 옛 `[내부즉시]` 가 없어야 한다."""
    with patch("services.telegram.send_telegram") as mock_send:
        job_event_listener(_error_event(job_id="billing_charge"), None)
    err_msg = mock_send.call_args[0][0]

    with patch("services.telegram.send_telegram") as mock_send:
        job_event_listener(_missed_event(job_id="collect_prices"), None)
    missed_msg = mock_send.call_args[0][0]

    for msg in (err_msg, missed_msg):
        assert msg.startswith("[서버 알림]"), msg
        assert "[내부즉시]" not in msg, msg


def test_job_error_alert_tells_owner_what_to_do():
    """알림 끝에 사장님이 실제로 할 수 있는 행동이 붙는다 (plain_words.action_words)."""
    with patch("services.telegram.send_telegram") as mock_send:
        job_event_listener(_error_event(job_id="billing_charge"), None)

    msg = mock_send.call_args[0][0]
    assert "Claude" in msg, msg
    assert "손님 화면" in msg, msg


def test_admin_link_helper_still_resolves_operational_domain():
    """`_admin_link` 는 살아 있고 운영 도메인을 고른다 — 알림 본문에서만 뺐다.

    옛 테스트(test_job_error_message_includes_admin_link)는 "모든 실패 알림에 관리자
    화면 링크가 포함된다"를 단언했다. 세션 408 에 알림 본문을 사장님용 3줄로 줄이면서
    링크 줄을 뺐다 — 새벽 크론 알림에서 사장님이 관리자 화면을 여실 일이 없고, 그
    자리에 "무엇을 하면 되는지"(action_words)를 두는 편이 낫다는 판단(spec 2-B).

    그렇다고 헬퍼의 의도까지 지우지는 않는다 — 나중에 링크를 다시 붙일 때 이 로직이
    맞는지(localhost 가 아니라 운영 도메인을 고르는지) 여기서 계속 지킨다.
    """
    from crawler.job_error_listener import _admin_link

    with patch.dict(
        "os.environ",
        {"FRONTEND_URL": "http://localhost:3000,https://2u.pe.kr"},
    ):
        assert _admin_link("/admin#scheduler") == "https://2u.pe.kr/admin#scheduler"


def test_job_error_alert_omits_admin_link():
    """알림 본문에는 관리자 링크가 없다 — 위 테스트와 짝(의도가 어디로 갔는지 명시)."""
    with patch("services.telegram.send_telegram") as mock_send:
        event = _error_event(job_id="collect_emergency", exception=ValueError("API 실패"))
        job_event_listener(event, None)

    msg = mock_send.call_args[0][0]
    assert "/admin#scheduler" not in msg, msg


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


def test_misfire_alert_shows_kst_not_raw_iso():
    """misfire 알림의 예정시각이 KST `MM-DD HH:MM` 인지 — 세션 406 다섯 번째 누수.

    원래 `str(event.scheduled_run_time)` 로 `2026-07-04T04:50:00+00:00` 가 그대로
    나갔다. 이 파일엔 strftime·isoformat 이 한 건도 없어 그 두 이름으로 훑는
    방식으로는 안 잡히던 형태다 — 기존 13개 테스트가 전부 통과하면서도 이 누수를
    못 본 이유가 "아무도 시각 형식을 단언하지 않았기" 때문이라, 여기서 단언한다.
    """
    with patch("services.telegram.send_telegram") as mock_send:
        job_event_listener(_missed_event(scheduled_run_time="2026-07-04T04:50:00+00:00"), None)

    msg = mock_send.call_args[0][0]
    assert "예정시각: 07-04 13:50" in msg, f"KST 변환이 빠졌다: {msg}"
    assert "T04:50" not in msg, "UTC ISO 원문이 그대로 노출됐다"
    assert "+00:00" not in msg, "UTC 오프셋이 그대로 노출됐다"


def test_job_error_without_traceback_still_shows_exception_message():
    """traceback 이 없거나 File 줄이 없어도 **까닭 한 줄은 반드시 나온다**.

    위치 추출 실패가 정작 중요한 까닭을 가리면 안 된다(회귀 재발 방지 — 이전 구현이
    traceback 마지막 줄을 잘못 원인으로 채택해 예외 메시지가 통째로 누락된 적이 있었다).

    ⚠ 세션 410 에 단언 대상이 바뀌었다: 예외 **원문**("PortOne 500")은 이제 알림에
    안 실린다(사장님이 못 읽는 글자). 원문은 logger.error 에 남고, 알림에는 우리말
    까닭이 남는지를 본다 — "까닭 줄이 통째로 비면 안 된다"는 원래 의도는 그대로다."""
    with patch("services.telegram.send_telegram") as mock_send:
        event = _error_event_with_traceback(
            "billing_charge", ValueError("PortOne 500"),
            tb_text="Traceback (most recent call last): ...",  # File 줄 없는 비정형 텍스트
        )
        job_event_listener(event, None)

    msg = mock_send.call_args[0][0]
    assert "PortOne 500" not in msg, msg
    # 까닭 줄이 비어 "까닭: " 만 덩그러니 나가면 안 된다(세션 408 LOW-1 회귀도 함께 방어).
    reason_line = next(ln for ln in msg.splitlines() if ln.startswith("까닭:"))
    assert len(reason_line.removeprefix("까닭:").strip()) > 5, msg


# ── 세션 408: 안내 문구가 잡 성격과 어긋나던 2건 회귀 ──────────────────────


def test_billing_job_failure_says_money_not_stale_data():
    """결제 잡 실패에 수집용 안내가 붙으면 심각도를 정반대로 알리게 된다.

    실측(세션 408): 빌링키 자동결제가 실패했는데 "새 자료만 안 들어와요"가 붙어
    나갔다 — 실제로는 **구독료가 안 걷힌** 상황이라 뜻이 완전히 다르다.
    """
    with patch("services.telegram.send_telegram") as mock_send:
        job_event_listener(_error_event(job_id="billing_charge", exception=ValueError("PG 오류")), None)

    msg = mock_send.call_args[0][0]
    assert "구독료" in msg, f"결제 실패인데 돈 이야기가 없다: {msg}"
    assert "새 자료만 안 들어와요" not in msg, f"수집용 안내가 결제 알림에 붙었다: {msg}"

    # 수집 잡은 반대로 수집용 안내를 그대로 써야 한다(회귀 방향 양쪽 고정).
    job_error_listener._last_alert_at.clear()
    with patch("services.telegram.send_telegram") as mock_send2:
        job_event_listener(_error_event(job_id="crawl_details", exception=ValueError("타임아웃")), None)

    msg2 = mock_send2.call_args[0][0]
    assert "새 자료만 안 들어와요" in msg2
    assert "구독료" not in msg2


def test_misfire_message_uses_correct_korean_particle():
    """받침 유무에 맞는 조사(을/를) — "공시가격 수집를" 같은 문장이 나가면 안 된다."""
    from datetime import datetime, timezone

    # ⚠ 라벨은 <b>…</b> 로 감싸여 나가므로 조사는 닫는 태그 **뒤**에 붙는다
    #    ("…수집</b>을"). "수집을" 처럼 붙여서 찾으면 코드가 맞아도 실패한다
    #    (세션 408 실측 — 전체 실행에서 이 테스트만 빨갛게 나온 원인).
    cases = [
        # 세션 418 이름 통일로 official_price 가 "정부 공시가격 받기"(받침 없음)가 돼
        # 받침 있는 사례를 collect_metrics("단지 가치 점수 계산")로 바꿨다.
        ("collect_metrics", "</b>을"),  # 받침 있음 → 을
        ("crawl_articles", "</b>를"),   # 받침 없음 → 를
    ]
    for job_id, expected in cases:
        job_error_listener._last_alert_at.clear()
        event = SimpleNamespace(
            code=EVENT_JOB_MISSED, job_id=job_id, jobstore="default",
            scheduled_run_time=datetime(2026, 9, 15, 6, 30, tzinfo=timezone.utc),
        )
        with patch("services.telegram.send_telegram") as mock_send:
            job_event_listener(event, None)
        msg = mock_send.call_args[0][0]
        assert expected in msg, f"{job_id}: 조사가 틀렸다 — {msg.splitlines()[0]}"
