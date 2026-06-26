"""get_approved_user 의 paid_until(유료 이용권) 게이트 + extend_paid_until 연장 헬퍼 테스트.

게이트 통과 = status=approved AND (무료 무기한 OR approved_until 유효 OR paid_until 유효).
무료 검증(approved_until=NULL, 무기한)과 유료 이용권(paid_until)은 독립 — 어느 하나만 유효해도 OK.
근거: V035 결제 시스템 PR1 (paid_until 컬럼 + 게이트 확장).

실행: python -m pytest tests/test_paid_until_gate.py -v
"""

from datetime import datetime, timedelta, timezone

from fastapi import HTTPException

from deps import get_approved_user
from services.subscription import extend_paid_until, revoke_paid_until


def _user(approved_until=None, paid_until=None, status="approved", email="expert@test.com"):
    """get_current_user 가 반환하는 dict 모사 (만료일은 isoformat 문자열 또는 None)."""
    return {
        "user_id": "expert-001",
        "email": email,
        "role": "expert",
        "status": status,
        "approved_until": approved_until,
        "paid_until": paid_until,
        "daily_crawl_quota": 5,
        "daily_export_quota": 10,
    }


def _future_iso(days=30):
    return (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()


def _past_iso(days=1):
    return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()


# ── 게이트 통과/차단 4 케이스 ──


def test_free_unlimited_passes():
    """무료 무기한 승인(approved_until=NULL, paid_until=NULL) → 통과 (기존 검증 중개사)."""
    result = get_approved_user(_user(approved_until=None, paid_until=None))
    assert result["user_id"] == "expert-001"


def test_paid_valid_passes():
    """유료 이용권 유효(paid_until 미래), 무료 무기한 아님(approved_until 과거) → 통과."""
    # approved_until 만료됐어도 paid_until 이 살아있으면 통과 (유료 전환 사용자)
    result = get_approved_user(_user(approved_until=_past_iso(), paid_until=_future_iso()))
    assert result["user_id"] == "expert-001"


def test_paid_expired_and_approved_expired_403():
    """유료 만료(paid_until 과거) AND 무료 기한부도 만료(approved_until 과거) → 403."""
    try:
        get_approved_user(_user(approved_until=_past_iso(), paid_until=_past_iso()))
        assert False, "둘 다 만료인데 통과함"
    except HTTPException as e:
        assert e.status_code == 403
        assert "만료" in e.detail


def test_paid_only_no_free_passes():
    """무료 이력 전혀 없고(approved_until=NULL=무기한) → 통과. paid_until 무관.

    ⚠ approved_until=NULL 은 '무기한 무료'라 통과. 이게 paid_until=NULL='유료 이력 없음'과
    의미가 정반대임을 박제 — paid_until=NULL 단독으로는 통과 근거가 아니다.
    """
    # paid_until 만 만료, approved_until=NULL(무기한 무료) → 무료 무기한으로 통과
    result = get_approved_user(_user(approved_until=None, paid_until=_past_iso()))
    assert result["user_id"] == "expert-001"


def test_paid_valid_but_pending_status_403():
    """status=pending 이면 paid_until 유효해도 403 (승인 먼저)."""
    try:
        get_approved_user(_user(status="pending", paid_until=_future_iso()))
        assert False, "pending 인데 통과함"
    except HTTPException as e:
        assert e.status_code == 403
        assert "승인" in e.detail


# ── extend_paid_until 연장 헬퍼 단위 (max 규칙) ──


def test_extend_first_payment_from_now():
    """첫 결제(current=None) → now + duration."""
    now = datetime(2026, 6, 24, tzinfo=timezone.utc)
    result = extend_paid_until(None, 30, now=now)
    assert result == datetime(2026, 7, 24, tzinfo=timezone.utc)


def test_extend_after_expiry_from_now():
    """만료 후 재결제(current 과거) → now 기준 시작 (만료된 기간 무시)."""
    now = datetime(2026, 6, 24, tzinfo=timezone.utc)
    expired = datetime(2026, 5, 1, tzinfo=timezone.utc)
    result = extend_paid_until(expired, 30, now=now)
    assert result == datetime(2026, 7, 24, tzinfo=timezone.utc)


def test_extend_before_expiry_accumulates():
    """만료 전 재결제(current 미래) → 남은 기간 끝에 이어붙임 (사용자 손해 없음)."""
    now = datetime(2026, 6, 24, tzinfo=timezone.utc)
    still_valid = datetime(2026, 7, 10, tzinfo=timezone.utc)  # 아직 16일 남음
    result = extend_paid_until(still_valid, 30, now=now)
    assert result == datetime(2026, 8, 9, tzinfo=timezone.utc)  # 7/10 + 30일


def test_extend_naive_current_defended():
    """naive current(offset 없음) → UTC aware 로 통일해 TypeError 안 남."""
    now = datetime(2026, 6, 24, tzinfo=timezone.utc)
    naive_future = datetime(2026, 7, 10)  # tzinfo 없음
    result = extend_paid_until(naive_future, 30, now=now)
    assert result == datetime(2026, 8, 9, tzinfo=timezone.utc)


def test_extend_returns_aware():
    """반환값은 항상 aware UTC (DB 저장·비교 시 naive/aware 혼선 방지)."""
    result = extend_paid_until(None, 365, now=datetime(2026, 1, 1, tzinfo=timezone.utc))
    assert result.tzinfo is not None
    assert result == datetime(2027, 1, 1, tzinfo=timezone.utc)


# ── revoke_paid_until 환불 롤백 헬퍼 단위 (extend 의 역함수) ──


def test_revoke_none_returns_none():
    """유료 이력 없음(current=None) → 환불할 것도 없어 None."""
    assert revoke_paid_until(None, 30, now=datetime(2026, 6, 24, tzinfo=timezone.utc)) is None


def test_revoke_subtracts_plan_days():
    """미래 만료에서 부여 일수만큼 차감 (다른 결제로 쌓인 기간 침범 안 함)."""
    now = datetime(2026, 6, 24, tzinfo=timezone.utc)
    # 60일 남음(두 결제분) 상태에서 30일 결제 1건 환불 → 30일 남음
    current = datetime(2026, 8, 23, tzinfo=timezone.utc)
    result = revoke_paid_until(current, 30, now=now)
    assert result == datetime(2026, 7, 24, tzinfo=timezone.utc)  # 8/23 − 30일


def test_revoke_clamps_to_now_when_consumed():
    """차감 결과가 now 이전(이미 다 쓴 기간)이면 now 로 클램프(즉시 만료)."""
    now = datetime(2026, 6, 24, tzinfo=timezone.utc)
    # 5일 남은 30일권을 환불 → 30일 빼면 과거라 now 로 막음
    current = datetime(2026, 6, 29, tzinfo=timezone.utc)
    result = revoke_paid_until(current, 30, now=now)
    assert result == now


def test_revoke_naive_current_defended():
    """naive current → UTC aware 통일해 TypeError 안 남."""
    now = datetime(2026, 6, 24, tzinfo=timezone.utc)
    naive_future = datetime(2026, 8, 23)  # tzinfo 없음
    result = revoke_paid_until(naive_future, 30, now=now)
    assert result == datetime(2026, 7, 24, tzinfo=timezone.utc)


def test_revoke_inverse_of_extend():
    """extend 후 revoke 하면 원래 시점(이력 없음 → now)으로 돌아온다."""
    now = datetime(2026, 6, 24, tzinfo=timezone.utc)
    extended = extend_paid_until(None, 30, now=now)  # now + 30일
    reverted = revoke_paid_until(extended, 30, now=now)  # − 30일 → now
    assert reverted == now
