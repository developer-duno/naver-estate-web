"""권한 검사 + 쿼터 테스트 — require_admin, require_role, check_quota
실행: python -m pytest tests/test_permissions.py -v
"""
from datetime import datetime, timedelta, timezone
from unittest.mock import patch
from zoneinfo import ZoneInfo

import pytest
from fastapi import HTTPException

from auth.permissions import check_quota, require_admin, require_role
from db.models import RateLimitCounter


def _frozen_datetime(fixed: datetime):
    """datetime 서브클래스를 만들어 now() 만 고정 시각으로 대체한다.

    check_quota 가 `from datetime import datetime` 로 가져다 쓰므로
    `patch("auth.permissions.datetime", _frozen_datetime(t))` 로 주입한다.
    now(tz) 의 tz 인자를 존중해야 다른 now(timezone.utc) 호출도 정상 동작한다.
    고정 시각은 실행 시점에 캡처한 aware datetime — 날짜 하드코딩 금지.
    """

    class _Frozen(datetime):
        @classmethod
        def now(cls, tz=None):
            return fixed.astimezone(tz) if tz else fixed.replace(tzinfo=None)

    return _Frozen


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


# ── 일일 리셋 경계 (KST) ──


def test_check_quota_resets_at_kst_midnight(db):
    """일일 한도 리셋은 UTC 자정이 아니라 KST 자정.

    UTC 날짜를 키로 쓰면 한도가 KST 오전 9시에 리셋돼 하루가 어긋난다.
    검증 시각 두 개(KST 어제 23:30 / 오늘 00:30)는 KST 로는 다른 날이지만
    UTC 로는 같은 날(14:30 / 15:30)이라, UTC 키였다면 같은 버킷을 공유해
    한도 초과(429)가 났을 조합이다. 고정 날짜 하드코딩 금지 → 실행 시점을
    캡처해 그 앞뒤 상대값으로 freeze.
    """
    kst_midnight = datetime.now(ZoneInfo("Asia/Seoul")).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    before = kst_midnight - timedelta(minutes=30)  # KST 어제 23:30 (UTC 같은 날 14:30)
    after = kst_midnight + timedelta(minutes=30)   # KST 오늘 00:30 (UTC 같은 날 15:30)

    # 자정 직전에 한도(1회)를 모두 소진
    with patch("auth.permissions.datetime", _frozen_datetime(before)):
        check_quota(db, "user-kst", "crawl", 1)
        db.commit()
        with pytest.raises(HTTPException) as exc:
            check_quota(db, "user-kst", "crawl", 1)
        assert exc.value.status_code == 429

    # KST 자정을 넘기면 새 버킷 → 다시 통과해야 한다
    with patch("auth.permissions.datetime", _frozen_datetime(after)):
        check_quota(db, "user-kst", "crawl", 1)
        db.commit()

    keys = {c.key for c in db.query(RateLimitCounter).all() if "user-kst" in c.key}
    assert len(keys) == 2, f"KST 날짜로 버킷이 갈려야 한다: {keys}"
    assert f"user:user-kst:crawl:{before.strftime('%Y-%m-%d')}" in keys
    assert f"user:user-kst:crawl:{after.strftime('%Y-%m-%d')}" in keys


def test_check_quota_expires_at_next_kst_midnight(db):
    """카운터 수명은 리셋 기준(KST 자정)과 정합 — UTC 23:59(=KST 08:59) 만료 금지."""
    now_kst = datetime.now(ZoneInfo("Asia/Seoul")).replace(
        hour=12, minute=0, second=0, microsecond=0
    )
    with patch("auth.permissions.datetime", _frozen_datetime(now_kst)):
        check_quota(db, "user-exp", "export", 5)
        db.commit()

    counter = db.get(RateLimitCounter, f"user:user-exp:export:{now_kst.strftime('%Y-%m-%d')}")
    assert counter is not None
    expires_kst = counter.expires_at.replace(tzinfo=timezone.utc).astimezone(
        ZoneInfo("Asia/Seoul")
    )
    expected = now_kst.replace(hour=0) + timedelta(days=1)  # 다음 KST 자정
    assert expires_kst == expected
