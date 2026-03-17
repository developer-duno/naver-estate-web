"""권한 검사 + 쿼터 테스트 — require_admin, require_role, check_quota
실행: python -m pytest tests/test_permissions.py -v
"""
import pytest
from fastapi import HTTPException
from auth.permissions import require_admin, require_role, check_quota
from db.models import RateLimitCounter


# ── require_admin ──

def test_require_admin_passes():
    """admin 역할 → 통과"""
    require_admin({"role": "admin"})  # should not raise


def test_require_admin_fails_user():
    """user 역할 → 403"""
    with pytest.raises(HTTPException) as exc:
        require_admin({"role": "user"})
    assert exc.value.status_code == 403


def test_require_admin_fails_expert():
    """expert 역할 → 403"""
    with pytest.raises(HTTPException) as exc:
        require_admin({"role": "expert"})
    assert exc.value.status_code == 403


def test_require_admin_fails_no_role():
    """역할 없음 → 403"""
    with pytest.raises(HTTPException) as exc:
        require_admin({})
    assert exc.value.status_code == 403


# ── require_role ──

def test_require_role_single_match():
    """허용 역할에 포함 → 통과"""
    require_role({"role": "expert"}, ["admin", "expert"])


def test_require_role_no_match():
    """허용 역할에 미포함 → 403"""
    with pytest.raises(HTTPException) as exc:
        require_role({"role": "user"}, ["admin", "expert"])
    assert exc.value.status_code == 403


# ── check_quota ──

def test_check_quota_first_use(db):
    """첫 사용 → 통과, 카운터 생성"""
    check_quota(db, "user-001", "crawl", 5)
    db.commit()
    counters = db.query(RateLimitCounter).all()
    assert len(counters) == 1
    assert counters[0].count == 1


def test_check_quota_within_limit(db):
    """한도 내 → 통과"""
    for i in range(4):
        check_quota(db, "user-002", "export", 5)
        db.commit()
    # 4번 사용 후 아직 1번 남음 → 통과
    check_quota(db, "user-002", "export", 5)
    db.commit()


def test_check_quota_exceeded(db):
    """한도 초과 → 429"""
    for i in range(3):
        check_quota(db, "user-003", "crawl", 3)
        db.commit()
    with pytest.raises(HTTPException) as exc:
        check_quota(db, "user-003", "crawl", 3)
    assert exc.value.status_code == 429
    assert "한도" in exc.value.detail
