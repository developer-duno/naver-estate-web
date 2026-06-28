"""빌링키 자동결제 cron 잡 (정기결제 PR3, 세션 330) — 방식 B(우리 cron).

매일 새벽 4:50, billing_keys 에서 결제할 때가 된 카드(next_charge_at 도래분)를 찾아
PortOne 빌링키 결제를 실행한다. 성공 시 paid_until 연장 + next_charge_at 을 다음 만료일로
갱신, 실패 시 retry_count 증가 → 3일 연속 실패하면 status='failed' 로 중단하고 알림.

대상 조건: status='active' AND is_default=true AND next_charge_at <= now.
  - is_default=true: 한 user 당 자동결제는 기본 카드 1장만 (카드 여러 장 보관 정책, V037).
  - PortOne 결제라 네이버 IP 차단 무관 → 04:50(기존 새벽 잡과 시간 분리, infra.md).

billing.py(register 첫결제)·payment.py 의 헬퍼를 import 재활용 (재구현 금지):
  _pay_with_billing_key / _extract_card_info / _portone_status / _portone_amount /
  _serialize_portone / extend_paid_until. env_*.py 의 SessionLocal try/finally 패턴 답습.
"""

import logging
import time

from config.plans import PLAN_PRICES
from db.database import SessionLocal
from db.models import BillingKey, CrawlJob, Payment, UserProfile
from routers.billing import (
    _extract_card_info,
    _pay_with_billing_key,
)
from routers.payment import (
    _portone_amount,
    _portone_status,
    _serialize_portone,
)
from services.subscription import extend_paid_until
from utils import utcnow

logger = logging.getLogger(__name__)

# 3일(=결제 시도 3회) 연속 실패하면 자동결제 중단(status='failed'). 사장님 확정(세션 330).
MAX_BILLING_RETRY = 3

# 알림 쿨다운(적대검증 #5) — 대규모 PortOne 장애로 다수 카드가 동시 중단되면 카드마다 알림이
# 발사돼 텔레그램 rate limit 소진 → 진짜 알림 누락. payment.py _ALERT_COOLDOWN_SEC 패턴 답습.
_ALERT_COOLDOWN_SEC = 600  # 같은 종류 알림 10분 1회
_last_alert_at: dict[str, float] = {}


def _alert_billing(message: str, key: str = "billing_stop") -> None:
    """빌링키 결제 알림 — telegram best-effort + key 별 쿨다운(알림 폭주 차단).

    미설정·실패는 삼켜 배치를 깨지 않는다(best-effort, lazy import).
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


def _billing_payment_id(bk: BillingKey) -> str:
    """이번 청구 건의 결정적 멱등 payment_id — 같은 빌링키·같은 청구주기면 항상 동일.

    ⚠ 이중출금 차단(적대검증 #1): payment_id 가 매번 uuid 면 결제 성공 후 commit 실패 시
    다음 배치가 '새' id 로 재청구 → PortOne 이 dedup 못 해 실제 2회 출금. bk.id(빌링키 고유)
    + next_charge_at epoch(이번 청구 주기)로 결정적 생성하면, commit 실패 후 재시도해도 같은
    payment_id → PortOne 이 동일 결제로 dedup(idempotent). 영숫자 32byte 이내(KPN 제약, billing.py:175 답습):
    "b{id}t{epoch}" — id·epoch 십진수라 영숫자, 길이 여유(id<10^9, epoch 10자리 → ~22자).
    """
    epoch = int(bk.next_charge_at.timestamp()) if bk.next_charge_at else 0
    return f"b{bk.id}t{epoch}"


def _charge_one(db, bk: BillingKey) -> str:
    """빌링키 1건 자동결제 — 성공 시 paid_until 연장 + next_charge_at 갱신, 실패 시 retry_count++.

    register 첫결제(billing.py)와 같은 검증·멱등 로직. cron 이라 HTTPException 대신 결과 문자열 반환.
    반환: 'paid' | 'retry' | 'stopped' | 'skipped'.
    """
    # TOCTOU 방어(적대검증 #3): due 스냅샷 로드 후 결제 직전 사이에 사용자가 /register 로 카드를
    # 교체(이 bk 를 is_default=False 로 강등)했을 수 있다. fresh 재확인 후 여전히 유효할 때만 결제.
    db.refresh(bk)
    if bk.status != "active" or not bk.is_default:
        logger.info("[billing] 결제 직전 상태 변경 — 스킵 (user=%s, status=%s, default=%s)",
                    bk.user_id, bk.status, bk.is_default)
        return "skipped"

    plan_meta = PLAN_PRICES.get(bk.plan)
    if not plan_meta:
        # 알 수 없는 plan — 결제 불가, 중단(데이터 오류).
        bk.status = "failed"
        logger.warning("[billing] 알 수 없는 plan=%s (user=%s) → 중단", bk.plan, bk.user_id)
        return "stopped"

    profile = db.get(UserProfile, bk.user_id)
    if not profile:
        bk.status = "failed"
        logger.warning("[billing] 프로필 부재 (user=%s) → 중단", bk.user_id)
        return "stopped"

    amount = plan_meta["amount"]  # 서버 결정
    payment_id = _billing_payment_id(bk)  # 결정적 멱등키 (이중출금 차단)
    # 같은 청구 건이 이미 paid 면(직전 배치 commit 실패 후 PortOne 은 출금됐는데 DB 만 롤백된 경우)
    # 재청구하지 않고 그 결과를 살린다 — DB 자기복구.
    existing = db.get(Payment, payment_id)
    if existing and existing.status == "paid":
        logger.info("[billing] 이미 결제된 청구 건 — DB 동기화만 (user=%s, pid=%s)", bk.user_id, payment_id)
        profile.paid_until = extend_paid_until(profile.paid_until, plan_meta["days"])
        bk.next_charge_at = profile.paid_until
        bk.retry_count = 0
        return "paid"
    if not existing:
        db.add(Payment(payment_id=payment_id, user_id=bk.user_id, plan=bk.plan,
                       amount=amount, status="ready"))
        db.flush()

    try:
        portone_payment = _pay_with_billing_key(
            payment_id, bk.billing_key, plan_meta["order_name"],
            bk.customer_name or "", bk.customer_phone, amount,
        )
    except Exception as e:
        # PortOne 호출 자체 실패(네트워크·SDK) — 일시 실패로 보고 재시도.
        logger.warning("[billing] 결제 호출 실패 (user=%s): %s", bk.user_id, e)
        return _mark_retry(db, bk, payment_id, f"결제 호출 실패: {e}")

    status = _portone_status(portone_payment)
    if status != "PAID":
        # 잔액부족·승인거절·정산지연 등 — 재시도 대상.
        return _mark_retry(db, bk, payment_id, f"결제 미완료 (status={status})")

    paid_amount = _portone_amount(portone_payment)
    if paid_amount is None or paid_amount != amount:
        # 금액 불일치(위변조·오류) — 재시도 무의미(payment.py PermanentGrantError 정책 일치, 적대검증 #2).
        # retry 로 두면 매일 환불 없이 재출금하므로 즉시 영구중단 + 알림.
        db.query(Payment).filter(
            Payment.payment_id == payment_id, Payment.status == "ready",
        ).update({"status": "failed"}, synchronize_session=False)
        bk.status = "failed"
        logger.warning("[billing] 금액 불일치(기대=%s, 실제=%s) → 영구중단 (user=%s)",
                       amount, paid_amount, bk.user_id)
        _alert_billing(
            f"[BILLING] 자동결제 금액 불일치 → 중단 "
            f"(user={bk.user_id}, plan={bk.plan}, 기대={amount}, 실제={paid_amount})"
        )
        return "stopped"

    # 결제 성공 — Payment paid 전이 + paid_until 연장 + next_charge_at 갱신 + retry 리셋.
    db.query(Payment).filter(
        Payment.payment_id == payment_id, Payment.status == "ready",
    ).update({"status": "paid", "paid_at": utcnow(),
              "raw": _serialize_portone(portone_payment)}, synchronize_session=False)

    profile.paid_until = extend_paid_until(profile.paid_until, plan_meta["days"])
    bk.next_charge_at = profile.paid_until  # 다음 자동결제 = 새 만료일 (UTC aware)
    bk.retry_count = 0
    # 카드 정보 최신화(재발급 등으로 바뀌었을 수 있음 — best-effort).
    card_name, card_last4 = _extract_card_info(portone_payment)
    if card_name:
        bk.card_name = card_name
    if card_last4:
        bk.card_last4 = card_last4
    logger.info("[billing] 자동결제 성공 (user=%s, plan=%s, ~%s)", bk.user_id, bk.plan,
                profile.paid_until)
    return "paid"


def _mark_retry(db, bk: BillingKey, payment_id: str, reason: str) -> str:
    """결제 실패 — Payment failed 박고 retry_count++. MAX 도달 시 status='failed' 중단 + 알림."""
    db.query(Payment).filter(
        Payment.payment_id == payment_id, Payment.status == "ready",
    ).update({"status": "failed"}, synchronize_session=False)
    bk.retry_count = (bk.retry_count or 0) + 1
    if bk.retry_count >= MAX_BILLING_RETRY:
        bk.status = "failed"
        logger.warning("[billing] %d회 연속 실패 → 자동결제 중단 (user=%s): %s",
                       bk.retry_count, bk.user_id, reason)
        _alert_billing(
            f"[BILLING] 자동결제 {bk.retry_count}회 연속 실패 → 중단 "
            f"(user={bk.user_id}, plan={bk.plan}): {reason}"
        )
        return "stopped"
    # 다음날 재시도 — next_charge_at 은 그대로 둬 다음 배치가 다시 집음(<=now 유지).
    logger.info("[billing] 결제 실패 retry %d/%d (user=%s): %s",
                bk.retry_count, MAX_BILLING_RETRY, bk.user_id, reason)
    return "retry"


def charge_due_billing_keys(batch_size: int = 500, scheduler_job_id: str | None = None):
    """결제할 때가 된 활성 기본 빌링키를 자동결제 (스케줄러 잡 진입점).

    env_*.py 의 SessionLocal try/finally 패턴 답습. 각 빌링키를 개별 try 로 격리해
    1건 실패가 배치 전체를 멈추지 않게 한다(env_crime.py 개별 try/except 답습).

    관찰성(적대검증 #4): CrawlJob 을 기록해 monitor.py 가 결제 실패·중단을 볼 수 있게 한다
    (service_metrics.py CrawlJob 패턴 답습). retry/stopped 가 있으면 job 메타에 남긴다.
    """
    db = SessionLocal()
    job = CrawlJob(
        job_type="billing_charge",
        scheduler_job_id=scheduler_job_id,
        status="running",
        started_at=utcnow(),
    )
    db.add(job)
    db.commit()

    counts = {"paid": 0, "retry": 0, "stopped": 0, "skipped": 0}
    try:
        now = utcnow()
        due = db.query(BillingKey).filter(
            BillingKey.status == "active",
            BillingKey.is_default.is_(True),
            BillingKey.next_charge_at.isnot(None),
            BillingKey.next_charge_at <= now,
        ).limit(batch_size).all()

        for bk in due:
            try:
                result = _charge_one(db, bk)
                counts[result] = counts.get(result, 0) + 1
                db.commit()  # 1건씩 커밋 — 한 건 롤백이 다른 건에 영향 없게
            except Exception as e:
                db.rollback()
                logger.error("[billing] 자동결제 처리 중 예외 (user=%s): %s", bk.user_id, e)
                counts["skipped"] += 1

        # job 마감 — total=대상수, processed=성공수. 실패·중단·스킵은 error 메시지로 남겨 monitor 가시.
        job.status = "completed"
        job.total_items = len(due)
        job.processed_items = counts["paid"]
        job.completed_at = utcnow()
        problems = counts["retry"] + counts["stopped"] + counts["skipped"]
        if problems:
            job.error_message = (
                f"재시도 {counts['retry']}, 중단 {counts['stopped']}, 스킵 {counts['skipped']}"
            )
        db.commit()
        logger.info("[billing] 자동결제 완료 — 성공 %d, 재시도 %d, 중단 %d, 스킵 %d",
                    counts["paid"], counts["retry"], counts["stopped"], counts["skipped"])
    except Exception as e:
        db.rollback()
        job.status = "failed"
        job.error_message = str(e)[:500]
        job.completed_at = utcnow()
        db.commit()
        logger.error("[billing] 자동결제 배치 실패: %s", e)
    finally:
        db.close()
