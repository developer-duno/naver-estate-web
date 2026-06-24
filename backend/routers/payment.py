"""유료 구독 결제 라우트 — PortOne(포트원) V2 연동 (PR3).

흐름 (수동 갱신, 빌링키 자동결제는 PR5):
  1. FE → POST /api/payment/prepare : paymentId 생성·금액 서버결정·payments(ready) INSERT
  2. FE → PortOne.requestPayment(...) (브라우저 결제창) — PR4 범위
  3. FE → POST /api/payment/complete : 서버가 PortOne get_payment 로 PAID·금액 재검증 →
     paid_until 연장 (위변조 방지 — 결제정보는 브라우저에서 오므로 서버 재검증 의무)
  4. PortOne 서버 → POST /api/payment/webhook : redirect 실패 대비 이중 안전망 (동일 멱등 로직)

보안 핵심:
  - 금액은 PLAN_PRICES 에서 서버가 결정. FE 가 보낸 금액 신뢰 0.
  - paymentId 는 우리가 생성(pay_{uuid}) → 멱등성 (같은 ID 재시도 가능, complete 가 paid 면 재연장 거부).
  - complete·webhook 은 _grant_subscription 한 멱등 헬퍼 공유.

verify.py 패턴 답습 (Depends 인증·log_action audit·_user_cache 무효화).
"""

import logging
import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth.audit import log_action
from config.plans import PLAN_PRICES
from db.models import Payment, UserProfile
from deps import _user_cache, get_current_user, get_db
from services.subscription import extend_paid_until
from utils import utcnow

logger = logging.getLogger(__name__)
router = APIRouter()

PORTONE_API_SECRET = os.getenv("PORTONE_API_SECRET", "")
PORTONE_STORE_ID = os.getenv("PORTONE_STORE_ID", "")
PORTONE_CHANNEL_KEY = os.getenv("PORTONE_CHANNEL_KEY", "")
PORTONE_WEBHOOK_SECRET = os.getenv("PORTONE_WEBHOOK_SECRET", "")


def _require_portone_config() -> None:
    """PortOne env 미설정 시 503 (사장님 가입 전이거나 미주입). deps._verify_token_remote 패턴."""
    if not (PORTONE_API_SECRET and PORTONE_STORE_ID and PORTONE_CHANNEL_KEY):
        raise HTTPException(status_code=503, detail="결제 서비스가 설정되지 않았습니다")


class PrepareRequest(BaseModel):
    plan: str  # PLAN_PRICES 키 (금액은 서버가 결정 — FE 금액 신뢰 안 함)


class CompleteRequest(BaseModel):
    payment_id: str


def _fetch_portone_payment(payment_id: str):
    """PortOne get_payment 호출 — 결제 단건 조회 (lazy import: SDK 미설치 테스트는 본 함수 mock).

    반환 payment 객체에서 status·amount.total 을 호출처가 검증한다.
    """
    from portone_server_sdk import PaymentClient

    client = PaymentClient(secret=PORTONE_API_SECRET)
    return client.get_payment(payment_id=payment_id)


def _verify_webhook(payload_str: str, headers: dict):
    """PortOne 웹훅 서명 검증 (lazy import: SDK 미설치 테스트는 본 함수 mock).

    Standard Webhooks 표준 — payload 는 JSON 파싱 전 raw 문자열. 검증된 Webhook 객체 반환,
    검증 실패 시 예외 전파(호출자가 400).
    """
    import portone_server_sdk as portone

    return portone.webhook.verify(PORTONE_WEBHOOK_SECRET, payload_str, headers)


def _portone_status(payment) -> str:
    """PortOne payment 객체의 결제 상태 문자열. tagged union/문자열 양쪽 방어."""
    status = getattr(payment, "status", None)
    # enum/tagged union 이면 .value 또는 클래스명, 문자열이면 그대로
    if status is None:
        return ""
    return getattr(status, "value", status) if not isinstance(status, str) else status


def _portone_amount(payment) -> int | None:
    """PortOne payment 객체의 결제 총액(원). amount.total 접근."""
    amount = getattr(payment, "amount", None)
    if amount is None:
        return None
    total = getattr(amount, "total", None)
    return int(total) if total is not None else None


def _grant_subscription(db: Session, payment: Payment, portone_payment) -> UserProfile | None:
    """결제 검증 통과 시 paid_until 연장 — complete·webhook 공유 멱등 헬퍼.

    멱등: 이미 paid 면 no-op (재연장 거부). PAID 아님/금액 불일치면 ValueError.
    호출자가 commit + 캐시 무효화 + audit 를 담당 (단일 트랜잭션, log_action 패턴 답습).
    반환: 갱신된 profile (이미 paid 면 None — 호출자가 멱등 분기).
    """
    if payment.status == "paid":
        return None  # 이미 처리됨 — 멱등 no-op

    status = _portone_status(portone_payment)
    if status != "PAID":
        raise ValueError(f"결제가 완료되지 않았습니다 (status={status})")

    paid_amount = _portone_amount(portone_payment)
    if paid_amount is None or paid_amount != payment.amount:
        # 위변조·금액 불일치 — 이용권 부여 거부
        raise ValueError(
            f"결제 금액 불일치 (기대={payment.amount}, 실제={paid_amount})"
        )

    plan_meta = PLAN_PRICES.get(payment.plan)
    if not plan_meta:
        raise ValueError(f"알 수 없는 요금제 (plan={payment.plan})")

    profile = db.get(UserProfile, payment.user_id)
    if not profile:
        raise ValueError("결제 사용자 프로필이 존재하지 않습니다")

    payment.status = "paid"
    payment.paid_at = utcnow()
    payment.raw = _serialize_portone(portone_payment)
    profile.paid_until = extend_paid_until(profile.paid_until, plan_meta["days"])
    return profile


def _serialize_portone(portone_payment) -> dict | None:
    """PortOne 응답을 JSON 저장 가능한 dict 로 변환 (감사·환불 추적용)."""
    for attr in ("__dict__",):
        data = getattr(portone_payment, attr, None)
        if isinstance(data, dict):
            # 직렬화 불가 값 방어 — 문자열화
            return {k: (v if isinstance(v, (str, int, float, bool, type(None))) else str(v))
                    for k, v in data.items()}
    return None


@router.post("/prepare")
def prepare_payment(
    body: PrepareRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """결제 준비 — paymentId 생성, 금액 서버결정, payments(ready) 행 생성.

    반환값으로 FE 가 PortOne.requestPayment 를 호출한다 (storeId·channelKey 는 서버 env).
    """
    _require_portone_config()
    plan_meta = PLAN_PRICES.get(body.plan)
    if not plan_meta:
        raise HTTPException(status_code=400, detail="알 수 없는 요금제입니다")

    payment_id = f"pay_{uuid.uuid4().hex}"
    amount = plan_meta["amount"]  # 서버 결정 — FE 금액 신뢰 안 함

    db.add(Payment(
        payment_id=payment_id,
        user_id=user["user_id"],
        plan=body.plan,
        amount=amount,
        status="ready",
    ))
    db.commit()

    return {
        "paymentId": payment_id,
        "storeId": PORTONE_STORE_ID,
        "channelKey": PORTONE_CHANNEL_KEY,
        "orderName": plan_meta["order_name"],
        "amount": amount,
        "currency": "KRW",
    }


@router.post("/complete")
def complete_payment(
    body: CompleteRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """결제 완료 — PortOne get_payment 로 PAID·금액 재검증 후 paid_until 연장 (멱등)."""
    _require_portone_config()

    payment = db.get(Payment, body.payment_id)
    if not payment or payment.user_id != user["user_id"]:
        raise HTTPException(status_code=404, detail="결제 내역을 찾을 수 없습니다")

    # 이미 paid → 멱등 (현재 paid_until 그대로 반환, 재연장 거부)
    if payment.status == "paid":
        profile = db.get(UserProfile, user["user_id"])
        return {
            "paid_until": profile.paid_until.isoformat() if profile and profile.paid_until else None,
            "plan": payment.plan,
            "already_paid": True,
        }

    portone_payment = _fetch_portone_payment(body.payment_id)
    try:
        profile = _grant_subscription(db, payment, portone_payment)
    except ValueError as e:
        payment.status = "failed"
        db.commit()
        raise HTTPException(status_code=400, detail=str(e))

    log_action(db, user["user_id"], "payment_complete", "payment", body.payment_id, {
        "plan": payment.plan,
        "amount": payment.amount,
    })
    db.commit()
    _user_cache.delete(f"profile:{user['user_id']}")

    return {
        "paid_until": profile.paid_until.isoformat() if profile and profile.paid_until else None,
        "plan": payment.plan,
        "already_paid": False,
    }


@router.post("/webhook")
async def payment_webhook(request: Request, db: Session = Depends(get_db)):
    """PortOne 결제완료 웹훅 — redirect 실패 대비 이중 안전망 (complete 와 동일 멱등 로직).

    ⚠ 본문은 JSON 파싱 전 raw 문자열로 서명 검증 (Standard Webhooks 표준).
    인증 없음(PortOne 서버용) — 서명 검증이 인증 역할.
    """
    if not PORTONE_WEBHOOK_SECRET:
        raise HTTPException(status_code=503, detail="결제 웹훅이 설정되지 않았습니다")

    raw_body = await request.body()
    payload_str = raw_body.decode("utf-8")

    # 서명 검증 (Standard Webhooks — payload raw 문자열, _verify_webhook 가 SDK 호출)
    try:
        webhook = _verify_webhook(payload_str, dict(request.headers))
    except HTTPException:
        raise
    except Exception as e:
        logger.warning("[PAYMENT] 웹훅 서명 검증 실패: %s", e)
        raise HTTPException(status_code=400, detail="웹훅 검증 실패")

    payment_id = _webhook_payment_id(webhook)
    if not payment_id:
        return {"received": True, "skipped": "no_payment_id"}

    payment = db.get(Payment, payment_id)
    if not payment:
        logger.warning("[PAYMENT] 웹훅 — 미존재 결제 (payment_id=%s)", payment_id)
        return {"received": True, "skipped": "unknown_payment"}
    if payment.status == "paid":
        return {"received": True, "already_paid": True}  # 멱등

    # PortOne 조회로 금액·상태 재확인 (웹훅 본문만 신뢰하지 않음 — 공식 권장)
    portone_payment = _fetch_portone_payment(payment_id)
    try:
        profile = _grant_subscription(db, payment, portone_payment)
    except ValueError as e:
        logger.warning("[PAYMENT] 웹훅 이용권 부여 거부 (payment_id=%s): %s", payment_id, e)
        return {"received": True, "skipped": "not_granted"}

    log_action(db, payment.user_id, "payment_webhook", "payment", payment_id, {
        "plan": payment.plan,
        "amount": payment.amount,
    })
    db.commit()
    if profile:
        _user_cache.delete(f"profile:{payment.user_id}")
    return {"received": True, "granted": True}


def _webhook_payment_id(webhook) -> str | None:
    """검증된 웹훅 객체에서 paymentId 추출. SDK 객체/dict 양쪽 방어."""
    data = getattr(webhook, "data", None)
    if data is not None:
        pid = getattr(data, "payment_id", None) or getattr(data, "paymentId", None)
        if pid:
            return pid
    if isinstance(webhook, dict):
        return (webhook.get("data") or {}).get("paymentId") or (webhook.get("data") or {}).get("payment_id")
    return None
