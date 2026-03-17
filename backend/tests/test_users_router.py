"""사용자 프로필 API 라우터 테스트
실행: python -m pytest tests/test_users_router.py -v
"""
from jose import jwt
from db.models import UserProfile

JWT_SECRET = "test-secret-key-for-testing-only"


def _token(sub="user-001"):
    return jwt.encode({"sub": sub, "aud": "authenticated", "email": f"{sub}@test.com"}, JWT_SECRET, algorithm="HS256")


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _make_profile(db, uid="user-001", role="user", login_count=0):
    p = UserProfile(user_id=uid, email=f"{uid}@test.com", role=role, status="approved", login_count=login_count)
    db.add(p)
    db.commit()
    return p


def test_me_no_token_401(client):
    """토큰 없이 → 401"""
    assert client.get("/api/users/me").status_code == 401


def test_me_valid_token_200(client, db):
    """유효한 토큰 → 200 + 프로필"""
    _make_profile(db, "user-001")
    res = client.get("/api/users/me", headers=_auth(_token("user-001")))
    assert res.status_code == 200
    data = res.json()
    assert data["user_id"] == "user-001"
    assert data["role"] == "user"


def test_login_record_no_token_401(client):
    """토큰 없이 login-record → 401"""
    assert client.post("/api/users/login-record").status_code == 401


def test_login_record_increments_count(client, db):
    """login-record 호출 시 login_count 증가"""
    _make_profile(db, "user-002", login_count=5)
    token = _token("user-002")
    res = client.post("/api/users/login-record", headers=_auth(token))
    assert res.status_code == 200
    # DB 확인
    db.expire_all()
    profile = db.get(UserProfile, "user-002")
    assert profile.login_count == 6


def test_login_record_updates_timestamp(client, db):
    """login-record 호출 시 last_login_at 갱신"""
    _make_profile(db, "user-003")
    token = _token("user-003")
    client.post("/api/users/login-record", headers=_auth(token))
    db.expire_all()
    profile = db.get(UserProfile, "user-003")
    assert profile.last_login_at is not None
