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
    """CrawlJob 실패 기록"""
    db.rollback()
    job.status = "failed"
    job.error_message = error[:500]
    job.completed_at = utcnow()
    db.commit()


def _is_skip_day() -> bool:
    """매월 10일 토요일 — mibunyang building-info 쿼터 충돌 방지"""
    today = date.today()
    return today.day == 10 and today.weekday() == 5
