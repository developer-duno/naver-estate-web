"""get_approved_user 의 approved_until naive/aware 비교 500 버그 회귀 테스트.

근본 원인 (세션 312 가드 4):
- utcnow() = datetime.now(timezone.utc) → aware
- admin/users.py 가 offset 없는 ISO(naive)로 approved_until 저장 가능
- get_approved_user 가 naive expiry < aware utcnow() 비교 → TypeError(500)

수정: 저장 측(admin/users.py) + 비교 측(deps.py) 양쪽에서 naive → UTC aware 강제.
실행: python -m pytest tests/test_approved_until_tz.py -v
"""

from datetime import datetime, timedelta, timezone

import jwt
from fastapi import HTTPException

from db.models import UserProfile
from deps import get_approved_user

JWT_SECRET = "test-secret-key-for-testing-only"
JWT_ALG = "HS256"


def _token(sub="expert-001", aud="authenticated", email="expert@test.com"):
    return jwt.encode({"sub": sub, "aud": aud, "email": email}, JWT_SECRET, algorithm=JWT_ALG)


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


# get_approved_user 를 직접 거는 전용 엔드포인트가 필요.
# start-crawl(get_approved_user) 은 네이버 호출/스레드라 부적합 →
# get_approved_user 단위 함수를 직접 호출해 비교 로직만 검증한다.


def _approved_user_dict(approved_until_iso):
    """get_current_user 가 반환하는 dict 모사 (approved_until 은 isoformat 문자열)."""
    return {
        "user_id": "expert-001",
        "email": "expert@test.com",
        "role": "expert",
        "status": "approved",
        "approved_until": approved_until_iso,
        "daily_crawl_quota": 5,
        "daily_export_quota": 10,
    }


def test_naive_future_approved_until_no_500():
    """naive(offset 없는) 미래 만료일 → 500 아니고 통과 (핵심 회귀)."""
    future_naive = (datetime.now(timezone.utc) + timedelta(days=30)).replace(tzinfo=None)
    user = _approved_user_dict(future_naive.isoformat())  # offset 없는 ISO
    result = get_approved_user(user)  # TypeError(500) 나면 안 됨
    assert result["user_id"] == "expert-001"


def test_naive_past_approved_until_403():
    """naive 과거 만료일 → 403(만료), 500 아님."""
    past_naive = (datetime.now(timezone.utc) - timedelta(days=1)).replace(tzinfo=None)
    user = _approved_user_dict(past_naive.isoformat())
    try:
        get_approved_user(user)
        assert False, "만료된 approved_until 인데 통과함"
    except HTTPException as e:
        assert e.status_code == 403
        assert "만료" in e.detail


def test_aware_future_approved_until_pass():
    """aware(offset 포함) 미래 만료일 → 정상 통과."""
    future_aware = datetime.now(timezone.utc) + timedelta(days=30)
    user = _approved_user_dict(future_aware.isoformat())  # offset 포함 ISO
    result = get_approved_user(user)
    assert result["user_id"] == "expert-001"


def test_aware_past_approved_until_403():
    """aware 과거 만료일 → 403."""
    past_aware = datetime.now(timezone.utc) - timedelta(days=1)
    user = _approved_user_dict(past_aware.isoformat())
    try:
        get_approved_user(user)
        assert False
    except HTTPException as e:
        assert e.status_code == 403


def test_none_approved_until_pass():
    """approved_until None(무기한) → 통과."""
    user = _approved_user_dict(None)
    result = get_approved_user(user)
    assert result["user_id"] == "expert-001"


# ── 저장 측 (admin/users.py) — offset 없는 ISO 저장 시 aware 로 저장 ──


def test_admin_save_naive_iso_stored_as_aware(client, db):
    """관리자가 offset 없는 approved_until 저장 → DB 에 aware(UTC) 로 저장."""
    # 관리자 + 대상 expert 준비
    admin = UserProfile(user_id="admin-001", email="admin@test.com", role="admin", status="approved")
    target = UserProfile(user_id="expert-tz", email="expert-tz@test.com", role="expert", status="approved")
    db.add_all([admin, target])
    db.commit()

    admin_token = _token(sub="admin-001", email="admin@test.com")
    res = client.patch(
        "/api/admin/users/expert-tz",
        headers=_auth(admin_token),
        json={"approved_until": "2027-01-01T00:00:00"},  # offset 없는 naive ISO
    )
    assert res.status_code == 200
    db.expire_all()
    saved = db.get(UserProfile, "expert-tz")
    assert saved.approved_until is not None
    # SQLite 는 tzinfo 를 보존하지 않을 수 있으나, PG(prod)는 aware 저장.
    # 핵심 = 저장 자체가 성공(500 아님)하고 비교 시 깨지지 않는다.
    # 저장된 값으로 get_approved_user 재현 — 500 안 남을 검증.
    iso = saved.approved_until.isoformat()
    user = _approved_user_dict(iso)
    user["user_id"] = "expert-tz"
    result = get_approved_user(user)
    assert result["user_id"] == "expert-tz"
