"""관리자 일괄 재크롤 API 테스트.
실행: python -m pytest tests/test_admin_recrawl.py -v
"""
from unittest.mock import patch

from jose import jwt

from db.models import UserProfile
from routers.admin import recrawl as recrawl_mod

JWT_SECRET = "test-secret-key-for-testing-only"


def _token(sub):
    return jwt.encode(
        {"sub": sub, "aud": "authenticated", "email": f"{sub}@test.com"},
        JWT_SECRET,
        algorithm="HS256",
    )


def _make_profile(db, uid, role="user", status="approved"):
    p = UserProfile(user_id=uid, email=f"{uid}@test.com", role=role, status=status)
    db.add(p)
    db.commit()
    return p


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _reset_flag():
    with recrawl_mod._recrawl_lock:
        recrawl_mod._recrawl_running = False


# ── 안전도 판정 로직 단위 테스트 ──


class TestClassifySafety:
    def test_safe_window_empty(self):
        """05~09시 + running 0 → safe"""
        level, _ = recrawl_mod._classify_safety(7, 0)
        assert level == "safe"

    def test_peak_hour_danger(self):
        """23시 → danger"""
        level, _ = recrawl_mod._classify_safety(23, 0)
        assert level == "danger"

    def test_early_morning_danger(self):
        """01시 → danger (사용자 피크는 22~02)"""
        level, _ = recrawl_mod._classify_safety(1, 0)
        assert level == "danger"

    def test_two_running_jobs_danger(self):
        """running ≥2 → 시간대 무관 danger"""
        level, _ = recrawl_mod._classify_safety(7, 2)
        assert level == "danger"

    def test_activity_hours_warn(self):
        """14시 + running 0 → warn"""
        level, _ = recrawl_mod._classify_safety(14, 0)
        assert level == "warn"

    def test_one_running_in_safe_window_warn(self):
        """05~10시지만 running 1 → warn (safe의 running==0 조건 탈락)"""
        level, _ = recrawl_mod._classify_safety(7, 1)
        assert level == "warn"


# ── 인증 ──


def test_status_no_auth_401(client):
    assert client.get("/api/admin/recrawl/status").status_code == 401


def test_status_regular_user_403(client, db):
    _make_profile(db, "u1")
    res = client.get("/api/admin/recrawl/status", headers=_auth(_token("u1")))
    assert res.status_code == 403


def test_run_no_auth_401(client):
    assert client.post("/api/admin/recrawl/articles", json={}).status_code == 401


# ── status 엔드포인트 ──


def test_status_admin_returns_level(client, db):
    _make_profile(db, "a1", role="admin")
    res = client.get("/api/admin/recrawl/status", headers=_auth(_token("a1")))
    assert res.status_code == 200
    body = res.json()
    assert body["level"] in ("safe", "warn", "danger")
    assert "message" in body
    assert body["recommended_window_kst"] == "05:00~10:00"
    assert isinstance(body["running_jobs"], list)


def test_status_filters_stale_running_jobs(client, db):
    """1시간 이상 방치된 running 행은 count에서 제외 — 유령 잔재 방지"""
    from datetime import datetime, timedelta, timezone

    from db.models import CrawlJob

    _make_profile(db, "a_stale", role="admin")
    # 30일 전 running 행 (유령)
    stale = CrawlJob(
        job_type="popular_crawl",
        status="running",
        started_at=datetime.now(timezone.utc) - timedelta(days=30),
    )
    db.add(stale)
    db.commit()

    res = client.get("/api/admin/recrawl/status", headers=_auth(_token("a_stale")))
    assert res.status_code == 200
    body = res.json()
    assert body["running_jobs_count"] == 0  # stale은 제외돼야 함
    assert len(body["running_jobs"]) == 0


# ── run 엔드포인트 ──


def test_run_invalid_batch_size_400(client, db):
    _reset_flag()
    _make_profile(db, "a2", role="admin")
    res = client.post(
        "/api/admin/recrawl/articles",
        headers=_auth(_token("a2")),
        json={"batch_size": 10},
    )
    assert res.status_code == 400


def test_run_batch_size_over_cap_400(client, db):
    _reset_flag()
    _make_profile(db, "a3", role="admin")
    res = client.post(
        "/api/admin/recrawl/articles",
        headers=_auth(_token("a3")),
        json={"batch_size": 1000},
    )
    assert res.status_code == 400


def test_run_success_spawns_thread(client, db):
    """정상 실행 → started 반환 + 백그라운드 Thread 시작"""
    _reset_flag()
    _make_profile(db, "a4", role="admin")
    with patch("routers.admin.recrawl.threading.Thread") as mock_thread, \
         patch("routers.admin.recrawl._classify_safety", return_value=("safe", "ok")):
        res = client.post(
            "/api/admin/recrawl/articles",
            headers=_auth(_token("a4")),
            json={"batch_size": 100},
        )
        assert res.status_code == 200
        body = res.json()
        assert body["status"] == "started"
        assert body["batch_size"] == 100
        assert body["level"] == "safe"
        mock_thread.assert_called_once()
        mock_thread.return_value.start.assert_called_once()
    _reset_flag()


def test_run_blocks_duplicate(client, db):
    """이미 실행 중이면 409"""
    _reset_flag()
    _make_profile(db, "a5", role="admin")
    with recrawl_mod._recrawl_lock:
        recrawl_mod._recrawl_running = True
    try:
        res = client.post(
            "/api/admin/recrawl/articles",
            headers=_auth(_token("a5")),
            json={"batch_size": 100},
        )
        assert res.status_code == 409
    finally:
        _reset_flag()


def test_run_danger_blocked_without_force(client, db):
    """🔴 danger면 force 없이 409"""
    _reset_flag()
    _make_profile(db, "a6", role="admin")
    with patch("routers.admin.recrawl._classify_safety", return_value=("danger", "위험")):
        res = client.post(
            "/api/admin/recrawl/articles",
            headers=_auth(_token("a6")),
            json={"batch_size": 100},
        )
        assert res.status_code == 409
    _reset_flag()


def test_run_danger_allowed_with_force(client, db):
    """🔴 danger라도 force=true면 허용"""
    _reset_flag()
    _make_profile(db, "a7", role="admin")
    with patch("routers.admin.recrawl.threading.Thread") as mock_thread, \
         patch("routers.admin.recrawl._classify_safety", return_value=("danger", "위험")):
        res = client.post(
            "/api/admin/recrawl/articles",
            headers=_auth(_token("a7")),
            json={"batch_size": 100, "force": True},
        )
        assert res.status_code == 200
        assert res.json()["level"] == "danger"
        mock_thread.assert_called_once()
    _reset_flag()
