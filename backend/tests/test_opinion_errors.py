"""손님 화면 오류 자동 기록 시험 — POST /api/opinions/error · 관리자 의견함 보강 (세션 439, V070).

검증하는 것:
  - 같은 오류(지문)는 한 행에 횟수만 · 다른 오류는 새 행 · 단지 번호가 달라도 같은 화면 종류면 같은 지문
  - 로그인 토큰이 와도 이메일·회원 번호 저장 0 · 손님 의견 하루 한도(3건)를 깎지 않음
  - 하루 한도(IP 묶음 20 · 전체 500) 넘으면 조용히 204 · 처음 보는 오류만 알림
  - 관리자 목록: 오류 칸 3개 · kind 거르기(5종) · new_count 에 오류 제외 · oldest_days · 오류 행 공개 400
  - 1년 정리: 오류 행은 공개 여부와 무관하게 삭제
실행: python -m pytest tests/test_opinion_errors.py -v
"""

from datetime import datetime, timedelta, timezone

import pytest

import routers.opinions as op_router
from db.models import SiteOpinion
from tests.conftest import make_auth_headers

ERR = {"area": "/complex/12345", "name": "TypeError", "message": "Cannot read properties of undefined\n    at x (a.js:1)"}


@pytest.fixture(autouse=True)
def _reset_counters():
    op_router._reset_anon_counters_for_tests()
    yield
    op_router._reset_anon_counters_for_tests()


@pytest.fixture(autouse=True)
def alerts(monkeypatch):
    """처음 보는 오류 알림 호출 기록 — 알림 모듈 자체는 test_opinion_alert.py 가 본다."""
    calls: list[dict] = []
    monkeypatch.setattr(op_router, "notify_new_error", lambda **kw: calls.append(kw))
    monkeypatch.setattr(op_router, "notify_new_opinion", lambda **kw: None)
    return calls


def _err(client, body=None, headers=None):
    return client.post("/api/opinions/error", json=body or ERR, headers=headers or {})


def _error_rows(db):
    db.expire_all()
    return db.query(SiteOpinion).filter(SiteOpinion.kind == "error").order_by(SiteOpinion.id).all()


# ── A3 같은 오류는 한 행 ──


def test_same_error_five_times_one_row_count_five(client, db, alerts):
    for _ in range(5):
        res = _err(client)
        assert res.status_code == 204 and res.content == b""
    rows = _error_rows(db)
    assert len(rows) == 1
    row = rows[0]
    assert row.repeat_count == 5
    assert row.message == "TypeError: Cannot read properties of undefined"  # 첫 줄만
    assert row.page_path == "/complex/12345" and row.status == "new" and row.is_public is False
    assert row.last_seen_at is not None and len(row.fingerprint) == 32
    assert len(alerts) == 1  # 처음 한 번만 알림


def test_same_screen_kind_different_id_same_row(client, db):
    """/complex/1 과 /complex/2 의 같은 오류는 같은 고장 — 지문은 첫 경로 조각만 본다."""
    _err(client, {**ERR, "area": "/complex/1"})
    _err(client, {**ERR, "area": "/complex/2?tab=x"})
    rows = _error_rows(db)
    assert len(rows) == 1 and rows[0].repeat_count == 2


def test_different_error_new_row(client, db, alerts):
    _err(client)
    _err(client, {**ERR, "message": "다른 오류"})
    _err(client, {**ERR, "area": "/search"})  # 화면 종류가 다르면 다른 지문
    rows = _error_rows(db)
    assert len(rows) == 3 and all(r.repeat_count == 1 for r in rows)
    assert len({r.fingerprint for r in rows}) == 3
    assert len(alerts) == 3
    assert alerts[0] == {"page_path": "/complex/12345",
                         "error_line": "TypeError: Cannot read properties of undefined"}


def test_last_seen_moves_forward_on_repeat(client, db):
    _err(client)
    first = _error_rows(db)[0]
    seen1, created = first.last_seen_at, first.created_at
    _err(client)
    again = _error_rows(db)[0]
    assert again.created_at == created  # 처음 본 시각은 그대로
    assert again.last_seen_at >= seen1 and again.repeat_count == 2


def test_error_report_never_stores_email_even_with_token(client, db):
    headers = make_auth_headers(db, user_id="err-user", email="who@test.com")
    assert _err(client, headers=headers).status_code == 204
    row = _error_rows(db)[0]
    assert row.user_email is None and row.user_id is None


def test_error_report_does_not_use_opinion_quota(client, db):
    """오류 기록 10건을 보내도 손님 의견 3건은 그대로 보낼 수 있다."""
    for i in range(10):
        assert _err(client, {**ERR, "message": f"오류 {i}"}).status_code == 204
    good = {"kind": "bug", "message": "검색 화면에서 가격이 안 보여요"}
    for _ in range(3):
        assert client.post("/api/opinions", json=good).status_code == 200
    assert client.post("/api/opinions", json=good).status_code == 429


def test_error_fields_cut_and_digest_kept(client, db):
    body = {"area": "/a/b", "name": "N" * 150, "message": "M" * 400, "digest": "D" * 150}
    assert client.post("/api/opinions/error", json=body, headers={"User-Agent": "U" * 500}).status_code == 204
    row = _error_rows(db)[0]
    assert row.message == "N" * 100 + ": " + "M" * 300 + "\n(오류 번호 " + "D" * 100 + ")"
    assert row.user_agent == "U" * 300


@pytest.mark.parametrize("area, saved", [
    ("https://evil.example/x", None),
    ("/ok\npath", "/ok"),  # 첫 줄만
    (None, None),
])
def test_error_area_cleaned(client, db, area, saved):
    assert _err(client, {**ERR, "area": area}).status_code == 204
    assert _error_rows(db)[0].page_path == saved


def test_error_empty_body_still_saved(client, db):
    assert client.post("/api/opinions/error", json={}).status_code == 204
    assert _error_rows(db)[0].message == "(내용 없음)"


def test_error_lone_surrogate_and_nul_saved_safely(client, db):
    """짝 없는 서로게이트·NUL 이 든 오류 글도 500 없이 대체 글자로 저장된다."""
    bs = chr(0x5C)
    raw = '{"area": "/x", "name": "E' + bs + 'ud800", "message": "bad' + bs + 'u0000 line"}'
    res = client.post("/api/opinions/error", content=raw.encode("utf-8"),
                      headers={"Content-Type": "application/json"})
    assert res.status_code == 204
    assert _error_rows(db)[0].message == "E" + chr(0xFFFD) + ": bad line"


def test_error_huge_body_422(client, db):
    assert _err(client, {**ERR, "message": "x" * 5001}).status_code == 422
    assert _error_rows(db) == []


# ── A4 하루 한도 ──


def _ip(ip):
    return {"CF-Connecting-IP": ip}


def test_error_ip_limit_21st_dropped(client, db):
    for _ in range(20):
        assert _err(client, headers=_ip("203.0.113.9")).status_code == 204
    assert _err(client, headers=_ip("203.0.113.9")).status_code == 204  # 21번째 — 조용히 버림
    assert _error_rows(db)[0].repeat_count == 20
    assert _err(client, headers=_ip("203.0.113.10")).status_code == 204  # 다른 IP 는 따로
    assert _error_rows(db)[0].repeat_count == 21


def test_error_total_daily_cap(client, db, monkeypatch):
    assert op_router.ERROR_TOTAL_DAILY_LIMIT == 500 and op_router.ERROR_IP_DAILY_LIMIT == 20
    monkeypatch.setattr(op_router, "ERROR_TOTAL_DAILY_LIMIT", 3)
    for i in range(5):
        assert _err(client, {**ERR, "message": f"e{i}"}, headers=_ip(f"198.51.100.{i}")).status_code == 204
    assert len(_error_rows(db)) == 3


def test_error_limit_resets_at_korean_midnight(client, db, monkeypatch):
    monkeypatch.setattr(op_router, "_now", lambda: datetime(2026, 10, 6, 14, 59, tzinfo=timezone.utc))  # KST 23:59
    for _ in range(21):
        _err(client)
    assert _error_rows(db)[0].repeat_count == 20
    monkeypatch.setattr(op_router, "_now", lambda: datetime(2026, 10, 6, 15, 1, tzinfo=timezone.utc))  # KST 00:01
    _err(client)
    assert _error_rows(db)[0].repeat_count == 21


# ══ 관리자 의견함 ══


@pytest.fixture
def admin_headers(db):
    return make_auth_headers(db, user_id="err-admin", role="admin", email="admin@test.com")


def _row(db, **kw):
    base = {"kind": "bug", "message": "원문 비밀 내용입니다", "user_email": "secret@test.com"}
    base.update(kw)
    r = SiteOpinion(**base)
    db.add(r)
    db.commit()
    return r


def test_admin_list_error_fields_and_new_count_excludes_errors(client, db, admin_headers):
    _row(db)
    _err(client)
    _err(client)
    body = client.get("/api/admin/opinions", headers=admin_headers).json()
    assert body["total"] == 2
    assert body["new_count"] == 1  # 오류 기록은 '새 의견' 수에 안 든다
    err = next(i for i in body["items"] if i["kind"] == "error")
    assert err["repeat_count"] == 2 and err["last_seen_at"] and len(err["fingerprint"]) == 32
    bug = next(i for i in body["items"] if i["kind"] == "bug")
    assert bug["repeat_count"] == 1 and bug["fingerprint"] is None and bug["last_seen_at"] is None


@pytest.mark.parametrize("kind", ["bug", "data", "suggest", "other", "error"])
def test_admin_list_kind_filter(client, db, admin_headers, kind):
    for k in ("bug", "data", "suggest", "other"):
        _row(db, kind=k)
    _err(client)
    body = client.get(f"/api/admin/opinions?kind={kind}", headers=admin_headers).json()
    assert body["total"] == 1 and [i["kind"] for i in body["items"]] == [kind]


def test_admin_list_kind_filter_rejects_unknown(client, admin_headers):
    assert client.get("/api/admin/opinions?kind=spam", headers=admin_headers).status_code == 422


def test_oldest_days_null_when_empty(client, admin_headers):
    assert client.get("/api/admin/opinions", headers=admin_headers).json()["oldest_days"] is None


def test_oldest_days_counts_only_rows_with_personal_info(client, db, admin_headers):
    """1년 3일 지난 행이 남아 있으면 368 · 개인정보를 이미 지운 더 오래된 공개 행은 세지 않는다."""
    now = datetime.now(timezone.utc)
    _row(db, created_at=now - timedelta(days=368))
    _row(db, created_at=now - timedelta(days=500), message=None, user_email=None, is_public=True,
         status="fixed", public_title="제목", public_answer="답", published_at=now)
    _row(db, created_at=now - timedelta(days=3))
    assert client.get("/api/admin/opinions", headers=admin_headers).json()["oldest_days"] == 368


def test_oldest_days_email_only_row_counts(db):
    """원문은 없어도 이메일이 남았으면 개인정보가 남은 행이다."""
    from routers.admin.opinions import _oldest_days

    now = datetime(2026, 10, 6, 1, 0, tzinfo=timezone.utc)  # KST 10-06 10:00
    _row(db, message=None, user_email="a@test.com", created_at=datetime(2026, 10, 1, 16, 0, tzinfo=timezone.utc))
    assert _oldest_days(db, now=now) == 4  # 생성 KST 10-02 01:00 → 한국 날짜로 4일째


def test_error_row_cannot_be_published(client, db, admin_headers):
    _err(client)
    row = _error_rows(db)[0]
    res = client.patch(f"/api/admin/opinions/{row.id}",
                       json={"is_public": True, "public_title": "제목", "public_answer": "답"},
                       headers=admin_headers)
    assert res.status_code == 400 and res.json()["detail"] == "자동 오류 기록은 공개할 수 없어요"
    db.expire_all()
    again = db.get(SiteOpinion, row.id)
    assert again.is_public is False and again.public_title is None
    # 상태 바꾸기는 그대로 된다
    ok = client.patch(f"/api/admin/opinions/{row.id}", json={"status": "closed"}, headers=admin_headers)
    assert ok.status_code == 200 and ok.json()["status"] == "closed"


# ══ 1년 정리 ══


def test_purge_deletes_old_error_rows_even_if_public(db):
    from crawler.vacuum_maintenance import _purge_old_opinions

    now = datetime.now(timezone.utc)
    old = now - timedelta(days=400)
    old_err = _row(db, kind="error", message="E: x", user_email=None, fingerprint="a" * 32, created_at=old)
    # 공개가 막혀 있어도 DB 에 직접 공개로 들어간 오류 행이 있다면 — 익명화가 아니라 삭제
    old_err_pub = _row(db, kind="error", message="E: y", user_email=None, fingerprint="b" * 32, created_at=old,
                       is_public=True, public_title="t", public_answer="a", published_at=old)
    new_err = _row(db, kind="error", message="E: z", user_email=None, fingerprint="c" * 32,
                   created_at=now - timedelta(days=10))
    ids = (old_err.id, old_err_pub.id, new_err.id)
    result = _purge_old_opinions()
    assert result == {"deleted": 2, "anonymized": 0}
    db.expire_all()
    assert db.get(SiteOpinion, ids[0]) is None and db.get(SiteOpinion, ids[1]) is None
    assert db.get(SiteOpinion, ids[2]) is not None


def test_model_accepts_error_kind_and_unique_fingerprint(db):
    from sqlalchemy.exc import IntegrityError

    db.add(SiteOpinion(kind="error", message="E: x", fingerprint="f" * 32))
    db.commit()
    db.add(SiteOpinion(kind="error", message="E: x", fingerprint="f" * 32))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()
    # 손님 의견은 지문이 같아도(보통 NULL) 유일 제약 대상이 아니다
    db.add(SiteOpinion(kind="bug", message="정상 길이의 글입니다", fingerprint="f" * 32))
    db.commit()


# ══ 적대검증 보완(세션 439 B1~B4) ══


def _deep(n):
    return "[" * n + "1" + "]" * n


@pytest.mark.parametrize("url, prefix", [
    ("/api/opinions", '{"kind": "bug", "message": "검색 화면에서 가격이 안 보여요", "x": '),
    ("/api/opinions/error", '{"area": "/x", "name": "E", "x": '),
])
@pytest.mark.parametrize("depth", [1000, 25])
def test_deep_body_422_both_routes(client, db, url, prefix, depth):
    """B1 — 1000겹 본문이 500(RecursionError)이 아니라 422 · 저장 0 · 본문 자체가 깊어도 422."""
    raw = prefix + _deep(depth) + "}"
    res = client.post(url, content=raw.encode("utf-8"), headers={"Content-Type": "application/json"})
    assert res.status_code == 422
    res2 = client.post(url, content=_deep(depth).encode("utf-8"), headers={"Content-Type": "application/json"})
    assert res2.status_code == 422
    db.expire_all()
    assert db.query(SiteOpinion).count() == 0


def test_normal_nesting_still_ok(client, db):
    """보통 본문(2겹)은 그대로 받는다 — 깊이 상한이 정상 요청을 막지 않는다."""
    res = client.post("/api/opinions", json={"kind": "bug", "message": "검색 화면에서 가격이 안 보여요",
                                             "interests": ["tax", "market"]})
    assert res.status_code == 200


def test_digest_splits_fingerprint(client, db):
    """B2 — 같은 화면·같은 문구라도 오류 번호가 다르면 다른 행 · 번호 없는 둘은 한 행."""
    generic = {"area": "/complex/1", "name": "Error", "message": "An error occurred in the Server Components render."}
    _err(client, {**generic, "digest": "111"})
    _err(client, {**generic, "digest": "222"})
    _err(client, generic)
    _err(client, generic)
    rows = _error_rows(db)
    assert len(rows) == 3
    assert sorted(r.repeat_count for r in rows) == [1, 1, 2]


def test_fingerprint_without_digest_unchanged():
    """B2 — 번호가 없으면 지문 재료가 예전과 같다(이미 저장된 지문 값이 안 바뀐다)."""
    import hashlib

    old = hashlib.sha256("/complex\nTypeError\nboom".encode("utf-8")).hexdigest()[:32]
    assert op_router.error_fingerprint("/complex/9", "TypeError", "boom") == old
    assert op_router.error_fingerprint("/complex/9", "TypeError", "boom", "") == old
    assert op_router.error_fingerprint("/complex/9", "TypeError", "boom", "d1") != old


def test_cap_logged_once_per_kind(client, monkeypatch, caplog):
    """B3 — 한도에 처음 닿은 순간 종류마다 그날 한 줄(IP 원문 없음)."""
    import logging

    monkeypatch.setattr(op_router, "ERROR_IP_DAILY_LIMIT", 2)
    monkeypatch.setattr(op_router, "ERROR_TOTAL_DAILY_LIMIT", 4)
    with caplog.at_level(logging.INFO, logger="routers.opinions"):
        for _ in range(5):
            _err(client, headers=_ip("203.0.113.44"))  # 3·4·5번째 = IP묶음 한도
        for i in range(4):
            _err(client, {**ERR, "message": f"e{i}"}, headers=_ip(f"198.51.100.{i}"))  # 3·4번째 = 전체 한도
    lines = [r.getMessage() for r in caplog.records if r.name == "routers.opinions"]
    assert lines.count("오류 창구 하루 한도 도달(IP묶음)") == 1
    assert lines.count("오류 창구 하루 한도 도달(전체)") == 1
    assert not any("203.0.113" in m or "198.51.100" in m for m in lines)


def test_upsert_postgres_sql_has_literal_partial_where():
    """B4 — PostgreSQL 로 만든 문장의 ON CONFLICT 에 'WHERE kind = 'error'' 가 글자 그대로 나온다
    (바인딩 인자면 드라이버가 바뀔 때 부분 색인 짝 맞추기가 어긋날 수 있다)."""
    from sqlalchemy.dialects import postgresql

    captured = []

    class _Dialect:
        name = "postgresql"

    class _Bind:
        dialect = _Dialect()

    class _Result:
        def scalar_one(self):
            return 1

    class _FakeDb:
        def get_bind(self):
            return _Bind()

        def execute(self, stmt):
            captured.append(stmt)
            return _Result()

    assert op_router._upsert_error_row(_FakeDb(), {"kind": "error", "message": "E: x", "fingerprint": "f" * 32})
    sql = str(captured[0].compile(dialect=postgresql.dialect()))
    assert "ON CONFLICT (fingerprint) WHERE kind = 'error' DO UPDATE" in sql
