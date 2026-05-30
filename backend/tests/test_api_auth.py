"""API 인증/인가 테스트 — 토큰 검증, 역할 접근 제어, 프로필 자동 생성
실행: python -m pytest tests/test_api_auth.py -v
"""

import jwt

from db.models import UserProfile

JWT_SECRET = "test-secret-key-for-testing-only"
JWT_ALG = "HS256"


def _token(sub="user-001", aud="authenticated", email="test@test.com", user_metadata=None):
    """테스트용 JWT 생성. user_metadata 는 Supabase signUp options.data → JWT 클레임 모사."""
    claims = {"sub": sub, "aud": aud, "email": email}
    if user_metadata is not None:
        claims["user_metadata"] = user_metadata
    return jwt.encode(claims, JWT_SECRET, algorithm=JWT_ALG)


def _admin_token(sub="admin-001"):
    """관리자용 JWT 생성"""
    return _token(sub=sub, email="admin@test.com")


def _make_profile(db, user_id, role="user", status="approved"):
    """테스트용 UserProfile 생성"""
    p = UserProfile(user_id=user_id, email=f"{user_id}@test.com", role=role, status=status)
    db.add(p)
    db.commit()
    return p


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


# ── 인증 필수 엔드포인트 ──

def test_users_me_no_token_401(client):
    """토큰 없이 /api/users/me → 401"""
    res = client.get("/api/users/me")
    assert res.status_code == 401


def test_users_me_invalid_token_401(client):
    """잘못된 JWT로 /api/users/me → 401"""
    res = client.get("/api/users/me", headers={"Authorization": "Bearer invalid.token.here"})
    assert res.status_code == 401


def test_users_me_valid_token_200(client, db):
    """유효한 토큰으로 /api/users/me → 200 + 프로필 반환"""
    _make_profile(db, "user-001")
    token = _token(sub="user-001")
    res = client.get("/api/users/me", headers=_auth(token))
    assert res.status_code == 200
    data = res.json()
    assert data["user_id"] == "user-001"
    assert data["role"] == "user"


def test_auto_profile_creation(client, db):
    """첫 로그인 시 프로필 자동 생성"""
    token = _token(sub="new-user-999", email="new@test.com")
    res = client.get("/api/users/me", headers=_auth(token))
    assert res.status_code == 200
    data = res.json()
    assert data["user_id"] == "new-user-999"
    assert data["role"] == "user"
    # DB에 실제로 프로필이 생성되었는지 확인
    profile = db.get(UserProfile, "new-user-999")
    assert profile is not None
    assert profile.email == "new@test.com"


def test_auto_profile_agree_marketing_saved(client, db):
    """회원가입 시 동의(user_metadata.agree_marketing=True)가 프로필에 저장됨"""
    token = _token(sub="mk-user", email="mk@test.com", user_metadata={"agree_marketing": True})
    res = client.get("/api/users/me", headers=_auth(token))
    assert res.status_code == 200
    profile = db.get(UserProfile, "mk-user")
    assert profile is not None
    assert profile.agree_marketing is True


def test_auto_profile_agree_marketing_default_false(client, db):
    """user_metadata 없는 토큰 → agree_marketing 기본 False"""
    token = _token(sub="nomk-user", email="nomk@test.com")
    res = client.get("/api/users/me", headers=_auth(token))
    assert res.status_code == 200
    profile = db.get(UserProfile, "nomk-user")
    assert profile is not None
    assert profile.agree_marketing is False


def test_suspended_user_403(client, db):
    """정지된 계정 → 403"""
    _make_profile(db, "suspended-001", status="suspended")
    token = _token(sub="suspended-001")
    res = client.get("/api/users/me", headers=_auth(token))
    assert res.status_code == 403
    assert "정지" in res.json()["detail"]


# ── 관리자 엔드포인트 ──

def test_admin_endpoint_no_token_401(client):
    """토큰 없이 admin API → 401"""
    res = client.get("/api/admin/users")
    assert res.status_code == 401


def test_admin_endpoint_user_token_403(client, db):
    """일반 사용자 토큰으로 admin API → 403"""
    _make_profile(db, "user-002")
    token = _token(sub="user-002")
    res = client.get("/api/admin/users", headers=_auth(token))
    assert res.status_code == 403


def test_admin_endpoint_admin_token_200(client, db):
    """관리자 토큰으로 admin API → 200"""
    _make_profile(db, "admin-001", role="admin")
    token = _admin_token()
    res = client.get("/api/admin/users", headers=_auth(token))
    assert res.status_code == 200


# ── 선택적 인증 ──

def test_stats_no_auth_200(client):
    """인증 없이 공개 엔드포인트 접근 가능"""
    res = client.get("/api/stats")
    assert res.status_code == 200


def test_regions_no_auth_200(client):
    """지역 API는 인증 불필요"""
    res = client.get("/api/regions")
    assert res.status_code == 200


def test_expired_token_401(client):
    import time
    expired = jwt.encode({'sub': 'u1', 'aud': 'authenticated', 'exp': int(time.time()) - 100}, JWT_SECRET, algorithm=JWT_ALG)
    assert client.get('/api/users/me', headers=_auth(expired)).status_code == 401

def test_wrong_audience_401(client):
    bad = jwt.encode({'sub': 'u1', 'aud': 'wrong'}, JWT_SECRET, algorithm=JWT_ALG)
    assert client.get('/api/users/me', headers=_auth(bad)).status_code == 401

def test_health_no_auth(client):
    assert client.get('/health').status_code == 200

def test_complexes_search_no_auth(client):
    assert client.get('/api/complexes/search?q=test').status_code in [200, 404]

def test_articles_no_auth(client):
    assert client.get('/api/articles/NONE').status_code in [200, 404]
