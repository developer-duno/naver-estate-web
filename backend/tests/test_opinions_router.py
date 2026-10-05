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
