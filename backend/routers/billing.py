"""빌링키 자동결제(정기결제) — 발급 prepare + 카드 등록(첫 결제 즉시) (정기결제 PR2).

흐름 (카드 한 번 등록 → 매달 자동결제, 방식 B: 우리 cron):
  1. FE → POST /api/payment/billing/prepare : issueId 생성 + storeId/channelKey/customer 반환
  2. FE → PortOne.requestIssueBillingKey(...) (브라우저 카드등록창) — PR5 범위
  3. FE → POST /api/payment/billing/register : billingKey 저장 + 첫 결제 즉시 실행 → paid_until 연장

보안 핵심 (payment.py 답습):
  - 금액은 PLAN_PRICES 에서 서버가 결정 (FE 금액 신뢰 0).
  - 첫 결제는 Payment 행을 만들고 PortOne 응답(status·amount)을 재검증 (위변조 방지).
  - 카드번호 미보관 — PortOne 빌링키 문자열(결제 위임 토큰)만 저장.

카드 정책 (사장님 확정 세션 329):
  - 카드 여러 장 보관(모두 status='active'), 자동결제는 is_default=True 1장으로만 (V037).
  - 새 카드 등록 시 기존 기본 카드를 is_default=False 로 내리고 신규를 기본 승격.

KPN 제약: customer.name.full(대표자명) 필수 — AgentVerification 에서 가져온다.
payment.py 의 env·헬퍼·예외를 import 재활용 (재정의 금지).
"""

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from auth.audit import log_action
from config.plans import PLAN_PRICES
from db.models import AgentVerification, BillingKey, Payment, UserProfile
from deps import _user_cache, get_current_user, get_db
from routers.payment import (
    PORTONE_API_SECRET,
    PORTONE_CHANNEL_KEY,
    PORTONE_STORE_ID,
    _portone_amount,
    _portone_status,
    _require_portone_config,
    _serialize_portone,
)
from services.subscription import extend_paid_until
from utils import utcnow

logger = logging.getLogger(__name__)
router = APIRouter()


class BillingPrepareRequest(BaseModel):
    plan: str  # PLAN_PRICES 키 (자동결제할 플랜)


class BillingRegisterRequest(BaseModel):
    billing_key: str  # PortOne 빌링키 발급 응답값 (FE requestIssueBillingKey 결과)
    plan: str


class BillingCancelRequest(BaseModel):
    billing_key_id: int  # 해지할 BillingKey.id (본인 소유만 해지 가능)


def _get_customer(db: Session, user_id: str) -> tuple[str, str | None]:
    """결제자 이름·연락처 — AgentVerification 에서 조회 (KPN customer.fullName 필수).

    representative_name(필수) 없으면 결제 불가 → 호출처가 400. phone 은 nullable.
    verify.py:93 조회 패턴 답습.
    """
    v = db.execute(
        select(AgentVerification).where(AgentVerification.user_id == user_id)
    ).scalar_one_or_none()
    if not v or not v.representative_name:
        raise HTTPException(
            status_code=400, detail="공인중개사 검증(대표자명)을 먼저 완료해주세요"
        )
    return v.representative_name, v.phone


def _pay_with_billing_key(payment_id: str, billing_key: str, order_name: str,
                          name: str, phone: str | None, amount: int):
    """PortOne 빌링키 즉시 결제 (lazy import: SDK 미설치 테스트는 본 함수 mock).

    payment.py:_fetch_portone_payment 의 lazy import 패턴 답습. KPN 은 customer.name.full
    필수 + phone_number 선택. 반환 객체에서 status·amount.total 을 호출처가 검증한다.

    import 경로는 SDK 0.21 공식 소스 확인 — top-level 은 PaymentClient 만, 공통 입력 타입은
    portone_server_sdk.common 에서 re-export(__all__ 확인). currency 는 Literal 이라 "KRW" 문자열
    그대로 전달(enum 아님). 테스트는 본 함수 전체를 @patch 한다.
    """
    from portone_server_sdk import PaymentClient
    from portone_server_sdk.common import (
        CustomerInput,
        CustomerNameInput,
        PaymentAmountInput,
    )

    client = PaymentClient(secret=PORTONE_API_SECRET)
    return client.pay_with_billing_key(
        payment_id=payment_id,
        billing_key=billing_key,
        order_name=order_name,
        customer=CustomerInput(name=CustomerNameInput(full=name), phone_number=phone),
        amount=PaymentAmountInput(total=amount),
        currency="KRW",
    )


def _delete_portone_billing_key(billing_key: str) -> None:
    """PortOne 빌링키 삭제(해지) — BillingKeyClient.delete_billing_key (lazy import, 테스트 mock).

    requester='CUSTOMER': 사용자 본인 해지. 삭제 실패는 호출처가 처리(이미 삭제된 키 등은 무시 가능).
    """
    from portone_server_sdk import BillingKeyClient

    client = BillingKeyClient(secret=PORTONE_API_SECRET)
    client.delete_billing_key(billing_key=billing_key, reason="사용자 해지", requester="CUSTOMER")


def _extract_card_info(portone_payment) -> tuple[str | None, str | None]:
    """결제 응답에서 카드사명·마지막 4자리 추출 (화면 표시용, 없으면 NULL).

    PayWithBillingKeyResponse 의 카드 정보 구조는 SDK 버전 의존 → 방어적 getattr.
    실측으로 정확 경로 확정 시 보강(미결 5). 실패해도 결제 자체엔 영향 0.
    """
    try:
        method = getattr(portone_payment, "method", None)
        card = getattr(method, "card", None) if method else None
        if card is None:
            return None, None
        card_name = getattr(card, "name", None) or getattr(card, "issuer", None)
        number = getattr(card, "number", None)
        last4 = number[-4:] if isinstance(number, str) and len(number) >= 4 else None
        return card_name, last4
    except Exception:
        return None, None


@router.post("/prepare")
def prepare_billing(
    body: BillingPrepareRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """빌링키 발급 준비 — issueId 생성 + customer 정보 반환.

    FE 가 이 값으로 PortOne.requestIssueBillingKey 를 호출한다 (PR5).
    """
    _require_portone_config()
    plan_meta = PLAN_PRICES.get(body.plan)
    if not plan_meta:
        raise HTTPException(status_code=400, detail="알 수 없는 요금제입니다")

    name, phone = _get_customer(db, user["user_id"])

    # issueId 는 우리가 생성 (가맹점 고유, paymentId 와 동일 제약: 영숫자 32byte 이내).
    issue_id = f"i{uuid.uuid4().hex[:31]}"

    return {
        "issueId": issue_id,
        "storeId": PORTONE_STORE_ID,
        "channelKey": PORTONE_CHANNEL_KEY,
        "issueName": plan_meta["order_name"],
        "customer": {"name": name, "phone": phone},
    }


@router.post("/register")
def register_billing(
    body: BillingRegisterRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """빌링키 등록 — 카드 저장 + 첫 결제 즉시 실행 → paid_until 연장.

    카드 여러 장 보관: 기존 기본 카드를 is_default=False 로 내리고 신규를 기본 승격.
    첫 결제 실패 시 BillingKey 저장 안 함 (카드 무효라 등록 의미 없음).
    """
    _require_portone_config()
    plan_meta = PLAN_PRICES.get(body.plan)
    if not plan_meta:
        raise HTTPException(status_code=400, detail="알 수 없는 요금제입니다")

    user_id = user["user_id"]
    name, phone = _get_customer(db, user_id)

    profile = db.get(UserProfile, user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="사용자 프로필이 존재하지 않습니다")

    amount = plan_meta["amount"]  # 서버 결정 — FE 금액 신뢰 안 함
    payment_id = f"p{uuid.uuid4().hex[:31]}"

    # 첫 결제용 Payment(ready) 행 — 일회성 결제와 동일 인프라(멱등·금액대조·환불추적 재활용).
    db.add(Payment(payment_id=payment_id, user_id=user_id, plan=body.plan,
                    amount=amount, status="ready"))
    db.flush()

    # 첫 결제 즉시 실행 (PortOne 빌링키 결제).
    portone_payment = _pay_with_billing_key(
        payment_id, body.billing_key, plan_meta["order_name"], name, phone, amount,
    )

    # 응답 검증 — payment.py _grant_subscription 의 검증 로직 답습 (PAID + 금액일치).
    status = _portone_status(portone_payment)
    if status in {"CANCELLED", "FAILED", "PARTIAL_CANCELLED"}:
        _fail_payment(db, payment_id)
        raise HTTPException(status_code=400, detail=f"결제 실패 (status={status})")
    if status != "PAID":
        # 정산 지연 — Payment 행 ready 유지(webhook 복구 가능). 409 안내.
        raise HTTPException(status_code=409, detail="결제 확인 지연 — 잠시 후 재시도해주세요")

    paid_amount = _portone_amount(portone_payment)
    if paid_amount is None or paid_amount != amount:
        _fail_payment(db, payment_id)
        log_action(db, user_id, "billing_forgery_rejected", "billing", payment_id,
                   {"expected": amount, "actual": paid_amount})
        db.commit()
        raise HTTPException(status_code=400, detail="결제 금액 불일치")

    # 결제 성공 — Payment paid 전이(compare-and-set 멱등) + paid_until 연장.
    won = db.query(Payment).filter(
        Payment.payment_id == payment_id, Payment.status == "ready",
    ).update({"status": "paid", "paid_at": utcnow(),
              "raw": _serialize_portone(portone_payment)}, synchronize_session=False)
    if won == 0:
        # 동시 처리로 이미 선점됨 — 멱등 no-op (이중 연장 안 함).
        db.rollback()
        raise HTTPException(status_code=409, detail="이미 처리된 결제입니다")

    profile.paid_until = extend_paid_until(profile.paid_until, plan_meta["days"])

    # 기존 기본 카드 내리기 (한 user 당 active 기본 1장 — 카드 여러 장 보관 정책).
    db.query(BillingKey).filter(
        BillingKey.user_id == user_id, BillingKey.is_default.is_(True),
        BillingKey.status == "active",
    ).update({"is_default": False}, synchronize_session=False)

    card_name, card_last4 = _extract_card_info(portone_payment)
    db.add(BillingKey(
        user_id=user_id, billing_key=body.billing_key, plan=body.plan,
        card_name=card_name, card_last4=card_last4,
        customer_name=name, customer_phone=phone,
        status="active", is_default=True,
        next_charge_at=profile.paid_until,  # 다음 자동결제 = 이번 만료일 (UTC aware)
    ))

    log_action(db, user_id, "billing_registered", "billing", payment_id,
               {"plan": body.plan, "amount": amount})
    db.commit()
    _user_cache.delete(f"profile:{user_id}")

    return {
        "paid_until": profile.paid_until.isoformat() if profile.paid_until else None,
        "plan": body.plan,
        "billing_registered": True,
    }


def _fail_payment(db: Session, payment_id: str) -> None:
    """Payment 행을 failed 로 박는다 (compare-and-set — 동시 paid 선점 보존)."""
    db.query(Payment).filter(
        Payment.payment_id == payment_id, Payment.status == "ready",
    ).update({"status": "failed"}, synchronize_session=False)


@router.get("/list")
def list_billing_keys(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """내 등록 카드 목록 — active 빌링키만(해지·실패 제외). FE 등록상태 표시·해지 UI 용."""
    rows = db.execute(
        select(BillingKey)
        .where(BillingKey.user_id == user["user_id"], BillingKey.status == "active")
        .order_by(BillingKey.is_default.desc(), BillingKey.created_at.desc())
    ).scalars().all()
    return {
        "cards": [
            {
                "id": bk.id,
                "plan": bk.plan,
                "card_name": bk.card_name,
                "card_last4": bk.card_last4,
                "is_default": bk.is_default,
                "next_charge_at": bk.next_charge_at.isoformat() if bk.next_charge_at else None,
            }
            for bk in rows
        ]
    }


@router.post("/cancel")
def cancel_billing_key(
    body: BillingCancelRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """빌링키 해지 — PortOne 삭제 + status='deleted' (cron 이 더는 자동결제 안 함).

    본인 소유만 해지 가능. PortOne 삭제는 best-effort — 실패해도 우리 DB 를 deleted 로 막아
    자동결제를 확실히 중단한다(외부 삭제 실패가 구독 해지를 막으면 안 됨, 사용자 불이익).
    이미 deleted 면 멱등 no-op. 기본 카드를 해지하면 다른 active 카드를 기본으로 승격하지 않음
    (사용자가 명시적으로 재등록 — 단순성). paid_until 은 환불 없이 만료일까지 유지.
    """
    bk = db.get(BillingKey, body.billing_key_id)
    if not bk or bk.user_id != user["user_id"]:
        raise HTTPException(status_code=404, detail="빌링키를 찾을 수 없습니다")
    if bk.status == "deleted":
        return {"cancelled": True, "already": True}  # 멱등

    # PortOne 삭제 (best-effort — 실패해도 DB 차단은 진행).
    try:
        _delete_portone_billing_key(bk.billing_key)
    except Exception as e:
        logger.warning("[billing] PortOne 빌링키 삭제 실패(무시, DB 차단 진행) id=%s: %s",
                       body.billing_key_id, e)

    bk.status = "deleted"
    bk.is_default = False  # 부분 유니크 인덱스(active+is_default) 충돌 방지 + cron 대상 제외
    log_action(db, user["user_id"], "billing_cancelled", "billing", str(bk.id), {"plan": bk.plan})
    db.commit()
    return {"cancelled": True, "already": False}
