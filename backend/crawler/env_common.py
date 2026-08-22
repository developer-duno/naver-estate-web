"""환경 데이터 수집 공통 헬퍼 — CrawlJob 기록 + 쿼터 보호"""

import logging
from datetime import date

from sqlalchemy import inspect

from db.mb_models import Infra
from db.models import CrawlJob
from utils import utcnow

logger = logging.getLogger(__name__)


def _prefetch_infra_map(db, apt_ids: list[str]) -> dict[str, Infra]:
    """Infra 일괄 prefetch — 루프 내 db.get() 라운드트립 제거 (Supabase pooler 7분 timeout 대응).

    env_air/childcare/crime/emergency 5곳 동일 패턴 답습. apt_ids 비면 빈 dict."""
    if not apt_ids:
        return {}
    return {
        obj.apartment_id: obj
        for obj in db.query(Infra).filter(Infra.apartment_id.in_(apt_ids)).all()
    }


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

    추가 배경(세션 378): 그 폴백조차 동반 사망한 사례 — db.rollback() 이 job 인스턴스
    속성을 만료시킨 뒤 commit 이 QueryCanceled 로 실패해 세션이 pending-rollback 이 되면,
    except 안의 `job.id` 접근이 깨진 세션에 lazy-load SELECT 를 발사해 PendingRollbackError
    로 죽었다(fail_job_safely 도달 전 탈출 → job 45197 running 영구 잔존).
    그래서 job id 는 진입 즉시 **DB 왕복 없이** identity 로 확보한다.
    """
    # inspect(job).identity 는 인스턴스 상태에 이미 있어 만료·detach·깨진 세션과 무관.
    # (단순 job.id 는 만료 상태면 lazy-load 를 쏘므로 진입 시점에도 안전하지 않다)
    identity = inspect(job).identity
    job_id = identity[0] if identity else None

    try:
        db.rollback()
        job.status = "failed"
        job.error_message = (error or "")[:500]
        job.completed_at = utcnow()
        db.commit()
    except Exception:
        # 세션이 깨졌을 때(연결 끊김) — 새 SessionLocal 로 확실히 failed 마킹
        from crawler.service_common import fail_job_safely

        logger.warning("[env] _fail_job 같은-세션 실패 → fail_job_safely 폴백 (job_id=%s)", job_id)
        if job_id is None:
            # transient(미커밋) 인스턴스 — 새 세션으로 찾을 대상 자체가 없다.
            # 실전에선 _record_job 이 commit 후 반환하므로 사실상 도달 불가.
            logger.warning("[env] _fail_job job_id 미확보 — fail_job_safely 폴백 스킵")
            return
        fail_job_safely(job_id, error)


def _is_skip_day() -> bool:
    """매월 10일 토요일 — mibunyang building-info 쿼터 충돌 방지"""
    today = date.today()
    return today.day == 10 and today.weekday() == 5
