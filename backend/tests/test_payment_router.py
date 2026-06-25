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


def test_complete_pending_is_transient_409_keeps_ready(client, db):
    """PortOne status≠PAID(정산 지연) → 일시 실패 409. payment 행은 'ready' 유지(failed 아님).

    ⚠ 결함 박제 테스트 정정 (testing.md §결함 수정): 기존 test_complete_not_paid_400 은
    일시 PENDING 을 영구 실패와 같은 400+failed 로 뭉갰다(finding #10). 일시 실패는 재시도·webhook
    으로 복구 가능해야 하므로 409 + status='ready' 유지로 정정. PortOne 정산지연 PENDING 명세 근거.
    """
    _make_profile(db, "u1")
    _seed_payment(db, "pay_pending", "u1")
    not_paid = SimpleNamespace(status="READY", amount=SimpleNamespace(total=49000), id="tx")
    with _portone_env(), patch("routers.payment._fetch_portone_payment", return_value=not_paid):
        res = client.post("/api/payment/complete", json={"payment_id": "pay_pending"},
                          headers=_auth("u1"))
    assert res.status_code == 409
    db.expire_all()
    # 일시 실패는 failed 로 박지 않는다 — webhook·재시도로 복구 가능해야 함
    assert db.get(Payment, "pay_pending").status == "ready"
    assert db.get(UserProfile, "u1").paid_until is None


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


# ── 동시성·멱등성 회귀 (적대 리뷰 #2·#3·#4·#8·#11 — TOCTOU 이중부여 차단) ──


def test_grant_subscription_double_call_extends_once(db):
    """이중 grant 차단 (#2·#3): 같은 payment 에 _grant_subscription 두 번 호출 →
    첫 호출만 paid_until 연장(1회분 30일), 두 번째는 compare-and-set 선점 실패로 no-op.

    SQLite 단일 세션 순차 호출로 compare-and-set 멱등 로직을 검증한다. 진짜 동시 contention
    은 SQLite 로 재현 불가하나, rowcount 게이트(ready→paid 원자 선점) 자체는 검증된다.
    """
    from routers.payment import _grant_subscription

    profile = _make_profile(db, "u1")
    _seed_payment(db, "pay_dbl", "u1")
    amount = PLAN_PRICES["basic_30d"]["amount"]
    portone = _paid_portone(amount)

    # 1차 — 선점 성공 → paid_until 연장
    p1 = _grant_subscription(db, db.get(Payment, "pay_dbl"), portone)
    db.commit()
    assert p1 is not None
    first_paid_until = db.get(UserProfile, "u1").paid_until
    assert first_paid_until is not None

    # 2차 — 같은 payment 재호출 (이미 paid → 빠른 경로 또는 선점 실패) → no-op
    db.expire_all()
    p2 = _grant_subscription(db, db.get(Payment, "pay_dbl"), portone)
    db.commit()
    assert p2 is None  # 멱등 no-op — 재연장 안 함
    db.expire_all()
    # paid_until 이 30일 1회분만 — 두 번 더해 60일(이중부여)이 아님
    assert db.get(UserProfile, "u1").paid_until == first_paid_until
    assert profile is not None  # _make_profile 반환 확인 (lint)


def test_grant_subscription_failed_status_not_regranted(db):
    """failed 재grant 차단 (#8): status='failed' 결제는 compare-and-set(WHERE status='ready')
    선점 실패 → paid_until 미부여. 'failed'/'refunded' 는 종결 상태로 재부여 불가."""
    from routers.payment import _grant_subscription

    _make_profile(db, "u1")
    _seed_payment(db, "pay_failed", "u1", status="failed")
    amount = PLAN_PRICES["basic_30d"]["amount"]
    result = _grant_subscription(db, db.get(Payment, "pay_failed"), _paid_portone(amount))
    db.commit()
    assert result is None  # ready 아니라 선점 실패 — 부여 안 함
    db.expire_all()
    assert db.get(UserProfile, "u1").paid_until is None
    assert db.get(Payment, "pay_failed").status == "failed"  # 상태 변동 없음


def test_webhook_transient_pending_503_keeps_ready(client, db):
    """webhook 일시 실패 503 (#4): PortOne status≠PAID(정산 지연) → 503 으로 PortOne 재전송 유발.
    payment 행은 'ready' 유지(failed 아님), paid_until 미부여. 200 으로 뭉개면 영구 미부여로 직결."""
    _make_profile(db, "u1")
    _seed_payment(db, "pay_wh_pending", "u1")
    pending = SimpleNamespace(status="PENDING", amount=SimpleNamespace(total=49000), id="tx")
    with _portone_env(), \
         patch("routers.payment._verify_webhook", return_value=_webhook_obj("pay_wh_pending")), \
         patch("routers.payment._fetch_portone_payment", return_value=pending):
        res = client.post("/api/payment/webhook", content=b'{"any":1}',
                          headers={"webhook-signature": "v1,ok"})
    assert res.status_code == 503  # 비-200 → PortOne 재전송
    db.expire_all()
    assert db.get(Payment, "pay_wh_pending").status == "ready"  # 일시 실패는 ready 유지
    assert db.get(UserProfile, "u1").paid_until is None


def test_webhook_amount_mismatch_200_not_granted(client, db):
    """webhook 영구 실패 200 (#7 사각): 금액 불일치(위변조) → 200 not_granted (PortOne 재전송 중단).
    위변조는 재시도 무의미하므로 200 으로 멈춘다. status='ready' 유지(grant 거부)."""
    _make_profile(db, "u1")
    _seed_payment(db, "pay_wh_bad", "u1")
    with _portone_env(), \
         patch("routers.payment._verify_webhook", return_value=_webhook_obj("pay_wh_bad")), \
         patch("routers.payment._fetch_portone_payment", return_value=_paid_portone(10)):  # 49000 ≠ 10
        res = client.post("/api/payment/webhook", content=b'{"any":1}',
                          headers={"webhook-signature": "v1,ok"})
    assert res.status_code == 200
    assert res.json().get("skipped") == "not_granted"
    db.expire_all()
    assert db.get(UserProfile, "u1").paid_until is None
    assert db.get(Payment, "pay_wh_bad").status == "ready"  # grant 거부, 상태 무변경


def test_webhook_no_api_secret_503(client, db):
    """webhook env 가드 대칭 (#11): WEBHOOK_SECRET 만 있고 API_SECRET 비면 503.
    complete(_require_portone_config)와 대칭 — 빈 secret 으로 PortOne 호출 차단."""
    _seed_payment(db, "pay_wh_noenv", "u1")
    with _portone_env(**{"routers.payment.PORTONE_API_SECRET": ""}), \
         patch("routers.payment._verify_webhook", return_value=_webhook_obj("pay_wh_noenv")):
        res = client.post("/api/payment/webhook", content=b'{"any":1}',
                          headers={"webhook-signature": "v1,ok"})
    assert res.status_code == 503


def test_complete_lost_race_returns_already_paid(client, db):
    """complete 선점 실패 멱등 (#2): _grant_subscription 이 None 반환(동시 webhook 이 이미 부여)
    → complete 는 already_paid=True 로 멱등 응답 (크래시·재연장 안 함)."""
    _make_profile(db, "u1", paid_until=None)
    _seed_payment(db, "pay_race", "u1")
    amount = PLAN_PRICES["basic_30d"]["amount"]
    # _grant_subscription 이 None(선점 실패) 반환하도록 patch → complete 의 profile is None 분기
    with _portone_env(), \
         patch("routers.payment._fetch_portone_payment", return_value=_paid_portone(amount)), \
         patch("routers.payment._grant_subscription", return_value=None):
        res = client.post("/api/payment/complete", json={"payment_id": "pay_race"},
                          headers=_auth("u1"))
    assert res.status_code == 200
    assert res.json()["already_paid"] is True
