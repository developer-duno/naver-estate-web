"""BillingKey 모델 회귀 테스트 — 빌링키 자동결제 PR1 (V036, 세션 327).

PR1 범위 = 테이블·ORM 모델만 (발급/결제/cron 은 PR2+). 본 테스트는 BillingKey 가
ORM 에 매핑되어 INSERT/SELECT 가능하고 컬럼·기본값이 마이그레이션과 일치함을 단언한다.
KPN 자동결제에 필수인 customer_name/phone 저장, status·retry_count 기본값을 가드.

실행: python -m pytest tests/test_billing_key_model.py -v
"""

from datetime import timedelta

from db.models import BillingKey
from utils import utcnow


def test_billing_key_insert_and_defaults(db):
    """정상 INSERT — 필수값만 넣으면 status='active', retry_count=0 기본값 적용."""
    bk = BillingKey(
        user_id="u1",
        billing_key="billing-key-abc123",
        plan="pro_30d",
    )
    db.add(bk)
    db.commit()

    row = db.query(BillingKey).filter(BillingKey.user_id == "u1").one()
    assert row.billing_key == "billing-key-abc123"
    assert row.plan == "pro_30d"
    # 기본값 가드 (마이그레이션 DEFAULT 와 일치 — 한쪽만 바뀌면 silent drift)
    assert row.status == "active"
    assert row.retry_count == 0
    # 선택 컬럼은 미입력 시 NULL
    assert row.card_name is None
    assert row.card_last4 is None
    assert row.next_charge_at is None
    # timestamps 자동 채움
    assert row.created_at is not None
    assert row.id is not None


def test_billing_key_kpn_customer_fields_persist(db):
    """KPN 빌링키 결제 필수 필드(customer_name/phone) 저장·조회 — PR2 자동결제가 재사용."""
    bk = BillingKey(
        user_id="u2",
        billing_key="bk-2",
        plan="pro_365d",
        card_name="신한카드",
        card_last4="1234",
        customer_name="홍길동",
        customer_phone="01012345678",
        next_charge_at=utcnow() + timedelta(days=30),
    )
    db.add(bk)
    db.commit()

    row = db.get(BillingKey, bk.id)
    assert row.customer_name == "홍길동"
    assert row.customer_phone == "01012345678"
    assert row.card_name == "신한카드"
    assert row.card_last4 == "1234"
    assert row.next_charge_at is not None


def test_billing_key_status_transition(db):
    """해지(deleted)·실패(failed) status 전이 — cron 이 active 만 집는 전제의 가드."""
    bk = BillingKey(user_id="u3", billing_key="bk-3", plan="pro_30d")
    db.add(bk)
    db.commit()

    # 해지
    bk.status = "deleted"
    db.commit()
    assert db.get(BillingKey, bk.id).status == "deleted"

    # 실패 재시도 누적
    bk.status = "failed"
    bk.retry_count = 3
    db.commit()
    refreshed = db.get(BillingKey, bk.id)
    assert refreshed.status == "failed"
    assert refreshed.retry_count == 3
