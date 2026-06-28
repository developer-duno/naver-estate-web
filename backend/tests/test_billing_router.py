"""빌링키 자동결제 라우터 테스트 — /api/payment/billing/prepare, /register (정기결제 PR2, 세션 329)

PortOne SDK 는 미설치 환경 + 외부 호출이라 @patch 로 mock (test_payment_router.py 답습).
- prepare: issueId 생성 + customer 반환 / 검증 미완료 거부 / 잘못된 plan 거부
- register: 첫 결제 PAID → paid_until 연장 + BillingKey active+is_default / 금액불일치 거부 /
  정산지연 409 / 카드 여러 장 보관 시 기존 기본 카드 내림 / phone 없는 검증

실행: python -m pytest tests/test_billing_router.py -v
"""

from types import SimpleNamespace
from unittest.mock import patch

import jwt

from config.plans import PLAN_PRICES
from db.models import AgentVerification, BillingKey, Payment, UserProfile

JWT_SECRET = "test-secret-key-for-testing-only"

# PortOne env 를 billing 모듈이 import 한 payment 모듈 상수로 주입 (test_payment_router 답습).
_PORTONE_ENV = {
    "routers.payment.PORTONE_API_SECRET": "test-secret",
    "routers.payment.PORTONE_STORE_ID": "store-test",
    "routers.payment.PORTONE_CHANNEL_KEY": "channel-test",
    "routers.payment.PORTONE_WEBHOOK_SECRET": "whsec-test",
}


def _portone_env(**overrides):
    """PortOne 모듈 상수 patch — billing.py 는 payment 의 상수를 import 시점 바인딩하므로
    routers.payment 와 routers.billing 양쪽을 함께 patch (import 별칭 모두 갱신)."""
    env = {**_PORTONE_ENV, **overrides}
    payment_patch = patch.multiple(
        "routers.payment", **{k.split(".")[-1]: v for k, v in env.items()}
    )
    # billing.py 가 `from routers.payment import PORTONE_*` 로 별칭 바인딩한 상수도 갱신.
    billing_overrides = {
        k.split(".")[-1]: v for k, v in env.items()
        if k.split(".")[-1] in {"PORTONE_API_SECRET", "PORTONE_STORE_ID", "PORTONE_CHANNEL_KEY"}
    }
    billing_patch = patch.multiple("routers.billing", **billing_overrides)
    return _MultiPatch(payment_patch, billing_patch)


class _MultiPatch:
    """두 patch 컨텍스트를 한 with 로 묶는 헬퍼."""

    def __init__(self, *patches):
        self._patches = patches

    def __enter__(self):
        for p in self._patches:
            p.start()
        return self

    def __exit__(self, *exc):
        for p in reversed(self._patches):
            p.stop()
        return False


def _token(sub):
    return jwt.encode(
        {"sub": sub, "aud": "authenticated", "email": f"{sub}@test.com"},
        JWT_SECRET, algorithm="HS256",
    )


def _auth(sub):
    return {"Authorization": f"Bearer {_token(sub)}"}


def _make_profile(db, uid, paid_until=None):
    db.add(UserProfile(user_id=uid, email=f"{uid}@test.com", role="user",
                       status="approved", paid_until=paid_until))
    db.commit()


def _make_verification(db, uid, name="홍길동", phone: str | None = "01012345678"):
    db.add(AgentVerification(user_id=uid, representative_name=name, phone=phone,
                             verification_status="approved"))
    db.commit()


# ⚠ 실제 SDK 응답 모양 답습 (세션 333 결함 수정):
#   - pay_with_billing_key → PayWithBillingKeyResponse(payment=...) : status·amount 없음(pg_tx_id·paid_at 뿐).
#     실패 시 예외를 던지므로 성공 mock 은 단순 truthy 객체면 충분(반환값은 검증에 안 쓰임).
#   - 검증은 get_payment(_fetch_portone_payment) 재조회 객체로 한다 → status·amount·method 는 여기에.
def _charge_ok():
    """pay_with_billing_key 성공 mock — 실제 SDK 응답 모양(payment.pg_tx_id, status/amount 없음)."""
    return SimpleNamespace(payment=SimpleNamespace(pg_tx_id="tx-billing", paid_at="2026-06-29T00:00:00Z"))


def _fetched(status="PAID", amount=10000):
    """get_payment 재조회 mock — 검증 대상(status + amount.total + 카드정보)."""
    return SimpleNamespace(
        status=status, amount=SimpleNamespace(total=amount), id="tx-billing",
        method=SimpleNamespace(card=SimpleNamespace(name="신한카드", number="123456******1234")),
    )


# ── prepare ──


def test_billing_prepare_no_auth_401(client):
    """인증 없이 prepare → 401"""
    with _portone_env():
        assert client.post("/api/payment/billing/prepare", json={"plan": "pro_30d"}).status_code == 401


def test_billing_prepare_unknown_plan_400(client, db):
    """알 수 없는 plan → 400"""
    _make_profile(db, "u1")
    _make_verification(db, "u1")
    with _portone_env():
        res = client.post("/api/payment/billing/prepare", json={"plan": "nope"}, headers=_auth("u1"))
    assert res.status_code == 400


def test_billing_prepare_free_plan_400(client, db):
    """무료 플랜(basic_30d)은 PLAN_PRICES 부재 → prepare 400 (FE free 가드 + BE 이중 방어).

    basic_30d 는 PlanKey 타입엔 유효하나(types/payment.ts) PLAN_PRICES 엔 없는 무료체험 플랜.
    FE CheckoutButton 의 free 가드가 자동결제 버튼을 막지만, BE 도 plan 미존재로 거부함을 박제."""
    _make_profile(db, "u1")
    _make_verification(db, "u1")
    with _portone_env():
        res = client.post("/api/payment/billing/prepare",
                          json={"plan": "basic_30d"}, headers=_auth("u1"))
    assert res.status_code == 400


def test_billing_prepare_no_verification_400(client, db):
    """공인중개사 검증(대표자명) 없으면 → 400 (KPN customer.fullName 필수)."""
    _make_profile(db, "u1")  # AgentVerification 없음
    with _portone_env():
        res = client.post("/api/payment/billing/prepare", json={"plan": "pro_30d"}, headers=_auth("u1"))
    assert res.status_code == 400


def test_billing_prepare_ok(client, db):
    """정상 prepare → issueId(영숫자 32byte) + storeId/channelKey + customer 반환."""
    _make_profile(db, "u1")
    _make_verification(db, "u1", name="김중개", phone="01099998888")
    with _portone_env():
        res = client.post("/api/payment/billing/prepare", json={"plan": "pro_30d"}, headers=_auth("u1"))
    assert res.status_code == 200
    data = res.json()
    assert data["issueId"].startswith("i")
    assert data["issueId"].isalnum() and len(data["issueId"].encode()) <= 32
    assert data["storeId"] == "store-test"
    assert data["channelKey"] == "channel-test"
    assert data["customer"] == {"name": "김중개", "phone": "01099998888"}


# ── register ──


def test_billing_register_first_payment_ok(client, db):
    """register 첫 결제 PAID → paid_until 연장 + BillingKey active·is_default + next_charge_at."""
    _make_profile(db, "u1")
    _make_verification(db, "u1")
    amount = PLAN_PRICES["pro_30d"]["amount"]
    with _portone_env(), \
            patch("routers.billing._pay_with_billing_key", return_value=_charge_ok()), \
            patch("routers.billing._fetch_portone_payment", return_value=_fetched(amount=amount)):
        res = client.post("/api/payment/billing/register",
                          json={"billing_key": "bk-1", "plan": "pro_30d"}, headers=_auth("u1"))
    assert res.status_code == 200
    assert res.json()["billing_registered"] is True
    assert res.json()["paid_until"] is not None
    db.expire_all()
    # paid_until 연장
    assert db.get(UserProfile, "u1").paid_until is not None
    # BillingKey 저장 (active·is_default·카드정보·next_charge_at)
    bk = db.query(BillingKey).filter(BillingKey.user_id == "u1").one()
    assert bk.status == "active" and bk.is_default is True
    assert bk.billing_key == "bk-1" and bk.plan == "pro_30d"
    assert bk.card_name == "신한카드" and bk.card_last4 == "1234"
    assert bk.customer_name == "홍길동"
    assert bk.next_charge_at is not None


def test_billing_register_amount_mismatch_400(client, db):
    """첫 결제 금액 불일치(위변조) → 400, BillingKey 미저장 + Payment failed."""
    _make_profile(db, "u1")
    _make_verification(db, "u1")
    with _portone_env(), \
            patch("routers.billing._pay_with_billing_key", return_value=_charge_ok()), \
            patch("routers.billing._fetch_portone_payment",
                  return_value=_fetched(amount=10)):  # 재조회 금액 10 ≠ 기대 10000
        res = client.post("/api/payment/billing/register",
                          json={"billing_key": "bk-bad", "plan": "pro_30d"}, headers=_auth("u1"))
    assert res.status_code == 400
    db.expire_all()
    assert db.query(BillingKey).filter(BillingKey.user_id == "u1").count() == 0
    assert db.get(UserProfile, "u1").paid_until is None


def test_billing_register_pending_409(client, db):
    """첫 결제 status≠PAID(정산 지연) → 409, BillingKey 미저장."""
    _make_profile(db, "u1")
    _make_verification(db, "u1")
    with _portone_env(), \
            patch("routers.billing._pay_with_billing_key", return_value=_charge_ok()), \
            patch("routers.billing._fetch_portone_payment",
                  return_value=_fetched(status="READY")):  # 재조회 PAID 아님 = 정산 지연
        res = client.post("/api/payment/billing/register",
                          json={"billing_key": "bk-p", "plan": "pro_30d"}, headers=_auth("u1"))
    assert res.status_code == 409
    db.expire_all()
    assert db.query(BillingKey).filter(BillingKey.user_id == "u1").count() == 0


def test_billing_register_charge_raises_400(client, db):
    """첫 결제 호출 자체 실패(SDK 예외 — 승인거절 등) → 400, BillingKey/paid_until 미반영.

    실제 SDK pay_with_billing_key 는 실패 시 타입드 예외(PgProviderError 등)를 던진다 —
    예외 계약 회귀 가드(세션 333). 예외면 결제 자체가 안 됐으므로 등록 거부."""
    _make_profile(db, "u1")
    _make_verification(db, "u1")
    with _portone_env(), \
            patch("routers.billing._pay_with_billing_key",
                  side_effect=RuntimeError("PG 승인 거절")):
        res = client.post("/api/payment/billing/register",
                          json={"billing_key": "bk-decline", "plan": "pro_30d"}, headers=_auth("u1"))
    assert res.status_code == 400
    db.expire_all()
    assert db.query(BillingKey).filter(BillingKey.user_id == "u1").count() == 0
    assert db.get(UserProfile, "u1").paid_until is None


def test_billing_register_replaces_default(client, db):
    """카드 여러 장 보관 — 새 카드 등록 시 기존 기본 카드를 is_default=False 로 내림."""
    _make_profile(db, "u1")
    _make_verification(db, "u1")
    # 기존 기본 카드 1장 시드
    db.add(BillingKey(user_id="u1", billing_key="bk-old", plan="pro_30d",
                      customer_name="홍길동", status="active", is_default=True))
    db.commit()
    amount = PLAN_PRICES["pro_30d"]["amount"]
    with _portone_env(), \
            patch("routers.billing._pay_with_billing_key", return_value=_charge_ok()), \
            patch("routers.billing._fetch_portone_payment", return_value=_fetched(amount=amount)):
        res = client.post("/api/payment/billing/register",
                          json={"billing_key": "bk-new", "plan": "pro_30d"}, headers=_auth("u1"))
    assert res.status_code == 200
    db.expire_all()
    # 두 카드 모두 보관(active), 기본은 신규 1장만
    cards = db.query(BillingKey).filter(BillingKey.user_id == "u1").all()
    assert len(cards) == 2
    defaults = [c for c in cards if c.is_default]
    assert len(defaults) == 1 and defaults[0].billing_key == "bk-new"
    old = next(c for c in cards if c.billing_key == "bk-old")
    assert old.status == "active" and old.is_default is False  # 보관되되 기본 아님


def test_billing_register_no_phone_ok(client, db):
    """phone 없는 검증자도 등록 가능 (KPN phone 선택 — full 이름만 필수)."""
    _make_profile(db, "u1")
    _make_verification(db, "u1", name="무전화", phone=None)
    amount = PLAN_PRICES["pro_30d"]["amount"]
    with _portone_env(), \
            patch("routers.billing._pay_with_billing_key", return_value=_charge_ok()), \
            patch("routers.billing._fetch_portone_payment", return_value=_fetched(amount=amount)):
        res = client.post("/api/payment/billing/register",
                          json={"billing_key": "bk-np", "plan": "pro_30d"}, headers=_auth("u1"))
    assert res.status_code == 200
    db.expire_all()
    bk = db.query(BillingKey).filter(BillingKey.user_id == "u1").one()
    assert bk.customer_phone is None


def test_billing_register_free_plan_400_no_side_effect(client, db):
    """무료 플랜(basic_30d) register → 400 + BillingKey/Payment 미저장 + paid_until None.

    plan 검증(billing.py:178-180)이 _pay_with_billing_key·db.add(Payment) 보다 먼저라
    mock 불필요 — 결제·INSERT 전에 즉시 400. 오염 행이 billing_keys 에 유입되는 경로 봉쇄."""
    _make_profile(db, "u1")
    _make_verification(db, "u1")
    with _portone_env():
        res = client.post("/api/payment/billing/register",
                          json={"billing_key": "bk-free", "plan": "basic_30d"},
                          headers=_auth("u1"))
    assert res.status_code == 400
    db.expire_all()
    assert db.query(BillingKey).filter(BillingKey.user_id == "u1").count() == 0
    assert db.query(Payment).filter(Payment.user_id == "u1").count() == 0
    assert db.get(UserProfile, "u1").paid_until is None


# ── PR4: 해지 + 목록 조회 ──


def _seed_billing_key(db, uid, *, billing_key="bk-x", status="active", is_default=True):
    bk = BillingKey(user_id=uid, billing_key=billing_key, plan="pro_30d",
                    card_name="신한카드", card_last4="1234", customer_name="홍길동",
                    status=status, is_default=is_default)
    db.add(bk)
    db.commit()
    return bk


def test_list_billing_keys_active_only(client, db):
    """목록 조회 — active 카드만(deleted 제외), 기본 카드 먼저."""
    _make_profile(db, "u1")
    _seed_billing_key(db, "u1", billing_key="bk-1", is_default=True)
    _seed_billing_key(db, "u1", billing_key="bk-2", is_default=False)
    _seed_billing_key(db, "u1", billing_key="bk-del", status="deleted", is_default=False)
    res = client.get("/api/payment/billing/list", headers=_auth("u1"))
    assert res.status_code == 200
    cards = res.json()["cards"]
    assert len(cards) == 2  # deleted 제외
    assert cards[0]["is_default"] is True  # 기본 먼저
    assert cards[0]["card_last4"] == "1234"


def test_cancel_billing_key_deletes(client, db):
    """해지 → PortOne 삭제 호출 + status='deleted' + is_default=False."""
    _make_profile(db, "u1")
    bk = _seed_billing_key(db, "u1")
    with _portone_env(), patch("routers.billing._delete_portone_billing_key") as mock_del:
        res = client.post("/api/payment/billing/cancel",
                          json={"billing_key_id": bk.id}, headers=_auth("u1"))
    assert res.status_code == 200 and res.json()["cancelled"] is True
    mock_del.assert_called_once()
    db.expire_all()
    got = db.get(BillingKey, bk.id)
    assert got.status == "deleted" and got.is_default is False


def test_cancel_portone_fail_still_deletes_in_db(client, db):
    """PortOne 삭제 실패해도 DB 는 deleted 로 차단(사용자 불이익 방지)."""
    _make_profile(db, "u1")
    bk = _seed_billing_key(db, "u1")
    with _portone_env(), patch("routers.billing._delete_portone_billing_key",
                               side_effect=RuntimeError("PortOne 장애")):
        res = client.post("/api/payment/billing/cancel",
                          json={"billing_key_id": bk.id}, headers=_auth("u1"))
    assert res.status_code == 200
    db.expire_all()
    assert db.get(BillingKey, bk.id).status == "deleted"  # 외부 실패에도 DB 차단


def test_cancel_other_user_card_404(client, db):
    """타인 카드 해지 시도 → 404 (본인 소유만)."""
    _make_profile(db, "u1")
    _make_profile(db, "u2")
    bk = _seed_billing_key(db, "u2")
    with _portone_env():
        res = client.post("/api/payment/billing/cancel",
                          json={"billing_key_id": bk.id}, headers=_auth("u1"))
    assert res.status_code == 404
    db.expire_all()
    assert db.get(BillingKey, bk.id).status == "active"  # 변경 안 됨


def test_cancel_already_deleted_idempotent(client, db):
    """이미 해지된 카드 재해지 → 멱등 no-op."""
    _make_profile(db, "u1")
    bk = _seed_billing_key(db, "u1", status="deleted", is_default=False)
    with _portone_env(), patch("routers.billing._delete_portone_billing_key") as mock_del:
        res = client.post("/api/payment/billing/cancel",
                          json={"billing_key_id": bk.id}, headers=_auth("u1"))
    assert res.status_code == 200 and res.json()["already"] is True
    mock_del.assert_not_called()  # 이미 deleted 라 PortOne 호출 0
