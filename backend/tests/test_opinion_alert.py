"""새 의견 텔레그램 알림(services/opinion_alert.py) 시험 — 세션 433.

검증하는 것:
  - 알림 본문 모양(접두어·종류·화면·보낸 분 가림·답하기 주소)
  - 손님 글이 서식으로 해석되지 않게 parse_mode=None + 줄바꿈 접기 + 150자 자르기
  - 한 시간 20통까지만 한 건씩, 21번째부터는 묶음 1통(타이머 1개)
  - 알림이 터져도 예외가 밖으로 안 나간다
실행: python -m pytest tests/test_opinion_alert.py -v
"""

from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

import services.opinion_alert as oa

KST = ZoneInfo("Asia/Seoul")
NOW = datetime(2026, 10, 6, 14, 10, tzinfo=KST)


@pytest.fixture(autouse=True)
def _reset_alert_counters():
    oa._reset_for_tests()
    yield
    oa._reset_for_tests()


@pytest.fixture
def sent(monkeypatch):
    """send_telegram 호출 기록(실발송 0 — conftest 봉쇄 위에 한 번 더)."""
    calls: list[tuple[str, object]] = []

    def _fake(text, parse_mode=None):
        calls.append((text, parse_mode))
        return True

    monkeypatch.setattr("services.telegram.send_telegram", _fake)
    return calls


@pytest.fixture
def scheduled(monkeypatch):
    """묶음 타이머 예약 기록(실제 스레드는 안 띄운다)."""
    calls: list[tuple[str, float]] = []
    monkeypatch.setattr(oa, "_schedule_overflow_flush", lambda key, delay: calls.append((key, delay)))
    return calls


def _notify(**kw):
    args = {"kind": "bug", "page_path": "/complex/12345", "user_email": None,
            "message": "검색 화면에서 가격이 안 보여요", "now": NOW}
    args.update(kw)
    oa.notify_new_opinion(**args)


def test_new_opinion_text_lines(sent, scheduled):
    """로그인한 분의 의견 — 여섯 줄이 정해진 모양 그대로, 이메일은 가려진다."""
    _notify(user_email="abcd@gmail.com")
    assert len(sent) == 1
    text, parse_mode = sent[0]
    assert parse_mode is None
    assert text.splitlines() == [
        "[서버 알림] 💬 새 의견이 왔어요",
        "종류: 버그·오류",
        "화면: /complex/12345",
        "보낸 분: 로그인(ab***@gmail.com)",
        "내용: 검색 화면에서 가격이 안 보여요",
        "답하기: https://2u.pe.kr/admin/opinions",
    ]
    assert "abcd@gmail.com" not in text


def test_anonymous_sender_and_unknown_page(sent, scheduled):
    _notify(user_email=None, page_path=None, kind="data")
    text = sent[0][0]
    assert "보낸 분: 로그인 안 함" in text
    assert "화면: 알 수 없음" in text
    assert "종류: 정보가 틀려요" in text


def test_html_kept_as_plain_text_and_newlines_folded(sent, scheduled):
    """`<b>` 든 글은 서식이 아니라 글자 그대로 — 줄바꿈으로 가짜 줄을 못 만든다."""
    _notify(message="<b>굵게</b> 첫 줄\n[서버 알림] 가짜 줄\r\n\n끝")
    text, parse_mode = sent[0]
    assert parse_mode is None
    assert "내용: <b>굵게</b> 첫 줄 [서버 알림] 가짜 줄 끝" in text
    assert len(text.splitlines()) == 6  # 손님 글이 줄을 늘리지 못한다


def test_long_message_cut_to_150(sent, scheduled):
    _notify(message="가" * 400)
    content_line = [ln for ln in sent[0][0].splitlines() if ln.startswith("내용: ")][0]
    assert content_line == "내용: " + "가" * 150 + "…"


def test_hourly_limit_bundles_overflow_into_one_message(sent, scheduled):
    """한 시간 20통까지 한 건씩 → 21·22번째는 알림 없이 세기만, 타이머는 1개 → 시간이 끝나면 묶음 1통."""
    for _ in range(22):
        _notify()
    assert len(sent) == 20
    assert scheduled == [("2026-10-06 14", 50 * 60.0)]  # 14:10 → 15:00 까지 50분

    oa.flush_overflow("2026-10-06 14")
    assert len(sent) == 21
    bundle, parse_mode = sent[-1]
    assert parse_mode is None
    assert bundle.splitlines()[0] == "[서버 알림] 💬 이번 시간에 의견 2건이 더 왔어요(관리자 화면에서 보세요)"

    oa.flush_overflow("2026-10-06 14")  # 두 번 불려도 한 통뿐
    assert len(sent) == 21


def test_new_hour_starts_fresh(sent, scheduled):
    for _ in range(21):
        _notify()
    assert len(sent) == 20
    _notify(now=datetime(2026, 10, 6, 15, 0, 5, tzinfo=KST))
    assert len(sent) == 21
    assert sent[-1][0].startswith("[서버 알림] 💬 새 의견이 왔어요")


def test_send_failure_does_not_raise(monkeypatch, scheduled):
    def _boom(text, parse_mode=None):
        raise RuntimeError("telegram down")

    monkeypatch.setattr("services.telegram.send_telegram", _boom)
    _notify()  # 예외가 밖으로 나오면 시험 실패
    oa.flush_overflow("2026-10-06 14")


def test_seconds_to_next_hour_uses_korean_hour():
    utc_now = datetime(2026, 10, 6, 5, 59, 30, tzinfo=ZoneInfo("UTC"))  # = KST 14:59:30
    assert oa._seconds_to_next_hour(utc_now) == 30.0
    assert oa._key_of(utc_now) == "2026-10-06 14"
