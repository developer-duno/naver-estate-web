"""관리자 Naver API 호출 모니터링 API 테스트.

실행: python -m pytest tests/test_admin_naver_calls.py -v
"""

from jose import jwt

from db.models import UserProfile
from services import naver_call_counter

JWT_SECRET = "test-secret-key-for-testing-only"


def _token(sub):
    return jwt.encode(
        {"sub": sub, "aud": "authenticated", "email": f"{sub}@test.com"},
        JWT_SECRET,
        algorithm="HS256",
    )


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _make_admin(db, uid="admin1"):
    p = UserProfile(user_id=uid, email=f"{uid}@test.com", role="admin", status="approved")
    db.add(p)
    db.commit()


def setup_function():
    """각 테스트 전 카운터 + DB 초기화."""
    naver_call_counter.reset()
    try:
        from db.database import SessionLocal
        from db.models import NaverApiCallCount

        db = SessionLocal()
        try:
            db.query(NaverApiCallCount).delete()
            db.commit()
        finally:
            db.close()
    except Exception:
        pass


def test_naver_calls_no_auth_401(client):
    """인증 없이 접근 → 401"""
    assert client.get("/api/admin/naver-calls").status_code == 401


def test_naver_calls_regular_user_403(client, db):
    """일반 사용자 → 403"""
    db.add(UserProfile(user_id="u1", email="u1@test.com", role="user", status="approved"))
    db.commit()
    res = client.get("/api/admin/naver-calls", headers=_auth(_token("u1")))
    assert res.status_code == 403


def test_naver_calls_empty_response(client, db):
    """카운터 비어있으면 빈 labels + 0 totals + 업타임 양수"""
    _make_admin(db)
    res = client.get("/api/admin/naver-calls", headers=_auth(_token("admin1")))
    assert res.status_code == 200
    data = res.json()
    assert data["labels"] == {}
    assert data["totals"] == {"10m": 0, "1h": 0, "24h": 0}
    assert data["process_uptime_seconds"] > 0


def test_naver_calls_reflects_record_call(client, db):
    """record_call 후 응답에 수치가 반영되는지"""
    _make_admin(db)
    for _ in range(4):
        naver_call_counter.record_call("search")
    for _ in range(2):
        naver_call_counter.record_call("complex_prices_ondemand")

    res = client.get("/api/admin/naver-calls", headers=_auth(_token("admin1")))
    data = res.json()
    assert data["labels"]["search"] == {"10m": 4, "1h": 4, "24h": 4}
    assert data["labels"]["complex_prices_ondemand"] == {"10m": 2, "1h": 2, "24h": 2}
    assert data["totals"] == {"10m": 6, "1h": 6, "24h": 6}
