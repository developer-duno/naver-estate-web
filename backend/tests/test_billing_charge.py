"""빌링키 자동결제 cron 잡 테스트 (정기결제 PR3, 세션 330)

charge_due_billing_keys() 는 인자 없이 내부에서 SessionLocal() 을 호출한다. conftest 가
db.database 를 테스트 엔진으로 교체하므로 cron 잡도 테스트 DB 를 쓴다(test_env_collect 답습).
외부 결제 _pay_with_billing_key 는 @patch 로 mock(SDK 미설치·외부호출).

시나리오: 성공(연장+next_charge_at 갱신+retry 리셋) / 실패 재시도 / 3회 연속 실패 중단 /
대상없음(미래·is_default=false·status≠active 제외) / 금액불일치.

실행: python -m pytest tests/test_billing_charge.py -v
"""

from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import patch

from config.plans import PLAN_PRICES
from db.models import BillingKey, Payment, UserProfile
from utils import utcnow


def _make_profile(db, uid, paid_until=None):
    db.add(UserProfile(user_id=uid, email=f"{uid}@test.com", role="user",
                       status="approved", paid_until=paid_until))
    db.commit()


def _make_billing_key(db, uid, *, plan="pro_30d", status="active", is_default=True,
                      next_charge_at=None, retry_count=0):
    """next_charge_at 기본 = 과거(결제 대상). 미래로 주면 대상 제외 테스트."""
    bk = BillingKey(
        user_id=uid, billing_key=f"bk-{uid}", plan=plan,
        customer_name="홍길동", customer_phone="01012345678",
        status=status, is_default=is_default, retry_count=retry_count,
        next_charge_at=next_charge_at if next_charge_at is not None else utcnow() - timedelta(hours=1),
    )
    db.add(bk)
    db.commit()
    return bk


def _paid(amount):
    """_pay_with_billing_key mock 반환 — PAID + 금액 + 카드정보."""
    return SimpleNamespace(
        status="PAID", amount=SimpleNamespace(total=amount), id="tx",
        method=SimpleNamespace(card=SimpleNamespace(name="신한카드", number="111122******3456")),
    )


def _not_paid(status="FAILED"):
    return SimpleNamespace(status=status, amount=SimpleNamespace(total=10000), id="tx")


# ── 성공 ──


def test_due_billing_key_charged_and_extended(db):
    """결제 대상 빌링키 → PAID → paid_until 연장 + next_charge_at 갱신 + retry_count=0."""
    _make_profile(db, "u1")
    _make_billing_key(db, "u1")
    amount = PLAN_PRICES["pro_30d"]["amount"]
    with patch("crawler.billing_charge._pay_with_billing_key", return_value=_paid(amount)):
        from crawler.billing_charge import charge_due_billing_keys
        charge_due_billing_keys()
    db.expire_all()
    prof = db.get(UserProfile, "u1")
    # paid_until 설정됨(연장). ⚠ SQLite 는 tz 정보 미보존 → naive/aware 비교 불가
    # (timezone-consistency.md / feedback_orm_update_sqlite_naive_aware). 설정 여부만 검증,
    # 미래 시점 비교는 prod(PG TIMESTAMPTZ)에서만 유효하므로 테스트에선 None 아님만.
    assert prof.paid_until is not None
    bk = db.query(BillingKey).filter(BillingKey.user_id == "u1").one()
    assert bk.retry_count == 0 and bk.status == "active"
    # next_charge_at 이 paid_until(새 만료일)로 갱신됐는지 — 두 값이 같음(코드: bk.next_charge_at=paid_until)
    assert bk.next_charge_at == prof.paid_until
    # Payment paid 행 1건 기록
    assert db.query(Payment).filter(Payment.user_id == "u1", Payment.status == "paid").count() == 1


# ── 대상 제외 ──


def test_future_next_charge_not_charged(db):
    """next_charge_at 이 미래면 결제 안 함."""
    _make_profile(db, "u1")
    _make_billing_key(db, "u1", next_charge_at=utcnow() + timedelta(days=10))
    with patch("crawler.billing_charge._pay_with_billing_key") as mock_pay:
        from crawler.billing_charge import charge_due_billing_keys
        charge_due_billing_keys()
    mock_pay.assert_not_called()  # 결제 호출 0


def test_non_default_card_not_charged(db):
    """is_default=False 카드(보관만)는 자동결제 안 함."""
    _make_profile(db, "u1")
    _make_billing_key(db, "u1", is_default=False)
    with patch("crawler.billing_charge._pay_with_billing_key") as mock_pay:
        from crawler.billing_charge import charge_due_billing_keys
        charge_due_billing_keys()
    mock_pay.assert_not_called()


def test_deleted_card_not_charged(db):
    """status='deleted'(해지) 카드는 결제 안 함."""
    _make_profile(db, "u1")
    _make_billing_key(db, "u1", status="deleted")
    with patch("crawler.billing_charge._pay_with_billing_key") as mock_pay:
        from crawler.billing_charge import charge_due_billing_keys
        charge_due_billing_keys()
    mock_pay.assert_not_called()


# ── 실패 재시도 ──


def test_payment_fail_increments_retry(db):
    """결제 실패(status≠PAID) → retry_count++ (1회), status 유지, next_charge_at 그대로(다음날 재시도)."""
    _make_profile(db, "u1")
    bk = _make_billing_key(db, "u1", retry_count=0)
    original_due = bk.next_charge_at
    with patch("crawler.billing_charge._pay_with_billing_key", return_value=_not_paid("FAILED")):
        from crawler.billing_charge import charge_due_billing_keys
        charge_due_billing_keys()
    db.expire_all()
    bk = db.query(BillingKey).filter(BillingKey.user_id == "u1").one()
    assert bk.retry_count == 1 and bk.status == "active"
    assert bk.next_charge_at == original_due  # 미변경 → 다음 배치가 다시 집음
    # paid_until 미연장
    assert db.get(UserProfile, "u1").paid_until is None


def test_third_consecutive_fail_stops(db):
    """이미 2회 실패한 카드가 3회째 실패 → status='failed' 로 중단."""
    _make_profile(db, "u1")
    _make_billing_key(db, "u1", retry_count=2)  # 이번이 3회째
    with patch("crawler.billing_charge._pay_with_billing_key", return_value=_not_paid("FAILED")), \
         patch("crawler.billing_charge._alert_billing") as mock_alert:
        from crawler.billing_charge import charge_due_billing_keys
        charge_due_billing_keys()
    db.expire_all()
    bk = db.query(BillingKey).filter(BillingKey.user_id == "u1").one()
    assert bk.retry_count == 3 and bk.status == "failed"  # 중단
    mock_alert.assert_called_once()  # 알림 발사


def test_amount_mismatch_is_retry(db):
    """결제됐으나 금액 불일치(위변조) → retry 처리(즉시 중단 아님), paid_until 미연장."""
    _make_profile(db, "u1")
    _make_billing_key(db, "u1")
    with patch("crawler.billing_charge._pay_with_billing_key", return_value=_paid(10)):  # 기대 10000≠10
        from crawler.billing_charge import charge_due_billing_keys
        charge_due_billing_keys()
    db.expire_all()
    bk = db.query(BillingKey).filter(BillingKey.user_id == "u1").one()
    assert bk.retry_count == 1
    assert db.get(UserProfile, "u1").paid_until is None


# ── 격리 ──


def test_one_failure_does_not_block_others(db):
    """한 카드 결제 호출이 예외를 던져도 다른 카드는 정상 결제된다 (개별 try 격리)."""
    _make_profile(db, "u1")
    _make_profile(db, "u2")
    _make_billing_key(db, "u1")
    _make_billing_key(db, "u2")
    amount = PLAN_PRICES["pro_30d"]["amount"]

    def _pay_side_effect(payment_id, billing_key, *a):
        if billing_key == "bk-u1":
            raise RuntimeError("PortOne 일시 장애")
        return _paid(amount)

    with patch("crawler.billing_charge._pay_with_billing_key", side_effect=_pay_side_effect):
        from crawler.billing_charge import charge_due_billing_keys
        charge_due_billing_keys()
    db.expire_all()
    # u1 = 호출 실패 → retry, u2 = 정상 결제
    assert db.query(BillingKey).filter(BillingKey.user_id == "u1").one().retry_count == 1
    assert db.get(UserProfile, "u2").paid_until is not None
