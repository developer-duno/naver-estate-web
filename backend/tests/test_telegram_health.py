"""텔레그램 알림 통로 매일 점검 시험 — services/telegram_health.py (세션 439).

검증하는 것:
  - 진짜 점검 함수 + 바깥 HTTP 만 가짜: getMe·getChat 두 주소를 부르고 메시지는 안 보낸다
  - 하나라도 실패(상태 번호·ok false·네트워크 오류) → 보내는 Gmail 주소 자신에게 메일 1통 · 성공 → 0통
  - 알림이 꺼져 있거나 열쇠·대화방 값이 없으면 바깥 호출 0
  - 열쇠·대화방 번호는 메일 본문·로그에 안 들어간다 · 정비 잡은 점검이 터져도 끝까지 간다
실제 텔레그램·메일은 한 번도 안 나간다(requests.get·send_email 둘 다 가짜).
실행: python -m pytest tests/test_telegram_health.py -v
"""

import logging

import pytest

import services.telegram_health as th

TOKEN = "123456:SECRET-TOKEN-VALUE"
CHAT = "-1009876543210"


class _Resp:
    def __init__(self, status=200, payload=None):
        self.status_code = status
        self._payload = {"ok": True, "result": {}} if payload is None else payload

    def json(self):
        return self._payload


@pytest.fixture
def env(monkeypatch):
    monkeypatch.setenv("TELEGRAM_ENABLED", "true")
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", TOKEN)
    monkeypatch.setenv("TELEGRAM_CHAT_ID", CHAT)
    monkeypatch.setenv("SMTP_FROM", "boss@test.com")
    monkeypatch.setenv("SMTP_USER", "user@test.com")


@pytest.fixture
def http(monkeypatch):
    """requests.get 가짜 — 부른 주소·인자를 기록하고, answers[method] 로 답을 고른다."""
    state = {"calls": [], "answers": {}}

    def _fake_get(url, params=None, timeout=None):
        method = url.rsplit("/", 1)[-1]
        state["calls"].append({"url": url, "method": method, "params": params, "timeout": timeout})
        answer = state["answers"].get(method, _Resp())
        if isinstance(answer, Exception):
            raise answer
        return answer

    monkeypatch.setattr(th.requests, "get", _fake_get)
    return state


@pytest.fixture
def mails(monkeypatch):
    calls: list[dict] = []

    def _fake(to, subject, html_body, sender_name="네이버부동산"):
        calls.append({"to": to, "subject": subject, "html": html_body, "sender_name": sender_name})
        return True

    monkeypatch.setattr("services.email.send_email", _fake)
    return calls


def test_calls_getme_and_getchat_only(env, http, mails):
    """진짜 함수가 부르는 주소 = getMe·getChat 두 개(메시지 보내기 sendMessage 0) · 성공이면 메일 0."""
    result = th.check_telegram_channel()
    assert result == {"checked": True, "ok": True, "mail_sent": False}
    assert [c["url"] for c in http["calls"]] == [
        f"https://api.telegram.org/bot{TOKEN}/getMe",
        f"https://api.telegram.org/bot{TOKEN}/getChat",
    ]
    assert http["calls"][0]["params"] is None
    assert http["calls"][1]["params"] == {"chat_id": CHAT}
    assert all(c["timeout"] == 10 for c in http["calls"])
    assert mails == []


@pytest.mark.parametrize("method, answer", [
    ("getMe", _Resp(status=401, payload={"ok": False, "description": "Unauthorized"})),
    ("getChat", _Resp(status=400, payload={"ok": False, "description": "chat not found"})),
    ("getMe", _Resp(status=200, payload={"ok": False})),
    ("getChat", ConnectionError(f"https://api.telegram.org/bot{TOKEN}/getChat unreachable")),
])
def test_failure_sends_one_mail_to_sender_self(env, http, mails, method, answer, caplog):
    http["answers"][method] = answer
    with caplog.at_level(logging.INFO, logger="services.telegram_health"):
        result = th.check_telegram_channel()
    assert result == {"checked": True, "ok": False, "mail_sent": True}
    assert len(http["calls"]) == 2  # 하나가 실패해도 둘 다 본다
    assert len(mails) == 1
    mail = mails[0]
    assert mail["to"] == "boss@test.com" and mail["sender_name"] == "2u부동산"
    assert mail["subject"] == "[2u부동산] 텔레그램 알림 통로가 막혔어요"
    label = "알림 봇 열쇠 확인" if method == "getMe" else "알림 받는 대화방 확인"
    assert label in mail["html"]
    joined_logs = " ".join(r.getMessage() for r in caplog.records)
    for secret in (TOKEN, CHAT, "Unauthorized", "chat not found", "boss@test.com"):
        assert secret not in mail["html"]
        assert secret not in joined_logs


def test_status_number_in_mail(env, http, mails):
    http["answers"]["getMe"] = _Resp(status=401, payload={"ok": False})
    th.check_telegram_channel()
    assert "상태 번호 401" in mails[0]["html"]


def test_mail_goes_to_smtp_user_when_no_from(env, http, mails, monkeypatch):
    monkeypatch.delenv("SMTP_FROM")
    http["answers"]["getMe"] = _Resp(status=401)
    th.check_telegram_channel()
    assert mails[0]["to"] == "user@test.com"


@pytest.mark.parametrize("missing", ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"])
def test_no_key_no_calls(env, http, mails, monkeypatch, missing):
    monkeypatch.setenv(missing, "")
    assert th.check_telegram_channel() == {"checked": False, "ok": None, "mail_sent": False}
    assert http["calls"] == [] and mails == []


def test_alerts_disabled_no_calls(env, http, mails, monkeypatch):
    monkeypatch.setenv("TELEGRAM_ENABLED", "false")
    assert th.check_telegram_channel()["checked"] is False
    assert http["calls"] == [] and mails == []


def test_vacuum_job_runs_check_once_and_survives_explosion(db, monkeypatch):
    """정비 잡이 점검을 한 번 부른다 · 점검이 터져도 잡은 completed."""
    from crawler.vacuum_maintenance import run_vacuum_maintenance
    from db.models import CrawlJob

    calls: list[int] = []

    def _boom():
        calls.append(1)
        raise RuntimeError("health exploded")

    monkeypatch.setattr(th, "check_telegram_channel", _boom)
    run_vacuum_maintenance()
    assert calls == [1]
    job = db.query(CrawlJob).filter(CrawlJob.job_type == "vacuum_maintenance").one()
    assert job.status == "completed"


def test_vacuum_job_real_check_with_fake_http(db, env, http, mails):
    """정비 잡 → 진짜 점검 함수 → 가짜 HTTP 까지 배선 — getMe 실패면 메일 1통."""
    from crawler.vacuum_maintenance import run_vacuum_maintenance

    http["answers"]["getMe"] = _Resp(status=401)
    run_vacuum_maintenance()
    assert [c["method"] for c in http["calls"]] == ["getMe", "getChat"]
    assert len(mails) == 1
