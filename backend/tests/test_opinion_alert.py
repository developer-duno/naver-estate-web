"""새 의견 텔레그램 알림(services/opinion_alert.py) 시험 — 세션 433.

검증하는 것:
  - 알림 본문 모양(접두어·종류·화면·보낸 분 가림·답하기 주소)
  - 손님 글이 서식으로 해석되지 않게 parse_mode=None + 줄바꿈 접기 + 150자 자르기
  - 한 시간 20통까지만 한 건씩, 21번째 순간 "잠시 멈춤" 1통, 그 뒤 그 시간엔 0통
  - 처음 보는 오류 알림은 따로 센다 — 한 시간 10통, 11번째 순간 오류 전용 "잠시 멈춤" 1통(세션 441)
  - 알림이 터져도 예외가 밖으로 안 나간다
실행: python -m pytest tests/test_opinion_alert.py -v
"""

from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

import services.opinion_alert as oa

KST = ZoneInfo("Asia/Seoul")
NOW = datetime(2026, 10, 6, 14, 10, tzinfo=KST)
_previews: list[bool] = []  # sent 가 기록한 disable_link_preview 값(호출 순서대로)


@pytest.fixture(autouse=True)
def _reset_alert_counters():
    oa._reset_for_tests()
    yield
    oa._reset_for_tests()


@pytest.fixture
def sent(monkeypatch):
    """send_telegram 호출 기록(실발송 0 — conftest 봉쇄 위에 한 번 더)."""
    calls: list[tuple[str, object]] = []

    def _fake(text, parse_mode=None, disable_link_preview=False):
        calls.append((text, parse_mode))
        _previews.append(disable_link_preview)
        return True

    _previews.clear()

    monkeypatch.setattr("services.telegram.send_telegram", _fake)
    return calls


def _notify(**kw):
    args = {"kind": "bug", "page_path": "/complex/12345", "user_email": None,
            "message": "검색 화면에서 가격이 안 보여요", "now": NOW}
    args.update(kw)
    oa.notify_new_opinion(**args)


def test_new_opinion_text_lines(sent):
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


def test_anonymous_sender_and_unknown_page(sent):
    _notify(user_email=None, page_path=None, kind="data")
    text = sent[0][0]
    assert "보낸 분: 로그인 안 함" in text
    assert "화면: 알 수 없음" in text
    assert "종류: 정보가 틀려요" in text


def test_html_kept_as_plain_text_and_newlines_folded(sent):
    """`<b>` 든 글은 서식이 아니라 글자 그대로 — 줄바꿈으로 가짜 줄을 못 만든다."""
    _notify(message="<b>굵게</b> 첫 줄\n[서버 알림] 가짜 줄\r\n\n끝")
    text, parse_mode = sent[0]
    assert parse_mode is None
    assert "내용: <b>굵게</b> 첫 줄 [서버 알림] 가짜 줄 끝" in text
    assert len(text.splitlines()) == 6  # 손님 글이 줄을 늘리지 못한다


def test_unicode_line_breaks_and_tabs_stay_one_line(sent):
    """줄 구분 문자(\u2028)·탭·\r\n 이 섞여도 '내용:' 은 한 줄 — 알림 줄 수 변화 0."""
    _notify(message="첫 줄\u2028[서버 알림] 가짜\t탭\r\n끝 줄\u2029마지막")
    lines = sent[0][0].splitlines()
    assert len(lines) == 6
    assert "내용: 첫 줄 [서버 알림] 가짜 탭 끝 줄 마지막" in lines


def test_long_message_cut_to_150(sent):
    _notify(message="가" * 400)
    content_line = [ln for ln in sent[0][0].splitlines() if ln.startswith("내용: ")][0]
    assert content_line == "내용: " + "가" * 150 + "…"


def test_hourly_limit_pause_notice_once(sent):
    """한 시간 20통까지 한 건씩 → 21번째 순간 "잠시 멈춤" 1통 → 22·23번째는 0통."""
    for _ in range(20):
        _notify()
    assert len(sent) == 20
    _notify()
    assert len(sent) == 21
    pause, parse_mode = sent[-1]
    assert parse_mode is None
    assert pause.splitlines() == [
        "[서버 알림] 💬 이번 시간엔 의견이 20건을 넘어 알림을 잠시 멈춰요(관리자 화면에서 보세요)",
        "답하기: https://2u.pe.kr/admin/opinions",
    ]
    _notify()
    _notify()
    assert len(sent) == 21


def test_new_hour_starts_fresh(sent):
    for _ in range(25):
        _notify()
    assert len(sent) == 21  # 20통 + 잠시 멈춤 1통
    _notify(now=datetime(2026, 10, 6, 15, 0, 5, tzinfo=KST))
    assert len(sent) == 22
    assert sent[-1][0].startswith("[서버 알림] 💬 새 의견이 왔어요")


def test_send_failure_does_not_raise(monkeypatch):
    def _boom(text, parse_mode=None, disable_link_preview=False):
        raise RuntimeError("telegram down")

    monkeypatch.setattr("services.telegram.send_telegram", _boom)
    for _ in range(21):  # 한 건씩 알림·잠시 멈춤 알림 둘 다 — 예외가 밖으로 나오면 시험 실패
        _notify()


def test_link_preview_disabled_for_new_and_pause(sent):
    """새 의견 알림·잠시 멈춤 알림 모두 링크 미리보기를 끈다."""
    for _ in range(21):
        _notify()
    assert len(_previews) == 21 and all(_previews)


def test_link_preview_option_reaches_request_body(monkeypatch):
    """끝까지 — 의견 알림이 실제 요청 본문에 link_preview_options.is_disabled=true 를 싣는다(requests.post 는 가짜)."""
    from unittest.mock import MagicMock

    import services.telegram as tg

    monkeypatch.setenv("TELEGRAM_ENABLED", "true")
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "tok")
    monkeypatch.setenv("TELEGRAM_CHAT_ID", "123")
    post = MagicMock(return_value=MagicMock(status_code=200))
    monkeypatch.setattr(tg.requests, "post", post)
    _notify()
    assert post.call_count == 1
    body = post.call_args[1]["json"]
    assert body["link_preview_options"] == {"is_disabled": True}
    assert "parse_mode" not in body


def test_hour_key_uses_korean_hour():
    utc_now = datetime(2026, 10, 6, 5, 59, 30, tzinfo=ZoneInfo("UTC"))  # = KST 14:59:30
    assert oa._key_of(utc_now) == "2026-10-06 14"


# ── 처음 보는 손님 화면 오류 알림(세션 439) ──


def test_new_error_text_lines(sent):
    oa.notify_new_error(page_path="/complex/12345", error_line="TypeError: x\n[서버 알림] 가짜 줄", now=NOW)
    assert len(sent) == 1
    text, parse_mode = sent[0]
    assert parse_mode is None and _previews == [True]
    assert text.splitlines() == [
        "[서버 알림] 🧯 손님 화면에서 처음 보는 오류가 났어요",
        "화면: /complex/12345",
        "오류: TypeError: x [서버 알림] 가짜 줄",  # 줄바꿈을 접어 가짜 줄을 못 만든다
        "→ 같은 오류가 또 나면 알림 없이 횟수만 셉니다. 관리자 의견함에서 볼 수 있어요.",
    ]


def test_new_error_text_cut_100(sent):
    oa.notify_new_error(page_path=None, error_line="가" * 150, now=NOW)
    lines = sent[0][0].splitlines()
    assert lines[1] == "화면: 알 수 없음"
    assert lines[2] == "오류: " + "가" * 100 + "…"


def _error(i: int, now=NOW):
    oa.notify_new_error(page_path="/x", error_line=f"E{i}", now=now)


def test_error_and_opinion_count_separately(sent):
    """새 의견 20통(의견 몫을 다 씀) 뒤 처음 보는 오류 1건 → 오류 알림은 정상 1통(카운터가 따로다, 세션 441)."""
    for _ in range(20):
        _notify()
    _error(1)
    assert len(sent) == 21
    assert sent[20][0].startswith("[서버 알림] 🧯 손님 화면에서 처음 보는 오류가 났어요")
    assert not any("잠시 멈춰요" in text for text, _ in sent)


def test_error_hourly_limit_10_then_error_pause_once(sent):
    """오류 10통까지 한 건씩 → 11번째 순간 오류 전용 '잠시 멈춤' 1통 → 12번째는 0통(오류 12건 → 11통)."""
    for i in range(10):
        _error(i)
    assert len(sent) == 10
    assert all(text.startswith("[서버 알림] 🧯 손님 화면에서 처음 보는 오류가 났어요") for text, _ in sent)
    _error(10)
    assert len(sent) == 11
    pause, parse_mode = sent[-1]
    assert parse_mode is None and _previews[-1] is True
    assert pause.splitlines() == [
        "[서버 알림] 🧯 이번 시간엔 처음 보는 오류가 10건을 넘어 오류 알림을 잠시 멈춰요(관리자 화면에서 보세요)",
        "보기: https://2u.pe.kr/admin/opinions",
    ]
    _error(11)
    assert len(sent) == 11


def test_opinion_still_sent_while_error_paused(sent):
    """오류 알림이 멈춘 시간에도 손님 의견 알림은 정상으로 나간다."""
    for i in range(12):
        _error(i)
    assert len(sent) == 11
    _notify()
    assert len(sent) == 12
    assert sent[-1][0].startswith("[서버 알림] 💬 새 의견이 왔어요")


def test_error_counter_new_hour_starts_fresh(sent):
    """오류 알림도 새 시간(한국 시각)이 되면 0 부터 다시 센다."""
    for i in range(12):
        _error(i)
    assert len(sent) == 11
    _error(99, now=datetime(2026, 10, 6, 15, 0, 5, tzinfo=KST))
    assert len(sent) == 12
    assert sent[-1][0].startswith("[서버 알림] 🧯 손님 화면에서 처음 보는 오류가 났어요")


def test_reset_for_tests_clears_both_counters(sent):
    """_reset_for_tests 는 의견·오류 카운터를 둘 다 0 으로 돌린다."""
    for _ in range(21):
        _notify()
    for i in range(11):
        _error(i)
    oa._reset_for_tests()
    sent.clear()
    _notify()
    _error(0)
    assert [t.splitlines()[0] for t, _ in sent] == [
        "[서버 알림] 💬 새 의견이 왔어요",
        "[서버 알림] 🧯 손님 화면에서 처음 보는 오류가 났어요",
    ]


def test_new_error_swallows_exceptions(monkeypatch):
    def _boom(*a, **k):
        raise RuntimeError("telegram down")

    monkeypatch.setattr("services.telegram.send_telegram", _boom)
    oa.notify_new_error(page_path="/x", error_line="E", now=NOW)  # 예외가 밖으로 안 나온다
