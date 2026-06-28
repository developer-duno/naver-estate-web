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


# ⚠ 실제 SDK 응답 모양 답습 (세션 333 결함 수정):
#   pay_with_billing_key 응답엔 status·amount 가 없다(payment.pg_tx_id·paid_at 뿐) — 성공 시
#   단순 truthy, 실패 시 예외. PAID·금액 검증은 get_payment(_fetch_portone_payment) 재조회로.
def _charge_ok():
    """pay_with_billing_key 성공 mock — 실제 SDK 모양(status/amount 없음)."""
    return SimpleNamespace(payment=SimpleNamespace(pg_tx_id="tx", paid_at="2026-06-29T00:00:00Z"))


def _fetched(status="PAID", amount=10000):
    """get_payment 재조회 mock — 검증 대상(status + amount.total + 카드정보)."""
    return SimpleNamespace(
        status=status, amount=SimpleNamespace(total=amount), id="tx",
        method=SimpleNamespace(card=SimpleNamespace(name="신한카드", number="111122******3456")),
    )


# ── 성공 ──


def test_due_billing_key_charged_and_extended(db):
    """결제 대상 빌링키 → PAID → paid_until 연장 + next_charge_at 갱신 + retry_count=0."""
    _make_profile(db, "u1")
    _make_billing_key(db, "u1")
    amount = PLAN_PRICES["pro_30d"]["amount"]
    with patch("crawler.billing_charge._pay_with_billing_key", return_value=_charge_ok()), \
         patch("crawler.billing_charge._fetch_portone_payment", return_value=_fetched(amount=amount)):
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
    with patch("crawler.billing_charge._pay_with_billing_key", return_value=_charge_ok()), \
         patch("crawler.billing_charge._fetch_portone_payment", return_value=_fetched(status="FAILED")):
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
    with patch("crawler.billing_charge._pay_with_billing_key", return_value=_charge_ok()), \
         patch("crawler.billing_charge._fetch_portone_payment", return_value=_fetched(status="FAILED")), \
         patch("crawler.billing_charge._alert_billing") as mock_alert:
        from crawler.billing_charge import charge_due_billing_keys
        charge_due_billing_keys()
    db.expire_all()
    bk = db.query(BillingKey).filter(BillingKey.user_id == "u1").one()
    assert bk.retry_count == 3 and bk.status == "failed"  # 중단
    mock_alert.assert_called_once()  # 알림 발사


def test_amount_mismatch_stops_immediately(db):
    """금액 불일치(위변조) → 즉시 영구중단(status='failed') + 알림. retry 무한반복 금지.

    적대검증 #2: 금액불일치를 retry 로 두면 환불 없이 매일 재출금. payment.py
    PermanentGrantError 정책대로 즉시 중단으로 정정(결함 박제 테스트 정정, testing.md).
    """
    _make_profile(db, "u1")
    _make_billing_key(db, "u1")
    with patch("crawler.billing_charge._pay_with_billing_key", return_value=_charge_ok()), \
         patch("crawler.billing_charge._fetch_portone_payment", return_value=_fetched(amount=10)), \
         patch("crawler.billing_charge._alert_billing") as mock_alert:  # 재조회 금액 10 ≠ 기대 10000
        from crawler.billing_charge import charge_due_billing_keys
        charge_due_billing_keys()
    db.expire_all()
    bk = db.query(BillingKey).filter(BillingKey.user_id == "u1").one()
    assert bk.status == "failed"  # 즉시 중단 (retry 아님)
    assert db.get(UserProfile, "u1").paid_until is None
    mock_alert.assert_called_once()


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
        return _charge_ok()

    with patch("crawler.billing_charge._pay_with_billing_key", side_effect=_pay_side_effect), \
         patch("crawler.billing_charge._fetch_portone_payment", return_value=_fetched(amount=amount)):
        from crawler.billing_charge import charge_due_billing_keys
        charge_due_billing_keys()
    db.expire_all()
    # u1 = 호출 실패 → retry, u2 = 정상 결제
    assert db.query(BillingKey).filter(BillingKey.user_id == "u1").one().retry_count == 1
    assert db.get(UserProfile, "u2").paid_until is not None


# ── 적대검증 결함 수정 회귀 (세션 330) ──


def test_deterministic_payment_id_same_charge_cycle(db):
    """#1 멱등키: 같은 빌링키·같은 next_charge_at 이면 payment_id 가 항상 동일(PortOne dedup).

    payment_id 가 매번 uuid 면 commit 실패 후 재배치가 새 id 로 재출금 → 이중출금.
    bk.id+next_charge_at epoch 로 결정적 생성해 PortOne 이 같은 결제로 dedup 하게 한다.
    """
    from crawler.billing_charge import _billing_payment_id
    _make_profile(db, "u1")
    bk = _make_billing_key(db, "u1")
    pid1 = _billing_payment_id(bk)
    pid2 = _billing_payment_id(bk)
    assert pid1 == pid2  # 결정적 (재시도 시 동일)
    assert pid1.startswith("b") and pid1.isalnum() and len(pid1.encode()) <= 32  # KPN 제약


def test_already_paid_cycle_no_recharge(db):
    """#1 자기복구: 같은 청구 건이 이미 paid(직전 commit 실패로 DB만 롤백)면 재출금 안 하고 동기화만."""
    from crawler.billing_charge import _billing_payment_id, charge_due_billing_keys
    _make_profile(db, "u1")
    bk = _make_billing_key(db, "u1")
    amount = PLAN_PRICES["pro_30d"]["amount"]
    # PortOne 출금은 됐는데 DB 만 롤백된 상태 모사 — 그 청구 건 Payment 를 paid 로 미리 심는다.
    db.add(Payment(payment_id=_billing_payment_id(bk), user_id="u1", plan="pro_30d",
                   amount=amount, status="paid"))
    db.commit()
    with patch("crawler.billing_charge._pay_with_billing_key") as mock_pay:
        charge_due_billing_keys()
    mock_pay.assert_not_called()  # 재출금 0 (이미 paid 라 동기화만)
    db.expire_all()
    assert db.get(UserProfile, "u1").paid_until is not None  # paid_until 은 복구


def test_toctou_card_downgraded_before_charge_skipped(db):
    """#3 TOCTOU: due 스냅샷 후 결제 직전 is_default=False 로 강등된 카드는 결제 스킵.

    _charge_one 이 db.refresh 로 fresh 재확인 — 배치 중 register 카드교체가 stale 결제를 막는다.
    """
    from crawler.billing_charge import _charge_one
    _make_profile(db, "u1")
    bk = _make_billing_key(db, "u1")
    # 결제 직전 다른 경로(register)가 이 카드를 강등했다고 가정 — DB 직접 변경 후 refresh 로 감지.
    db.query(BillingKey).filter(BillingKey.id == bk.id).update({"is_default": False})
    db.commit()
    with patch("crawler.billing_charge._pay_with_billing_key") as mock_pay:
        result = _charge_one(db, bk)
    assert result == "skipped"
    mock_pay.assert_not_called()  # 강등된 카드 결제 0


def test_billing_charge_records_crawljob(db):
    """#4 관찰성: 배치가 CrawlJob 을 기록해 monitor 가 결제 결과를 본다."""
    from db.models import CrawlJob
    _make_profile(db, "u1")
    _make_billing_key(db, "u1")
    amount = PLAN_PRICES["pro_30d"]["amount"]
    with patch("crawler.billing_charge._pay_with_billing_key", return_value=_charge_ok()), \
         patch("crawler.billing_charge._fetch_portone_payment", return_value=_fetched(amount=amount)):
        from crawler.billing_charge import charge_due_billing_keys
        charge_due_billing_keys(scheduler_job_id="billing_charge")
    db.expire_all()
    job = db.query(CrawlJob).filter(CrawlJob.job_type == "billing_charge").one()
    assert job.status == "completed" and job.total_items == 1 and job.processed_items == 1


def test_third_fail_notifies_user_email(db):
    """#6: 3회째 실패로 중단 시 당사자(공인중개사)에게 이메일 알림 발송 (운영자 텔레그램과 별도)."""
    _make_profile(db, "u1")
    _make_billing_key(db, "u1", retry_count=2)  # 이번이 3회째
    with patch("crawler.billing_charge._pay_with_billing_key", return_value=_charge_ok()), \
         patch("crawler.billing_charge._fetch_portone_payment", return_value=_fetched(status="FAILED")), \
         patch("crawler.billing_charge._alert_billing"), \
         patch("services.email.send_email") as mock_email:
        from crawler.billing_charge import charge_due_billing_keys
        charge_due_billing_keys()
    mock_email.assert_called_once()  # 사용자 이메일 발송
    assert mock_email.call_args[0][0] == "u1@test.com"  # profile.email 로
