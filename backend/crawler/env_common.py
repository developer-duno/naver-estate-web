"""환경 데이터 수집 공통 헬퍼 — CrawlJob 기록 + 쿼터 보호"""

import logging
from datetime import date

from db.models import CrawlJob
from utils import utcnow

logger = logging.getLogger(__name__)


def _record_job(db, job_type: str, scheduler_job_id: str) -> CrawlJob:
    """CrawlJob 레코드 생성 — 수집 시작 기록"""
    job = CrawlJob(
        job_type=job_type,
        scheduler_job_id=scheduler_job_id,
        status="running",
        started_at=utcnow(),
    )
    db.add(job)
    db.commit()
    return job


def _complete_job(db, job: CrawlJob, collected: int, failed: int):
    """CrawlJob 완료 기록"""
    job.status = "completed"
    job.processed_items = collected
    job.total_items = collected + failed
    job.completed_at = utcnow()
    db.commit()


def _fail_job(db, job: CrawlJob, error: str):
    """CrawlJob 실패 기록 — 깨진 세션 대비 새 세션 폴백 (세션278 H1).

    배경(세션266): outer except 에서 같은 세션으로 db.rollback()/db.commit() 하다가
    연결이 끊긴 상태(SSL closed / OperationalError)면 그 호출이 또 예외를 던져 except 를
    빠져나가 job 이 status='running' 인 채 영원히 남았다(5/31 11시간 실측). 네이버 크롤러
    5종은 fail_job_safely(새 SessionLocal)로 이미 보호됐으나 환경데이터 4종은 미적용이었다.

    같은 세션 마킹을 먼저 시도하고, 실패하면 fail_job_safely 로 새 세션 폴백한다.
    """
    try:
        db.rollback()
        job.status = "failed"
        job.error_message = (error or "")[:500]
        job.completed_at = utcnow()
        db.commit()
    except Exception:
        # 세션이 깨졌을 때(연결 끊김) — 새 SessionLocal 로 확실히 failed 마킹
        from crawler.service_common import fail_job_safely

        logger.warning("[env] _fail_job 같은-세션 실패 → fail_job_safely 폴백 (job_id=%s)", job.id)
        fail_job_safely(job.id, error)


def _is_skip_day() -> bool:
    """매월 10일 토요일 — mibunyang building-info 쿼터 충돌 방지"""
    today = date.today()
    return today.day == 10 and today.weekday() == 5
