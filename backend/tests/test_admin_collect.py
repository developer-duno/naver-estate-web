"""관리자 수집 트리거 API 테스트
실행: python -m pytest tests/test_admin_collect.py -v
"""

from unittest.mock import patch

import jwt

from db.models import UserProfile

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


# ── 인증 검증 ──


def test_collect_no_auth_401(client):
    """인증 없이 수집 트리거 → 401"""
    assert client.post("/api/admin/collect/crime-stats").status_code == 401


def test_collect_regular_user_403(client, db):
    """일반 사용자 수집 트리거 → 403"""
    _make_profile(db, "u1")
    res = client.post("/api/admin/collect/crime-stats", headers=_auth(_token("u1")))
    assert res.status_code == 403


# ── 수집 트리거 ──


def test_collect_crime_stats_success(client, db):
    """범죄통계 수집 트리거 — 관리자 성공"""
    _make_profile(db, "a1", role="admin")
    with patch("routers.admin.collect._get_collector") as mock_get:
        mock_fn = mock_get.return_value
        mock_fn.return_value = None
        res = client.post("/api/admin/collect/crime-stats", headers=_auth(_token("a1")))
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "completed"
        assert data["collector"] == "crime-stats"


def test_collect_air_quality_success(client, db):
    """대기질 수집 트리거 — 관리자 성공"""
    _make_profile(db, "a2", role="admin")
    with patch("routers.admin.collect._get_collector") as mock_get:
        mock_fn = mock_get.return_value
        mock_fn.return_value = None
        res = client.post("/api/admin/collect/air-quality", headers=_auth(_token("a2")))
        assert res.status_code == 200
        assert res.json()["collector"] == "air-quality"


def test_collect_invalid_name_422(client, db):
    """잘못된 수집기 이름 → 422 (Literal 검증)"""
    _make_profile(db, "a3", role="admin")
    res = client.post("/api/admin/collect/invalid-name", headers=_auth(_token("a3")))
    assert res.status_code == 422


def test_collect_exception_500(client, db):
    """수집 중 예외 → 500"""
    _make_profile(db, "a4", role="admin")
    with patch("routers.admin.collect._get_collector") as mock_get:
        mock_fn = mock_get.return_value
        mock_fn.side_effect = RuntimeError("API 장애")
        res = client.post("/api/admin/collect/crime-stats", headers=_auth(_token("a4")))
        assert res.status_code == 500
        assert "수집 실패" in res.json()["detail"]


# ── 범죄통계 상태 조회 ──


def test_crime_stats_status_no_auth_401(client):
    """인증 없이 상태 조회 → 401"""
    assert client.get("/api/admin/collect/crime-stats/status").status_code == 401


def test_crime_stats_status_empty(client, db):
    """데이터 없는 상태에서 상태 조회"""
    _make_profile(db, "a5", role="admin")
    res = client.get(
        "/api/admin/collect/crime-stats/status",
        headers=_auth(_token("a5")),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["total_scored"] == 0
    assert data["last_updated"] is None
    assert data["grade_dist"] == {}
