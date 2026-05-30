"""관리자 API 라우터 테스트 — 인증, 사용자 관리, 설정
실행: python -m pytest tests/test_admin_router.py -v
"""
import jwt

from db.models import UserProfile

JWT_SECRET = "test-secret-key-for-testing-only"


def _token(sub, role="user"):
    return jwt.encode({"sub": sub, "aud": "authenticated", "email": f"{sub}@test.com"}, JWT_SECRET, algorithm="HS256")


def _make_profile(db, uid, role="user", status="approved"):
    p = UserProfile(user_id=uid, email=f"{uid}@test.com", role=role, status=status)
    db.add(p)
    db.commit()
    return p


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


# ── 인증 검증 ──

def test_admin_users_no_auth_401(client):
    """인증 없이 → 401"""
    assert client.get("/api/admin/users").status_code == 401


def test_admin_users_regular_user_403(client, db):
    """일반 사용자 → 403"""
    _make_profile(db, "u1")
    assert client.get("/api/admin/users", headers=_auth(_token("u1"))).status_code == 403


def test_admin_users_admin_200(client, db):
    """관리자 → 200"""
    _make_profile(db, "a1", role="admin")
    res = client.get("/api/admin/users", headers=_auth(_token("a1")))
    assert res.status_code == 200


# ── 사용자 관리 ──

def test_update_user_role(client, db):
    """사용자 역할 변경"""
    _make_profile(db, "a1", role="admin")
    _make_profile(db, "u1", role="user")
    res = client.patch(
        "/api/admin/users/u1",
        json={"role": "expert"},
        headers={**_auth(_token("a1")), "Content-Type": "application/json"},
    )
    assert res.status_code == 200


def test_suspend_user(client, db):
    """사용자 정지"""
    _make_profile(db, "a1", role="admin")
    _make_profile(db, "u1", role="user")
    res = client.delete("/api/admin/users/u1", headers=_auth(_token("a1")))
    assert res.status_code == 200


# ── 통계 ──

def test_detailed_stats(client, db):
    """상세 통계 조회"""
    _make_profile(db, "a1", role="admin")
    res = client.get("/api/admin/stats/detailed", headers=_auth(_token("a1")))
    assert res.status_code == 200


def test_detailed_stats_fill_rate_keys(client, db):
    """PR 6a — 채움률 3 필드 응답 키 검증"""
    _make_profile(db, "a1", role="admin")
    res = client.get("/api/admin/stats/detailed", headers=_auth(_token("a1")))
    assert res.status_code == 200
    body = res.json()
    assert "complex_detail_fill_rate" in body
    assert "article_detail_fill_rate" in body
    assert "complex_metric_fill_rate" in body


def test_safe_fill_rate_zero_total_returns_none():
    """PR 6a — _safe_fill_rate(0, 0) == None 회귀 가드 (0건 vs 0% 구별 F9 답습)"""
    from routers.admin.jobs import _safe_fill_rate

    assert _safe_fill_rate(0, 0) is None  # 모집단 0건 = None
    assert _safe_fill_rate(0, 100) == 0.0  # 실제 0% 채움률 = 0.0
    assert _safe_fill_rate(10, 100) == 0.1  # 정상 10% 채움률


# ── 감사 로그 ──

def test_audit_logs(client, db):
    """감사 로그 조회"""
    _make_profile(db, "a1", role="admin")
    res = client.get("/api/admin/audit-logs", headers=_auth(_token("a1")))
    assert res.status_code == 200


# ── 설정 ──

def test_get_settings(client, db):
    """설정 조회"""
    _make_profile(db, "a1", role="admin")
    res = client.get("/api/admin/settings", headers=_auth(_token("a1")))
    assert res.status_code == 200


def test_update_setting(client, db):
    """설정 생성/수정"""
    _make_profile(db, "a1", role="admin")
    res = client.patch(
        "/api/admin/settings/test_key",
        json={"value": {"enabled": True}},
        headers={**_auth(_token("a1")), "Content-Type": "application/json"},
    )
    assert res.status_code == 200


def test_admin_crawl_jobs_200(client, db):
    _make_profile(db, 'a2', role='admin')
    res = client.get('/api/admin/crawl-jobs', headers=_auth(_token('a2')))
    assert res.status_code == 200

def test_admin_users_filter_status(client, db):
    _make_profile(db, 'a3', role='admin')
    res = client.get('/api/admin/users?status=approved', headers=_auth(_token('a3')))
    assert res.status_code == 200

def test_admin_users_filter_role(client, db):
    _make_profile(db, 'a4', role='admin')
    res = client.get('/api/admin/users?role=admin', headers=_auth(_token('a4')))
    assert res.status_code == 200

def test_admin_users_pagination(client, db):
    _make_profile(db, 'a5', role='admin')
    for i in range(5):
        _make_profile(db, f'pu{i}', role='user')
    res = client.get('/api/admin/users?page=1', headers=_auth(_token('a5')))
    assert res.status_code == 200

def test_admin_stats_no_auth_401(client):
    assert client.get('/api/admin/stats/detailed').status_code == 401

def test_admin_audit_no_auth_401(client):
    assert client.get('/api/admin/audit-logs').status_code == 401

def test_admin_settings_no_auth_401(client):
    assert client.get('/api/admin/settings').status_code == 401

def test_admin_crawl_no_auth_401(client):
    assert client.get('/api/admin/crawl-jobs').status_code == 401

def test_admin_stats_user_403(client, db):
    _make_profile(db, 'ru1')
    assert client.get('/api/admin/stats/detailed', headers=_auth(_token('ru1'))).status_code == 403

def test_admin_audit_user_403(client, db):
    _make_profile(db, 'ru2')
    assert client.get('/api/admin/audit-logs', headers=_auth(_token('ru2'))).status_code == 403

def test_admin_settings_user_403(client, db):
    _make_profile(db, 'ru3')
    assert client.get('/api/admin/settings', headers=_auth(_token('ru3'))).status_code == 403
