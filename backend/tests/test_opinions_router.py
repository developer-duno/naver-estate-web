"""의견 보내기 라우터 시험 — /api/opinions · /api/opinions/public (세션 433).

공개 쪽: 하루 한도 2종 · 만료 토큰 · 입력 검증 · 화면 경로 정리 · 숨김 칸 · BackgroundTasks ·
공개 목록에 개인정보 키 0. 관리자 쪽 시험은 이 파일 아래 절.
실행: python -m pytest tests/test_opinions_router.py -v
"""

import os
import time
from datetime import datetime, timedelta, timezone

import jwt
import pytest
from fastapi import BackgroundTasks

import routers.opinions as op_router
from db.models import SiteOpinion
from tests.conftest import make_auth_headers

LIMIT_DETAIL = "오늘은 더 보낼 수 없어요. 내일 다시 보내 주세요"
GOOD = {"kind": "bug", "message": "검색 화면에서 가격이 안 보여요"}


@pytest.fixture(autouse=True)
def notified(monkeypatch):
    """새 의견 알림 호출 기록 — 알림 모듈 자체는 test_opinion_alert.py 가 본다."""
    calls: list[dict] = []
    monkeypatch.setattr(op_router, "notify_new_opinion", lambda **kw: calls.append(kw))
    return calls


def _post(client, body=None, headers=None):
    return client.post("/api/opinions", json=body or GOOD, headers=headers or {})


# ── 하루 한도 ──


def test_anonymous_three_ok_fourth_429(client, db):
    for _ in range(3):
        assert _post(client).status_code == 200
    res = _post(client)
    assert res.status_code == 429
    assert res.json()["detail"] == LIMIT_DETAIL
    assert db.query(SiteOpinion).count() == 3


def test_logged_in_ten_ok_eleventh_429(client, db):
    headers = make_auth_headers(db, user_id="op-user", email="opuser@test.com")
    for _ in range(10):
        res = _post(client, headers=headers)
        assert res.status_code == 200
        assert res.json()["can_reply"] is True
    res = _post(client, headers=headers)
    assert res.status_code == 429
    assert res.json()["detail"] == LIMIT_DETAIL
    assert db.query(SiteOpinion).count() == 10


def test_logged_in_saves_email_and_user_id(client, db):
    headers = make_auth_headers(db, user_id="op-user2", email="who@test.com")
    body = _post(client, headers=headers).json()
    row = db.get(SiteOpinion, body["id"])
    assert row.user_id == "op-user2"
    assert row.user_email == "who@test.com"
    assert body == {"id": row.id, "received": True, "can_reply": True}


def test_expired_token_treated_as_anonymous(client, db, monkeypatch):
    """만료 토큰 → get_optional_user 가 None → 이메일 저장 0·can_reply false (원격 검증 호출도 0)."""
    import deps

    monkeypatch.setattr(deps, "SUPABASE_URL", "")
    token = jwt.encode(
        {"sub": "op-expired", "aud": "authenticated", "email": "old@test.com",
         "exp": int(time.time()) - 3600},
        os.environ["SUPABASE_JWT_SECRET"], algorithm="HS256",
    )
    res = _post(client, headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    assert res.json()["can_reply"] is False
    row = db.get(SiteOpinion, res.json()["id"])
    assert row.user_email is None and row.user_id is None


# ── 입력 검증 ──


def test_wrong_kind_422(client, db):
    assert _post(client, {"kind": "spam", "message": GOOD["message"]}).status_code == 422
    assert db.query(SiteOpinion).count() == 0


def test_message_length_422(client, db):
    assert _post(client, {"kind": "bug", "message": "가" * 1001}).status_code == 422
    assert _post(client, {"kind": "bug", "message": "  짧은 글이에요  "}).status_code == 422  # 공백 빼면 8자
    assert _post(client, {"kind": "bug", "message": "가" * 1000}).status_code == 200


@pytest.mark.parametrize("raw, saved", [
    ("/complex/12345?tab=price#top", "/complex/12345"),
    ("https://evil.example/complex/1", None),
    ("//evil.example/x", None),
    ("/" + "a" * 200, None),  # 201자
    ("/" + "a" * 199, "/" + "a" * 199),  # 200자
    ("/complex/1\n[서버 알림]", None),
    (None, None),
])
def test_page_path_cleaned(client, db, raw, saved):
    res = _post(client, {**GOOD, "page_path": raw})
    assert res.status_code == 200
    assert db.get(SiteOpinion, res.json()["id"]).page_path == saved


def test_user_agent_from_header_cut_300_and_interests_deduped(client, db):
    res = client.post(
        "/api/opinions",
        json={**GOOD, "interests": ["tax", "market", "tax"]},
        headers={"User-Agent": "U" * 500},
    )
    row = db.get(SiteOpinion, res.json()["id"])
    assert row.user_agent == "U" * 300
    assert row.interests == ["market", "tax"]
    assert row.message == GOOD["message"] and row.status == "new" and row.reply_mail_sent is False


def test_wrong_interest_422(client):
    assert _post(client, {**GOOD, "interests": ["lottery"]}).status_code == 422


# ── 숨김 칸(봇) ──


def test_honeypot_returns_ok_but_saves_nothing(client, db, notified):
    res = _post(client, {**GOOD, "website": "http://spam.example"})
    assert res.status_code == 200
    assert res.json() == {"received": True}
    assert db.query(SiteOpinion).count() == 0
    assert notified == []
    for _ in range(3):  # 봇 요청은 사람 한도도 안 깎는다
        assert _post(client).status_code == 200


# ── 알림은 BackgroundTasks 로 1회 ──


def test_alert_scheduled_once_via_background_tasks(client, notified, monkeypatch):
    added: list = []
    original = BackgroundTasks.add_task

    def _spy(self, func, *args, **kwargs):
        added.append(func)
        return original(self, func, *args, **kwargs)

    monkeypatch.setattr(BackgroundTasks, "add_task", _spy)
    res = _post(client, {**GOOD, "page_path": "/search?q=1"})
    assert res.status_code == 200
    assert len(added) == 1 and added[0] is op_router.notify_new_opinion
    assert notified == [{"kind": "bug", "page_path": "/search", "user_email": None,
                         "message": GOOD["message"]}]


# ── 공개 목록 ──


def _row(db, **kw):
    base = {"kind": "bug", "message": "원문 비밀 내용입니다", "user_email": "secret@test.com",
            "page_path": "/complex/1", "user_agent": "UA"}
    base.update(kw)
    r = SiteOpinion(**base)
    db.add(r)
    db.commit()
    return r


def test_public_list_only_public_and_no_private_keys(client, db):
    _row(db)  # 비공개
    pub = _row(db, is_public=True, status="fixed", public_title="검색 가격 표시 고침",
               public_answer="고쳤어요", published_at=datetime.now(timezone.utc))
    res = client.get("/api/opinions/public")
    assert res.status_code == 200
    assert res.headers["cache-control"] == "public, max-age=300"
    body = res.json()
    assert body["total"] == 1 and body["page"] == 1
    assert len(body["items"]) == 1
    item = body["items"][0]
    assert set(item) == {"id", "public_title", "public_answer", "status", "published_at"}
    assert item["id"] == pub.id and item["public_title"] == "검색 가격 표시 고침"
    raw = res.text
    for secret in ("원문 비밀 내용", "secret@test.com", "/complex/1", "UA"):
        assert secret not in raw


def test_public_list_handles_purged_message_and_paging(client, db):
    """1년 지나 원문이 NULL 로 지워진 공개 행도 그대로 보인다 · 20개씩 · 최신 공개 먼저."""
    now = datetime.now(timezone.utc)
    for i in range(21):
        _row(db, message=None, user_email=None, page_path=None, user_agent=None, is_public=True,
             status="fixed", public_title=f"제목{i}", public_answer="답",
             published_at=now - timedelta(minutes=i))
    first = client.get("/api/opinions/public").json()
    assert first["total"] == 21 and len(first["items"]) == 20
    assert first["items"][0]["public_title"] == "제목0"
    second = client.get("/api/opinions/public?page=2").json()
    assert [i["public_title"] for i in second["items"]] == ["제목20"]


# ── 모델 CHECK(V069 와 같은 3개) — SQLite 시험도 제약을 본다 ──


@pytest.mark.parametrize("bad", [
    {"kind": "spam", "message": "정상 길이의 글입니다"},
    {"kind": "bug", "message": "정상 길이의 글입니다", "status": "done"},
    {"kind": "bug", "message": ""},
    {"kind": "bug", "message": "가" * 1001},
])
def test_model_check_constraints(db, bad):
    from sqlalchemy.exc import IntegrityError

    db.add(SiteOpinion(**bad))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_model_allows_null_message(db):
    db.add(SiteOpinion(kind="other", message=None))
    db.commit()
    assert db.query(SiteOpinion).one().message is None


# ══ 관리자 의견함 /api/admin/opinions ══


@pytest.fixture
def admin_headers(db):
    return make_auth_headers(db, user_id="op-admin", role="admin", email="admin@test.com")


@pytest.fixture
def mails(monkeypatch):
    """send_email 호출 기록 — 기본은 성공(True). result 를 바꾸면 실패를 흉내."""
    state = {"result": True, "calls": []}

    def _fake(to, subject, html_body, sender_name="네이버부동산"):
        state["calls"].append({"to": to, "subject": subject, "html": html_body, "sender_name": sender_name})
        return state["result"]

    monkeypatch.setattr("services.email.send_email", _fake)
    return state


def _audit_actions(db):
    from db.models import AuditLog

    return [a.action for a in db.query(AuditLog).order_by(AuditLog.id).all()]


def test_admin_routes_need_admin(client, db):
    r = _row(db)
    user = make_auth_headers(db, user_id="op-plain", role="user")
    assert client.get("/api/admin/opinions").status_code == 401
    assert client.get("/api/admin/opinions", headers=user).status_code == 403
    assert client.patch(f"/api/admin/opinions/{r.id}", json={"status": "closed"}, headers=user).status_code == 403
    assert client.post(f"/api/admin/opinions/{r.id}/resend-mail", headers=user).status_code == 403
    assert client.delete(f"/api/admin/opinions/{r.id}", headers=user).status_code == 403
    assert db.get(SiteOpinion, r.id).status == "new"


def test_admin_list_all_fields_new_count_and_filter(client, db, admin_headers):
    _row(db)
    _row(db, status="replied", reply="답")
    _row(db, message=None, user_email=None, is_public=True, status="fixed",
         public_title="제목", public_answer="답", published_at=datetime.now(timezone.utc))
    res = client.get("/api/admin/opinions", headers=admin_headers)
    assert res.status_code == 200
    assert res.headers["cache-control"] == "no-store"
    body = res.json()
    assert body["total"] == 3 and body["new_count"] == 1 and body["page"] == 1
    item = next(i for i in body["items"] if i["status"] == "new")
    assert item["message"] == "원문 비밀 내용입니다" and item["user_email"] == "secret@test.com"
    assert {"page_path", "user_agent", "interests", "reply_mail_sent", "is_public"} <= set(item)
    assert any(i["message"] is None for i in body["items"])  # 1년 정리된 공개 행도 목록에 뜬다
    only_new = client.get("/api/admin/opinions?status=new", headers=admin_headers).json()
    assert only_new["total"] == 1 and only_new["new_count"] == 1
    assert client.get("/api/admin/opinions?status=done", headers=admin_headers).status_code == 422


def test_reply_sends_mail_once_and_edit_does_not_resend(client, db, admin_headers, mails):
    r = _row(db)
    res = client.patch(f"/api/admin/opinions/{r.id}", json={"reply": "고쳤어요", "status": "replied"},
                       headers=admin_headers)
    assert res.status_code == 200
    body = res.json()
    assert body["mail_sent"] is True and body["reply_mail_sent"] is True
    assert body["replied_at"] and body["status"] == "replied"
    assert len(mails["calls"]) == 1
    call = mails["calls"][0]
    assert call["to"] == "secret@test.com" and call["sender_name"] == "2u부동산"
    assert call["subject"] == "[2u부동산] 보내 주신 의견에 답장이 왔어요"

    res2 = client.patch(f"/api/admin/opinions/{r.id}", json={"reply": "고쳤어요(수정)"}, headers=admin_headers)
    assert res2.json()["mail_sent"] is False and res2.json()["reply"] == "고쳤어요(수정)"
    assert len(mails["calls"]) == 1  # 답을 고쳐도 재발송 0
    assert _audit_actions(db) == ["admin_opinion_update", "admin_opinion_update"]


def test_mail_failure_stays_false_then_resend(client, db, admin_headers, mails):
    r = _row(db)
    mails["result"] = False
    body = client.patch(f"/api/admin/opinions/{r.id}", json={"reply": "답장"}, headers=admin_headers).json()
    assert body["mail_sent"] is False and body["reply_mail_sent"] is False
    mails["result"] = True
    res = client.post(f"/api/admin/opinions/{r.id}/resend-mail", headers=admin_headers)
    assert res.json() == {"sent": True}
    assert len(mails["calls"]) == 2
    db.expire_all()
    assert db.get(SiteOpinion, r.id).reply_mail_sent is True
    assert _audit_actions(db)[-1] == "admin_opinion_resend_mail"


def test_no_mail_without_email_or_reply(client, db, admin_headers, mails):
    anon = _row(db, user_email=None)
    body = client.patch(f"/api/admin/opinions/{anon.id}", json={"reply": "답장"}, headers=admin_headers).json()
    assert body["mail_sent"] is False
    assert client.post(f"/api/admin/opinions/{anon.id}/resend-mail", headers=admin_headers).json() == {"sent": False}
    no_reply = _row(db)
    assert client.post(f"/api/admin/opinions/{no_reply.id}/resend-mail",
                       headers=admin_headers).json() == {"sent": False}
    assert mails["calls"] == []


def test_publish_needs_title_and_answer(client, db, admin_headers):
    r = _row(db)
    res = client.patch(f"/api/admin/opinions/{r.id}", json={"is_public": True, "public_title": "제목만"},
                       headers=admin_headers)
    assert res.status_code == 422
    db.expire_all()
    row = db.get(SiteOpinion, r.id)
    assert row.is_public is False and row.public_title is None  # 422 뒤 흔적 0
    ok = client.patch(f"/api/admin/opinions/{r.id}",
                      json={"is_public": True, "public_title": "제목", "public_answer": "답", "status": "fixed"},
                      headers=admin_headers).json()
    assert ok["is_public"] is True and ok["published_at"]
    assert client.get("/api/opinions/public").json()["total"] == 1
    # 공개 중에 답을 비우면 422
    assert client.patch(f"/api/admin/opinions/{r.id}", json={"public_answer": " "},
                        headers=admin_headers).status_code == 422
    off = client.patch(f"/api/admin/opinions/{r.id}", json={"is_public": False}, headers=admin_headers).json()
    assert off["is_public"] is False and off["published_at"] is None


def test_delete_with_audit_and_404(client, db, admin_headers):
    r = _row(db)
    res = client.delete(f"/api/admin/opinions/{r.id}", headers=admin_headers)
    assert res.status_code == 200 and res.json() == {"deleted": True}
    db.expire_all()
    assert db.get(SiteOpinion, r.id) is None
    assert _audit_actions(db) == ["admin_opinion_delete"]
    assert client.delete(f"/api/admin/opinions/{r.id}", headers=admin_headers).status_code == 404
    assert client.patch("/api/admin/opinions/999999", json={"status": "closed"},
                        headers=admin_headers).status_code == 404


# ── 답장 메일 본문 ──


def test_reply_email_escapes_original_and_reply():
    from services.email import build_opinion_reply_email

    subject, html = build_opinion_reply_email(
        "a<b>@test.com", "<script>alert(1)</script>" + "가" * 300, '<a href="http://evil">눌러</a>',
    )
    assert subject == "[2u부동산] 보내 주신 의견에 답장이 왔어요"
    assert "<script>" not in html and "&lt;script&gt;" in html
    assert '<a href="http://evil">' not in html and "&lt;a href=&quot;http://evil&quot;&gt;" in html
    assert "a&lt;b&gt;@test.com" in html
    assert "가" * 300 not in html  # 원문은 200자로 자른다
    _, purged = build_opinion_reply_email("x@test.com", None, "답")
    assert "None" not in purged


def test_send_email_sender_name(monkeypatch):
    """발신자 이름 인자 — 기본값은 그대로, 의견 메일만 2u부동산."""
    import email as email_pkg
    from email.header import decode_header, make_header

    import services.email as em

    sent_msgs: list[str] = []

    class _FakeSMTP:
        def __init__(self, *a, **k):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def login(self, *a):
            pass

        def sendmail(self, sender, to, msg):
            sent_msgs.append(msg)

    monkeypatch.setenv("SMTP_USER", "bot@test.com")
    monkeypatch.setenv("SMTP_PASS", "pw")
    monkeypatch.setattr(em.smtplib, "SMTP_SSL", _FakeSMTP)
    assert em.send_email("to@test.com", "제목", "<p>x</p>") is True
    assert em.send_email("to@test.com", "제목", "<p>x</p>", sender_name="2u부동산") is True
    froms = [str(make_header(decode_header(email_pkg.message_from_string(m)["From"]))) for m in sent_msgs]
    assert froms[0].startswith("네이버부동산") and froms[1].startswith("2u부동산")


# ══ 1년 정리(매일 03:50 정비 잡의 곁다리) ══


def test_vacuum_job_purges_year_old_opinions(db):
    """1년 지난 비공개 → 삭제 · 1년 지난 공개 → 원문·개인정보만 NULL(제목·답 유지) · 1년 안은 그대로.

    정비 잡 본체(run_vacuum_maintenance)를 통째로 돌려 배선까지 본다 — SQLite 는 VACUUM 을
    건너뛰므로(early return) 정리 호출이 그 뒤에 있으면 이 시험이 잡는다.
    """
    from crawler.vacuum_maintenance import run_vacuum_maintenance

    now = datetime.now(timezone.utc)
    old = now - timedelta(days=400)
    recent = now - timedelta(days=300)
    old_private = _row(db, created_at=old, user_id="u1", interests=["tax"])
    old_public = _row(db, created_at=old, user_id="u1", interests=["tax"], is_public=True, status="fixed",
                      public_title="고친 제목", public_answer="고친 답", published_at=old)
    recent_private = _row(db, created_at=recent)
    recent_public = _row(db, created_at=recent, is_public=True, status="fixed",
                         public_title="최근 제목", public_answer="최근 답", published_at=recent)
    ids = (old_private.id, old_public.id, recent_private.id, recent_public.id)

    result = run_vacuum_maintenance()

    assert result["opinions_deleted"] == 1 and result["opinions_anonymized"] == 1
    db.expire_all()
    assert db.get(SiteOpinion, ids[0]) is None
    kept = db.get(SiteOpinion, ids[1])
    assert (kept.message, kept.user_id, kept.user_email, kept.user_agent, kept.interests, kept.page_path) == (
        None, None, None, None, None, None)
    assert kept.public_title == "고친 제목" and kept.public_answer == "고친 답" and kept.is_public is True
    assert db.get(SiteOpinion, ids[2]).message == "원문 비밀 내용입니다"
    assert db.get(SiteOpinion, ids[3]).user_email == "secret@test.com"

    again = run_vacuum_maintenance()  # 이미 지운 공개 행은 다시 세지 않는다
    assert again["opinions_deleted"] == 0 and again["opinions_anonymized"] == 0


def test_vacuum_job_survives_opinion_purge_failure(db, monkeypatch):
    """의견 정리가 터져도 다른 곁다리·잡 상태는 멀쩡하다(자기 세션을 따로 쓰므로)."""
    import sqlalchemy

    from crawler.vacuum_maintenance import run_vacuum_maintenance
    from db.models import CrawlJob

    def _boom(*a, **k):
        raise RuntimeError("purge exploded")

    monkeypatch.setattr(sqlalchemy, "delete", _boom)
    result = run_vacuum_maintenance()
    assert result["opinions_deleted"] == 0 and result["opinions_anonymized"] == 0
    assert result["detail_retry_granted"] == 0 and result["purged_counters"] == 0
    job = db.query(CrawlJob).filter(CrawlJob.job_type == "vacuum_maintenance").one()
    assert job.status == "completed"
