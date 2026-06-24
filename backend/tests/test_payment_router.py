"""결제 라우터 테스트 — /api/payment/prepare, /complete, /webhook (결제 PR3, 세션 321)

PortOne SDK 는 미설치 환경 + 외부 호출이라 @patch 로 mock.
- prepare: 금액 서버결정 (FE 금액 무시), 잘못된 plan 거부
- complete: PAID·금액일치 → paid_until 연장 / 금액불일치·미PAID 거부 / 멱등 재호출
- webhook: 서명검증 실패 거부 / Transaction.Paid 이용권 부여 / 멱등

실행: python -m pytest tests/test_payment_router.py -v
"""

from types import SimpleNamespace
from unittest.mock import patch

import jwt

from config.plans import PLAN_PRICES
from db.models import Payment, UserProfile

JWT_SECRET = "test-secret-key-for-testing-only"

# PortOne env 를 모듈 상수로 주입 — 모든 결제 테스트에 적용 (decorator stack)
_PORTONE_ENV = {
    "routers.payment.PORTONE_API_SECRET": "test-secret",
    "routers.payment.PORTONE_STORE_ID": "store-test",
    "routers.payment.PORTONE_CHANNEL_KEY": "channel-test",
    "routers.payment.PORTONE_WEBHOOK_SECRET": "whsec-test",
}


def _portone_env(**overrides):
    """PortOne 모듈 상수 patch 컨텍스트 (overrides 로 일부 비활성 가능)."""
    env = {**_PORTONE_ENV, **overrides}
    return patch.multiple("routers.payment", **{k.split(".")[-1]: v for k, v in env.items()})


def _token(sub):
    return jwt.encode(
        {"sub": sub, "aud": "authenticated", "email": f"{sub}@test.com"},
        JWT_SECRET, algorithm="HS256",
    )


def _auth(sub):
    return {"Authorization": f"Bearer {_token(sub)}"}


def _make_profile(db, uid, paid_until=None):
    p = UserProfile(user_id=uid, email=f"{uid}@test.com", role="user",
                    status="approved", paid_until=paid_until)
    db.add(p)
    db.commit()
    return p


def _paid_portone(amount):
    """PortOne get_payment mock 반환 — status=PAID + amount.total."""
    return SimpleNamespace(status="PAID", amount=SimpleNamespace(total=amount), id="tx-1")


# ── prepare ──


def test_prepare_no_auth_401(client):
    """인증 없이 prepare → 401"""
    with _portone_env():
        assert client.post("/api/payment/prepare", json={"plan": "basic_30d"}).status_code == 401


def test_prepare_unknown_plan_400(client, db):
    """알 수 없는 plan → 400"""
    _make_profile(db, "u1")
    with _portone_env():
        res = client.post("/api/payment/prepare", json={"plan": "nope"}, headers=_auth("u1"))
    assert res.status_code == 400


def test_prepare_no_portone_config_503(client, db):
    """PortOne env 미설정 → 503"""
    _make_profile(db, "u1")
    with _portone_env(**{"routers.payment.PORTONE_API_SECRET": ""}):
        res = client.post("/api/payment/prepare", json={"plan": "basic_30d"}, headers=_auth("u1"))
    assert res.status_code == 503


def test_prepare_amount_server_decided(client, db):
    """정상 prepare → payments(ready) 생성 + 금액은 서버(PLAN_PRICES)가 결정."""
    _make_profile(db, "u1")
    with _portone_env():
        res = client.post("/api/payment/prepare", json={"plan": "basic_30d"}, headers=_auth("u1"))
    assert res.status_code == 200
    data = res.json()
    assert data["amount"] == PLAN_PRICES["basic_30d"]["amount"]  # 서버 결정값
    assert data["storeId"] == "store-test"
    assert data["channelKey"] == "channel-test"
    assert data["paymentId"].startswith("pay_")
    # DB 에 ready 행 생성 확인
    row = db.get(Payment, data["paymentId"])
    assert row is not None and row.status == "ready"
    assert row.amount == PLAN_PRICES["basic_30d"]["amount"]


# ── complete ──


def _seed_payment(db, payment_id, uid, plan="basic_30d", status="ready"):
    db.add(Payment(payment_id=payment_id, user_id=uid, plan=plan,
                   amount=PLAN_PRICES[plan]["amount"], status=status))
    db.commit()


def test_complete_paid_extends_paid_until(client, db):
    """complete PAID·금액일치 → paid_until 연장 + payments.status=paid."""
    _make_profile(db, "u1")
    _seed_payment(db, "pay_ok", "u1")
    amount = PLAN_PRICES["basic_30d"]["amount"]
    with _portone_env(), patch("routers.payment._fetch_portone_payment",
                               return_value=_paid_portone(amount)):
        res = client.post("/api/payment/complete", json={"payment_id": "pay_ok"},
                          headers=_auth("u1"))
    assert res.status_code == 200
    assert res.json()["paid_until"] is not None
    assert res.json()["already_paid"] is False
    db.expire_all()
    assert db.get(Payment, "pay_ok").status == "paid"
    assert db.get(UserProfile, "u1").paid_until is not None


def test_complete_amount_mismatch_400(client, db):
    """결제 금액 불일치(위변조) → 400 거부, 이용권 미부여."""
    _make_profile(db, "u1")
    _seed_payment(db, "pay_bad", "u1")
    with _portone_env(), patch("routers.payment._fetch_portone_payment",
                               return_value=_paid_portone(10)):  # 기대 49000 ≠ 10
        res = client.post("/api/payment/complete", json={"payment_id": "pay_bad"},
                          headers=_auth("u1"))
    assert res.status_code == 400
    db.expire_all()
    assert db.get(UserProfile, "u1").paid_until is None
    assert db.get(Payment, "pay_bad").status == "failed"


def test_complete_not_paid_400(client, db):
    """PortOne status≠PAID → 400 거부."""
    _make_profile(db, "u1")
    _seed_payment(db, "pay_pending", "u1")
    not_paid = SimpleNamespace(status="READY", amount=SimpleNamespace(total=49000), id="tx")
    with _portone_env(), patch("routers.payment._fetch_portone_payment", return_value=not_paid):
        res = client.post("/api/payment/complete", json={"payment_id": "pay_pending"},
                          headers=_auth("u1"))
    assert res.status_code == 400


def test_complete_idempotent(client, db):
    """이미 paid 면 멱등 — 재연장 거부 (already_paid=True)."""
    _make_profile(db, "u1")
    _seed_payment(db, "pay_done", "u1", status="paid")
    # 이미 paid 면 get_payment 호출조차 안 해야 함 — patch 로 호출 시 실패 유도
    with _portone_env(), patch("routers.payment._fetch_portone_payment",
                               side_effect=AssertionError("get_payment 호출되면 안 됨")):
        res = client.post("/api/payment/complete", json={"payment_id": "pay_done"},
                          headers=_auth("u1"))
    assert res.status_code == 200
    assert res.json()["already_paid"] is True


def test_complete_other_user_404(client, db):
    """남의 결제 건 complete → 404 (본인 소유 검증)."""
    _make_profile(db, "u1")
    _make_profile(db, "u2")
    _seed_payment(db, "pay_u2", "u2")
    with _portone_env():
        res = client.post("/api/payment/complete", json={"payment_id": "pay_u2"},
                          headers=_auth("u1"))
    assert res.status_code == 404


def test_complete_cache_invalidated(client, db):
    """complete 성공 시 게이트 캐시(profile:{uid}) 무효화."""
    _make_profile(db, "u1")
    _seed_payment(db, "pay_cache", "u1")
    amount = PLAN_PRICES["basic_30d"]["amount"]
    with _portone_env(), patch("routers.payment._fetch_portone_payment",
                               return_value=_paid_portone(amount)), \
         patch("routers.payment._user_cache.delete") as mock_del:
        client.post("/api/payment/complete", json={"payment_id": "pay_cache"},
                    headers=_auth("u1"))
    mock_del.assert_called_once_with("profile:u1")


# ── webhook ──


def _webhook_obj(payment_id):
    return SimpleNamespace(type="Transaction.Paid",
                           data=SimpleNamespace(payment_id=payment_id))


def test_webhook_bad_signature_400(client, db):
    """웹훅 서명 검증 실패 → 400."""
    _seed_payment(db, "pay_wh", "u1")
    with _portone_env(), patch("routers.payment._verify_webhook",
                               side_effect=Exception("bad sig")):
        res = client.post("/api/payment/webhook", content=b'{"x":1}',
                          headers={"webhook-signature": "v1,bad"})
    assert res.status_code == 400


def test_webhook_paid_grants(client, db):
    """Transaction.Paid 웹훅 → get_payment 재확인 후 이용권 부여."""
    _make_profile(db, "u1")
    _seed_payment(db, "pay_wh2", "u1")
    amount = PLAN_PRICES["basic_30d"]["amount"]
    with _portone_env(), \
         patch("routers.payment._verify_webhook", return_value=_webhook_obj("pay_wh2")), \
         patch("routers.payment._fetch_portone_payment", return_value=_paid_portone(amount)):
        res = client.post("/api/payment/webhook", content=b'{"any":1}',
                          headers={"webhook-signature": "v1,ok"})
    assert res.status_code == 200
    assert res.json().get("granted") is True
    db.expire_all()
    assert db.get(UserProfile, "u1").paid_until is not None


def test_webhook_idempotent(client, db):
    """이미 paid 인 결제 웹훅 → 멱등 (재부여 안 함)."""
    _make_profile(db, "u1")
    _seed_payment(db, "pay_wh3", "u1", status="paid")
    with _portone_env(), \
         patch("routers.payment._verify_webhook", return_value=_webhook_obj("pay_wh3")), \
         patch("routers.payment._fetch_portone_payment",
               side_effect=AssertionError("이미 paid 면 get_payment 호출 금지")):
        res = client.post("/api/payment/webhook", content=b'{"any":1}',
                          headers={"webhook-signature": "v1,ok"})
    assert res.status_code == 200
    assert res.json().get("already_paid") is True


def test_webhook_unknown_payment_ignored(client):
    """미존재 결제 웹훅 → 무시(200, 부여 안 함)."""
    with _portone_env(), \
         patch("routers.payment._verify_webhook", return_value=_webhook_obj("pay_ghost")):
        res = client.post("/api/payment/webhook", content=b'{"any":1}',
                          headers={"webhook-signature": "v1,ok"})
    assert res.status_code == 200
    assert res.json().get("skipped") == "unknown_payment"
