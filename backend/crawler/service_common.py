"""크롤링 서비스 공통 헬퍼 — 시세 upsert + 체크포인트

service_price, service_public에서 공유하는 함수/상태.
"""

import logging

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from crawler.utils import CheckpointManager
from db.models import ComplexPriceHistory
from utils import utcnow

logger = logging.getLogger(__name__)

# 배치 진행 체크포인트 (service_price + service_public 공유)
_checkpoint = CheckpointManager(checkpoint_interval=5)


def fail_job_safely(job_id: int, error_message: str) -> bool:
    """크롤 작업을 'failed' 로 확실히 마킹 — 깨진 세션 대비 새 세션 사용.

    배경(세션 266): except 블록에서 같은 세션으로 db.rollback()/db.commit() 하다가
    연결이 끊긴 상태(SSL closed / OperationalError)면 그 호출이 또 예외를 던져
    except 를 빠져나가 job 이 status='running' 인 채 영원히 남았다. 그러면 모니터가
    '1시간 넘게 running'(마비) 오탐을 내고, 서버 재시작 때야 sweep 으로 정리됐다
    (5/31 39,585초 = 11시간 running 실측).

    이 헬퍼는 호출자의 깨진 세션과 무관하게 **새 SessionLocal** 로 job 을 failed 로
    마킹한다. race guard(_finalize_job)와 동일하게 현재 status='running' 일 때만 덮어쓴다.
    반환: 마킹 성공 True, 실패/skip False (best-effort — 실패해도 예외 전파 안 함).
    """
    from db.database import SessionLocal
    from db.models import CrawlJob

    fresh = SessionLocal()
    try:
        job = fresh.get(CrawlJob, job_id)
        if job is None or job.status != "running":
            return False
        job.status = "failed"
        job.error_message = (error_message or "")[:500]
        job.completed_at = utcnow()
        fresh.commit()
        return True
    except Exception:
        logger.warning("fail_job_safely 실패 (job_id=%s)", job_id, exc_info=True)
        return False
    finally:
        fresh.close()


def _extract_price_list(result: dict) -> list[dict]:
    """네이버 API 시세 응답에서 가격 리스트 추출 (응답 형식 호환)

    marketPrices는 주간(YYYYMMDD) 데이터를 반환. 전체를 그대로 반환하여 누적 저장.
    """
    # 형식 1: marketPrices (현재 API) — 주간 데이터 그대로 유지
    if "marketPrices" in result:
        prices = []
        for p in result["marketPrices"]:
            base_day = p.get("baseYearMonthDay", "")
            if not base_day:
                continue
            # upperPriceLimit 등은 API가 tradeType에 맞게 세팅한 값 (A1=매매, B1=전세)
            # deal* 필드는 항상 매매값이므로 사용 금지
            prices.append({
                "baseMonth": base_day,  # YYYYMMDD 주간 단위
                "upperPrice": p.get("upperPriceLimit"),
                "lowerPrice": p.get("lowPriceLimit"),
                "averagePrice": p.get("averagePriceLimit"),
                "areaNo": result.get("areaNo"),
            })
        return prices
    # 형식 2: realEstatePrice (레거시)
    return result.get("realEstatePrice") or result.get("prices") or []


def _upsert_price_history(
    db: Session,
    complex_no: str,
    trade_type: str,
    area_no: str | None,
    price_upper: int | None,
    price_lower: int | None,
    price_avg: int | None,
    base_month: str,
):
    """시세 이력 upsert — PostgreSQL ON CONFLICT (원자적)"""
    area_key = area_no or ""
    values = dict(
        complex_no=complex_no,
        trade_type=trade_type,
        area_no=area_key,
        price_upper=price_upper,
        price_lower=price_lower,
        price_avg=price_avg,
        base_month=base_month,
        recorded_at=utcnow(),
    )
    stmt = pg_insert(ComplexPriceHistory).values(**values)
    stmt = stmt.on_conflict_do_update(
        constraint="complex_price_history_upsert_key",
        set_={
            "price_upper": stmt.excluded.price_upper,
            "price_lower": stmt.excluded.price_lower,
            "price_avg": stmt.excluded.price_avg,
            "recorded_at": stmt.excluded.recorded_at,
        },
    )
    db.execute(stmt)
