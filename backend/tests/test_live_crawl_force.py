"""live start-crawl 의 force 파라미터 + cached 응답 last_crawled_at 검증.

실행: python -m pytest tests/test_live_crawl_force.py -v
"""
from datetime import datetime, timezone
from unittest.mock import patch

from jose import jwt

from db.models import Complex, UserProfile
from routers.live._shared import _cache, _crawl_status

JWT_SECRET = "test-secret-key-for-testing-only"


def _token(sub):
    return jwt.encode(
        {"sub": sub, "aud": "authenticated", "email": f"{sub}@test.com"},
        JWT_SECRET,
        algorithm="HS256",
    )


def _make_user(db, uid="u1", role="user"):
    p = UserProfile(user_id=uid, email=f"{uid}@test.com", role=role, status="approved")
    db.add(p)
    db.commit()


def _make_complex(db, complex_no="C001", last_crawled_at=None):
    cpx = Complex(
        complex_no=complex_no,
        complex_name="테스트단지",
        real_estate_type_code="APT",
        last_crawled_at=last_crawled_at,
    )
    db.add(cpx)
    db.commit()


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _reset_live_state(complex_no):
    """테스트 간 모듈 전역 상태 정리."""
    _cache.delete(f"crawl_done:{complex_no}")
    _crawl_status.pop(complex_no, None)


# ── cached 분기 + last_crawled_at 포함 ──


def test_cached_response_includes_last_crawled_at(client, db):
    """캐시 마커 있음 + force 없음 → status=cached + last_crawled_at ISO 포함"""
    _reset_live_state("C001")
    _make_user(db)
    crawled = datetime(2026, 1, 15, 9, 30, tzinfo=timezone.utc)
    _make_complex(db, "C001", last_crawled_at=crawled)
    _cache.set("crawl_done:C001", True)

    try:
        res = client.post(
            "/api/live/C001/articles/start-crawl",
            headers=_auth(_token("u1")),
        )
        assert res.status_code == 200
        body = res.json()
        assert body["status"] == "cached"
        assert body["complex_no"] == "C001"
        # SQLite 는 TZ 정보를 떨어뜨리므로 ISO prefix 로 비교
        assert body["last_crawled_at"] is not None
        assert body["last_crawled_at"].startswith("2026-01-15T09:30:00")
    finally:
        _reset_live_state("C001")


def test_cached_response_last_crawled_at_null_when_never_crawled(client, db):
    """단지는 있지만 last_crawled_at=None → null 반환"""
    _reset_live_state("C002")
    _make_user(db)
    _make_complex(db, "C002", last_crawled_at=None)
    _cache.set("crawl_done:C002", True)

    try:
        res = client.post(
            "/api/live/C002/articles/start-crawl",
            headers=_auth(_token("u1")),
        )
        assert res.status_code == 200
        assert res.json()["last_crawled_at"] is None
    finally:
        _reset_live_state("C002")


# ── force=True 분기 ──


def test_force_true_bypasses_cache_and_starts_crawl(client, db):
    """force=true + 캐시 있음 → 캐시 무시하고 크롤 스레드 시작"""
    _reset_live_state("C003")
    _make_user(db)
    _make_complex(db, "C003")
    _cache.set("crawl_done:C003", True)  # 캐시 마커 세팅

    # 실제 크롤 스레드는 띄우지 않도록 Thread 패치
    started_threads = []

    class _FakeThread:
        def __init__(self, *, target=None, args=(), daemon=True):
            started_threads.append((target, args, daemon))

        def start(self):
            pass

    try:
        with patch("routers.live.crawl.threading.Thread", _FakeThread):
            res = client.post(
                "/api/live/C003/articles/start-crawl?force=true",
                headers=_auth(_token("u1")),
            )
        assert res.status_code == 200
        body = res.json()
        assert body["status"] == "started"
        # 스레드가 실제로 생성되었는지
        assert len(started_threads) == 1
        # _background_crawl 타겟 + complex_no 인자 전달
        target, args, daemon = started_threads[0]
        assert args == ("C003",)
        assert daemon is True
    finally:
        _reset_live_state("C003")


def test_no_cache_marker_starts_crawl_without_force(client, db):
    """캐시 없음 → force 없어도 그냥 started"""
    _reset_live_state("C004")
    _make_user(db)
    _make_complex(db, "C004")

    class _FakeThread:
        def __init__(self, *, target=None, args=(), daemon=True):
            pass

        def start(self):
            pass

    try:
        with patch("routers.live.crawl.threading.Thread", _FakeThread):
            res = client.post(
                "/api/live/C004/articles/start-crawl",
                headers=_auth(_token("u1")),
            )
        assert res.status_code == 200
        assert res.json()["status"] == "started"
    finally:
        _reset_live_state("C004")


# ── finally terminal guard (세션 67) ──


def test_background_crawl_guard_when_session_fail(monkeypatch):
    """경로 1: SessionLocal() 예외 (상태 세팅 전) → guard 가 error 기록 + release 보장"""
    from routers.live import _crawl_bg
    from routers.live._shared import _active_complexes, _crawl_lock, _crawl_status

    def _boom():
        raise RuntimeError("DB connect fail")

    monkeypatch.setattr(_crawl_bg, "SessionLocal", _boom)

    complex_no = "guard-test-1"
    with _crawl_lock:
        _crawl_status.pop(complex_no, None)
        _active_complexes.discard(complex_no)

    _crawl_bg._background_crawl(complex_no)

    with _crawl_lock:
        st = _crawl_status.get(complex_no)
    assert st is not None
    assert st["status"] == "error"
    # release_complex 호출로 _active_complexes 정리됐는지 (finally 바깥 누수 방지)
    assert complex_no not in _active_complexes


def test_background_crawl_guard_when_throttle_fail(monkeypatch):
    """경로 1b: get_shared_throttle().wait() 예외 → guard 가 error + release 보장"""
    from routers.live import _crawl_bg
    from routers.live._shared import _active_complexes, _crawl_lock, _crawl_status

    class _FakeThrottle:
        def wait(self):
            raise RuntimeError("throttle crashed")

    monkeypatch.setattr(_crawl_bg, "get_shared_throttle", lambda _name: _FakeThrottle())

    complex_no = "guard-test-1b"
    with _crawl_lock:
        _crawl_status.pop(complex_no, None)
        _active_complexes.discard(complex_no)

    _crawl_bg._background_crawl(complex_no)

    with _crawl_lock:
        st = _crawl_status.get(complex_no)
    assert st is not None
    assert st["status"] == "error"
    assert complex_no not in _active_complexes


def test_background_crawl_guard_when_baseexception(monkeypatch):
    """경로 3: BaseException 경로 → finally 가드가 running → error"""
    from routers.live import _crawl_bg
    from routers.live._shared import _active_complexes, _crawl_lock, _crawl_status

    class _CustomBaseExc(BaseException):
        """pytest 런너를 중단시키지 않는 커스텀 BaseException"""

    def _boom(*_a, **_kw):
        raise _CustomBaseExc("simulated")

    monkeypatch.setattr(_crawl_bg, "_fetch_articles_all_trade_types", _boom)

    complex_no = "guard-test-2"
    with _crawl_lock:
        _crawl_status.pop(complex_no, None)
        _active_complexes.discard(complex_no)

    try:
        _crawl_bg._background_crawl(complex_no)
    except _CustomBaseExc:
        pass

    with _crawl_lock:
        st = _crawl_status.get(complex_no)
    assert st is not None
    assert st["status"] == "error"
    assert complex_no not in _active_complexes


def test_background_crawl_guard_preserves_terminal(monkeypatch):
    """정상 경로(status=done) 시 finally 가드가 덮어쓰지 않음"""
    from routers.live import _crawl_bg
    from routers.live._shared import _active_complexes, _crawl_lock, _crawl_status

    complex_no = "guard-test-3"
    with _crawl_lock:
        _crawl_status.pop(complex_no, None)
        _active_complexes.discard(complex_no)

    monkeypatch.setattr(
        _crawl_bg,
        "_fetch_articles_all_trade_types",
        lambda *_a, **_kw: {"articleList": [], "isMoreData": False},
    )
    monkeypatch.setattr(_crawl_bg, "enrich_complex_detail", lambda *_a, **_kw: None)
    monkeypatch.setattr(_crawl_bg, "_crawl_details_for_complex", lambda *_a, **_kw: None)

    _crawl_bg._background_crawl(complex_no)

    with _crawl_lock:
        st = _crawl_status.get(complex_no)
    assert st is not None
    assert st["status"] in {"done", "done_partial"}


def test_update_crawl_status_creates_when_absent():
    """_update_crawl_status: key 없으면 신규 생성 (create 모드)"""
    from routers.live._shared import _crawl_lock, _crawl_status, _update_crawl_status

    complex_no = "guard-test-4"
    with _crawl_lock:
        _crawl_status.pop(complex_no, None)

    _update_crawl_status(complex_no, status="already_running")

    with _crawl_lock:
        st = _crawl_status.get(complex_no)
    assert st is not None
    assert st["status"] == "already_running"
