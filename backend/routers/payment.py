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
import time
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth.audit import log_action
from config.plans import PLAN_PRICES
from db.models import Payment, UserProfile
from deps import _user_cache, get_current_user, get_db
from services.subscription import extend_paid_until, revoke_paid_until
from utils import utcnow

logger = logging.getLogger(__name__)
router = APIRouter()


class TransientGrantError(Exception):
    """일시 실패 — PortOne 가 아직 정산중(status != PAID)이라 재시도하면 성공 가능.

    webhook 은 비-200(503)으로 응답해 PortOne 재전송을 유발하고, complete 는 payment 행을
    'ready' 로 유지(failed 로 박지 않음)해 webhook·재시도로 복구 가능하게 한다.
    """


class PermanentGrantError(Exception):
    """영구 실패 — 금액 불일치(위변조)·미지원 plan·프로필 부재. 재시도해도 무의미.

    webhook 은 200 not_granted 로 응답해 PortOne 재전송을 멈추고, complete 는 status='failed'
    로 박아 거부한다.
    """


PORTONE_API_SECRET = os.getenv("PORTONE_API_SECRET", "")
PORTONE_STORE_ID = os.getenv("PORTONE_STORE_ID", "")
PORTONE_CHANNEL_KEY = os.getenv("PORTONE_CHANNEL_KEY", "")
PORTONE_WEBHOOK_SECRET = os.getenv("PORTONE_WEBHOOK_SECRET", "")

# 운영자 알림 쿨다운 — /webhook 은 공개·비인증이라 가짜 서명 폭격 시 알림이 무제한
# 발사되면 텔레그램 rate limit 소진 → 진짜 알림 누락. crawler/monitor.py 쿨다운 패턴 답습.
_ALERT_COOLDOWN_SEC = 600  # 10분에 한 번만 (같은 종류 알림)
_last_alert_at: dict[str, float] = {}


def _alert_operator_throttled(key: str, message: str) -> None:
    """운영자 텔레그램 알림 — key 별 쿨다운으로 스팸 차단 (공개 엔드포인트 보호).

    telegram 미설정·실패는 삼켜 결제 흐름을 깨지 않는다 (best-effort, lazy import).
    """
    now = time.monotonic()
    last = _last_alert_at.get(key)
    if last is not None and (now - last) < _ALERT_COOLDOWN_SEC:
        return  # 쿨다운 중 — 중복 알림 억제
    _last_alert_at[key] = now
    try:
        from services.telegram import send_telegram
        send_telegram(message)
    except Exception:
        pass


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

    멱등성은 DB 레벨 compare-and-set 으로 보장한다 (ready → paid 원자적 선점).
    complete(redirect)와 webhook 이 같은 payment 를 거의 동시에 처리해도 (PortOne 은 둘 다
    발사함), 단일 행 조건부 UPDATE `WHERE status='ready'` 는 정확히 하나만 rowcount=1 →
    이용권은 1회만 연장된다 (이중 부여 차단). 행 잠금/FOR UPDATE 불필요 — 단일 행 UPDATE 는
    READ COMMITTED 에서도 원자적이고 SQLite·PostgreSQL 양쪽 동일 동작.

    실패 분류:
      - status != PAID  → TransientGrantError (정산 지연, 재시도 시 성공 가능)
      - 금액 불일치·미지원 plan·프로필 부재 → PermanentGrantError (재시도 무의미)
    호출자가 commit + 캐시 무효화 + audit 를 담당 (단일 트랜잭션, log_action 패턴 답습).
    반환: 갱신된 profile (이미 처리됨/선점 실패면 None — 호출자가 멱등 분기).
    """
    if payment.status == "paid":
        return None  # 빠른 경로 — 이미 처리됨 (진짜 멱등 보장은 아래 compare-and-set)

    status = _portone_status(portone_payment)
    if status in {"CANCELLED", "FAILED", "PARTIAL_CANCELLED"}:
        # 종결 상태 — 재시도해도 PAID 가 될 수 없다. 영구 실패로 분기해 webhook 이
        # 200 not_granted 로 PortOne 재전송을 멈추게 한다(503 무한 재전송 차단).
        raise PermanentGrantError(f"결제 종결 상태 (status={status})")
    if status != "PAID":
        # PENDING(정산 지연) 등만 일시 실패 — 재시도·webhook 으로 복구 가능.
        raise TransientGrantError(f"결제가 완료되지 않았습니다 (status={status})")

    paid_amount = _portone_amount(portone_payment)
    if paid_amount is None or paid_amount != payment.amount:
        # 위변조·금액 불일치 — 이용권 부여 거부 (영구 실패)
        raise PermanentGrantError(
            f"결제 금액 불일치 (기대={payment.amount}, 실제={paid_amount})"
        )

    plan_meta = PLAN_PRICES.get(payment.plan)
    if not plan_meta:
        raise PermanentGrantError(f"알 수 없는 요금제 (plan={payment.plan})")

    profile = db.get(UserProfile, payment.user_id)
    if not profile:
        raise PermanentGrantError("결제 사용자 프로필이 존재하지 않습니다")

    # ready → paid 원자적 선점 (compare-and-set). 동시 complete+webhook 중 하나만 통과.
    # status='ready' 조건이 failed/refunded/paid 도 선점 실패시켜 멱등성·재grant 차단 동시 달성.
    won = db.query(Payment).filter(
        Payment.payment_id == payment.payment_id,
        Payment.status == "ready",
    ).update(
        {
            "status": "paid",
            "paid_at": utcnow(),
            "raw": _serialize_portone(portone_payment),
        },
        synchronize_session=False,
    )
    if won == 0:
        return None  # 다른 트랜잭션이 이미 선점 — 멱등 no-op (이중 연장 안 함)

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
    except TransientGrantError as e:
        # 정산 지연(PENDING) — payment 행은 'ready' 유지(failed 로 박지 않음)해
        # webhook·재시도로 복구 가능. 409 로 "아직 처리중, 잠시 후 재시도" 안내.
        raise HTTPException(status_code=409, detail=str(e))
    except PermanentGrantError as e:
        # 위변조·데이터 오류 — 영구 거부. status='failed' 박고 400.
        # ⚠ in-memory 대입이 아니라 compare-and-set(WHERE status='ready')으로 박는다 —
        # 동시 webhook 이 먼저 paid 로 선점했으면 rowcount=0 no-op 라 paid 가 보존된다
        # (정상 결제를 failed 로 덮어 status 오염시키는 것 차단, finding #3).
        db.query(Payment).filter(
            Payment.payment_id == payment.payment_id,
            Payment.status == "ready",
        ).update({"status": "failed"}, synchronize_session=False)
        # 위변조 시도를 영구 감사 로그에 기록 (forensics — 반복 공격·분쟁 추적, finding #5).
        log_action(db, payment.user_id, "payment_forgery_rejected", "payment", body.payment_id, {
            "expected": payment.amount,
            "detail": str(e),
        })
        db.commit()
        raise HTTPException(status_code=400, detail=str(e))

    if profile is None:
        # compare-and-set 선점 실패 — 동시 요청(webhook 등)이 이미 부여함. 멱등 처리.
        db.rollback()
        profile = db.get(UserProfile, user["user_id"])
        return {
            "paid_until": profile.paid_until.isoformat() if profile and profile.paid_until else None,
            "plan": payment.plan,
            "already_paid": True,
        }

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
    # complete(187)와 대칭 — _fetch_portone_payment 가 PORTONE_API_SECRET 을 쓰므로
    # 부분 설정(webhook secret 만 주입) 상태에서 빈 API_SECRET 으로 PortOne 호출 차단.
    _require_portone_config()

    raw_body = await request.body()
    payload_str = raw_body.decode("utf-8")

    # 서명 검증 (Standard Webhooks — payload raw 문자열, _verify_webhook 가 SDK 호출)
    try:
        webhook = _verify_webhook(payload_str, dict(request.headers))
    except HTTPException:
        raise
    except Exception as e:
        logger.warning("[PAYMENT] 웹훅 서명 검증 실패: %s", e)
        # 지속적 서명 실패 = secret 로테이션·오설정 의심 → 운영자 알림 (조용히 묻히면
        # PortOne 재전송 예산이 소진되고 진짜 결제 사용자가 미부여됨, finding #12).
        # ⚠ /webhook 은 공개·비인증 → 쿨다운 필수 (가짜 서명 폭격 시 알림 스팸·rate limit 소진
        # 으로 진짜 알림 누락 차단). _alert_operator_throttled 가 10분 1회로 억제.
        _alert_operator_throttled(
            "webhook_bad_signature",
            "[PAYMENT] 웹훅 서명 검증 실패 — PORTONE_WEBHOOK_SECRET 불일치 의심 (10분 내 반복 억제)",
        )
        raise HTTPException(status_code=400, detail="웹훅 검증 실패")

    payment_id = _webhook_payment_id(webhook)
    if not payment_id:
        return {"received": True, "skipped": "no_payment_id"}

    payment = db.get(Payment, payment_id)
    if not payment:
        logger.warning("[PAYMENT] 웹훅 — 미존재 결제 (payment_id=%s)", payment_id)
        return {"received": True, "skipped": "unknown_payment"}

    # 환불·취소 웹훅 — type 으로 식별 (결제완료 멱등 체크보다 먼저: paid 상태를 환불로 전이해야 함).
    event_type = _webhook_event_type(webhook)
    if event_type in {"Transaction.Cancelled", "Transaction.PartialCancelled"}:
        return _handle_refund_webhook(db, payment, event_type)

    if payment.status == "paid":
        return {"received": True, "already_paid": True}  # 멱등

    # PortOne 조회로 금액·상태 재확인 (웹훅 본문만 신뢰하지 않음 — 공식 권장)
    portone_payment = _fetch_portone_payment(payment_id)
    try:
        profile = _grant_subscription(db, payment, portone_payment)
    except TransientGrantError as e:
        # 정산 지연(PENDING) — 503 으로 PortOne 재전송 유발 (안전망 유지).
        # 200 으로 응답하면 재전송이 막혀 영구 미부여로 직결됨.
        logger.warning("[PAYMENT] 웹훅 일시 실패 — 재시도 유도 (payment_id=%s): %s", payment_id, e)
        raise HTTPException(status_code=503, detail="결제 확인 지연 — 재시도 필요")
    except PermanentGrantError as e:
        # 위변조·데이터 오류 — 재시도 무의미. 200 으로 PortOne 재전송 중단.
        logger.warning("[PAYMENT] 웹훅 이용권 부여 거부 (payment_id=%s): %s", payment_id, e)
        return {"received": True, "skipped": "not_granted"}

    if profile is None:
        # compare-and-set 선점 실패 — 동시 요청(complete 등)이 이미 부여함. 멱등 처리.
        db.rollback()
        return {"received": True, "already_paid": True}

    log_action(db, payment.user_id, "payment_webhook", "payment", payment_id, {
        "plan": payment.plan,
        "amount": payment.amount,
    })
    db.commit()
    _user_cache.delete(f"profile:{payment.user_id}")
    return {"received": True, "granted": True}


def _handle_refund_webhook(db: Session, payment: Payment, event_type: str) -> dict:
    """환불·취소 웹훅 처리 — 200 반환으로 PortOne 재전송 중단 (finding #4).

    - 부분취소(PartialCancelled): paid_until 자동 롤백 안 함 (이용기간 비례 차감은 사장님
      결정으로 제외). telegram 운영자 알림 + audit 기록만 → 사장님이 수동 처리.
    - 완전취소(Cancelled): status='refunded' compare-and-set(WHERE status='paid' — 정상 결제만
      전이) + revoke_paid_until 로 이용권 롤백 + 게이트 캐시 무효화. paid 가 아니었으면
      (ready 등) rowcount=0 no-op 라 안전(환불 웹훅이 결제완료보다 먼저 와도 무해).
    멱등: 이미 refunded 면 no-op. 모든 경로 200 (재전송 중단).
    """
    if payment.status == "refunded":
        return {"received": True, "already_refunded": True}  # 멱등

    if event_type == "Transaction.PartialCancelled":
        # 부분환불 — 자동 롤백 안 함(사장님 수동). 알림 + 감사만.
        # payment_id 별 쿨다운 key — 서로 다른 결제는 각각 알림(부분환불은 빈도 낮음),
        # 같은 결제 중복 웹훅은 10분 억제.
        _alert_operator_throttled(
            f"partial_cancel:{payment.payment_id}",
            f"[PAYMENT] 부분환불 발생 — 수동 확인 필요 (payment_id={payment.payment_id}, "
            f"user={payment.user_id}, plan={payment.plan})",
        )
        log_action(db, payment.user_id, "payment_partial_cancelled", "payment", payment.payment_id, {
            "plan": payment.plan,
            "amount": payment.amount,
        })
        db.commit()
        return {"received": True, "partial_cancel": "manual_review"}

    # 완전취소 — PortOne 재검증 (grant 경로와 대칭: 서명검증 통과해도 본문만 신뢰 안 함).
    # 실제 status 가 CANCELLED 인지 재확인 후에만 롤백한다 (위변조·오발사 방어). 조회 실패는
    # 503 으로 재전송 유도 — 환불을 추측으로 강행하지 않는다.
    try:
        portone_payment = _fetch_portone_payment(payment.payment_id)
    except Exception as e:
        logger.warning("[PAYMENT] 환불 웹훅 — PortOne 조회 실패, 재시도 유도 (payment_id=%s): %s",
                       payment.payment_id, e)
        raise HTTPException(status_code=503, detail="환불 확인 지연 — 재시도 필요")
    live_status = _portone_status(portone_payment)
    if live_status != "CANCELLED":
        # 서명은 통과했으나 PortOne 실제 상태가 취소 아님 — 롤백 거부 (200 으로 재전송 중단).
        logger.warning("[PAYMENT] 환불 웹훅 — PortOne status=%s (CANCELLED 아님), 롤백 거부 (payment_id=%s)",
                       live_status, payment.payment_id)
        return {"received": True, "skipped": "not_cancelled"}

    # status='refunded' 원자적 전이 (정상 결제만). 동시·중복 환불 웹훅 멱등.
    won = db.query(Payment).filter(
        Payment.payment_id == payment.payment_id,
        Payment.status == "paid",
    ).update({"status": "refunded"}, synchronize_session=False)
    if won == 0:
        # paid 가 아니었음 (ready/failed 등) — 부여된 이용권이 없으니 롤백 불필요.
        db.rollback()
        logger.warning("[PAYMENT] 환불 웹훅 — paid 아님, no-op (payment_id=%s, status=%s)",
                       payment.payment_id, payment.status)
        return {"received": True, "skipped": "not_paid"}

    # 부여했던 이용권 일수만큼 paid_until 롤백.
    # ⚠ tail-subtraction 모델: paid_until 은 단일 스칼라라 어느 결제 슬라이스가 환불됐는지
    # 모르고 항상 끝에서 days 만큼 뺀다. 여러 결제가 쌓인 상태에서 먼저 쓴 결제를 늦게 환불하면
    # 남은(미환불) 기간이 과도하게 줄 수 있으나 clamp(now)로 음수는 막고, 사업자에게 유리한
    # 방향(과소 크레딧)이라 매출 손실 0. B2B·환불 희소성 고려해 수용 (리뷰 LOW-1).
    plan_meta = PLAN_PRICES.get(payment.plan)
    days = plan_meta["days"] if plan_meta else 0
    profile = db.get(UserProfile, payment.user_id)
    if profile and days:
        profile.paid_until = revoke_paid_until(profile.paid_until, days)

    log_action(db, payment.user_id, "payment_refunded", "payment", payment.payment_id, {
        "plan": payment.plan,
        "amount": payment.amount,
        "cancelled_amount": _portone_amount(portone_payment),  # PortOne 실제 취소액 (분쟁 추적)
        "rolled_back_days": days,
    })
    db.commit()
    # 게이트가 환불을 즉시 반영. ⚠ _user_cache 는 프로세스 로컬 — 현재 단일 uvicorn 워커
    # (startup_orchestrator.py, --workers 없음)라 delete 가 유효. 다중 워커·인스턴스로 확장 시
    # 다른 워커는 TTL(5분)까지 stale paid_until 로 통과 가능 → Redis 공유 캐시 필요 (리뷰 LOW-2).
    _user_cache.delete(f"profile:{payment.user_id}")
    return {"received": True, "refunded": True}


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


def _webhook_event_type(webhook) -> str:
    """검증된 웹훅 객체에서 이벤트 type 추출 (예: Transaction.Paid / Transaction.Cancelled).

    PortOne V2 웹훅은 type 필드로 결제완료·취소·실패를 구분한다. SDK 객체/dict 양쪽 방어
    (_webhook_payment_id 패턴 답습). 미상이면 빈 문자열 — 호출자가 기본(결제완료) 경로로 처리.
    """
    t = getattr(webhook, "type", None)
    if t:
        return t
    if isinstance(webhook, dict):
        return webhook.get("type") or ""
    return ""
