"""관리자 크롤작업 + 통계 라우트"""

import logging
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Query
from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from auth.audit import log_action
from db.models import Article, Complex, CrawlJob, UserProfile
from deps import get_admin_user, get_db

from ._shared import router

logger = logging.getLogger(__name__)


@router.get("/crawl-jobs")
def list_crawl_jobs(
    status: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user),
):
    """크롤 작업 목록"""
    conditions = []
    if status:
        conditions.append(CrawlJob.status == status)

    where = and_(*conditions) if conditions else True
    total = db.execute(select(func.count()).select_from(CrawlJob).where(where)).scalar() or 0

    stmt = (
        select(CrawlJob)
        .where(where)
        .order_by(CrawlJob.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    jobs = db.execute(stmt).scalars().all()

    return {
        "items": [
            {
                "id": j.id,
                "job_type": j.job_type,
                "target_id": j.target_id,
                "status": j.status,
                "total_items": j.total_items,
                "processed_items": j.processed_items,
                "error_message": j.error_message,
                "started_at": j.started_at.isoformat() if j.started_at else None,
                "completed_at": j.completed_at.isoformat() if j.completed_at else None,
                "created_at": j.created_at.isoformat() if j.created_at else None,
            }
            for j in jobs
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.post("/crawl-jobs/{job_id}/cancel")
def cancel_crawl_job(
    job_id: int,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user),
):
    """크롤 작업 취소"""
    job = db.get(CrawlJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다")
    if job.status not in ("pending", "running"):
        raise HTTPException(status_code=400, detail="취소할 수 없는 상태입니다")

    job.status = "cancelled"
    job.completed_at = datetime.now(timezone.utc)
    log_action(db, admin["user_id"], "admin_crawl_cancel", "crawl_job", str(job_id))
    db.commit()
    return {"status": "cancelled"}


@router.get("/stats/detailed")
def get_detailed_stats(
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user),
):
    """상세 통계 (관리자용)"""
    complex_count = db.execute(select(func.count()).select_from(Complex)).scalar() or 0
    article_count = db.execute(
        select(func.count()).select_from(Article).where(Article.is_active == True)
    ).scalar() or 0
    total_article_count = db.execute(select(func.count()).select_from(Article)).scalar() or 0
    user_count = db.execute(select(func.count()).select_from(UserProfile)).scalar() or 0

    # 오늘 크롤 수
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    today_crawl_count = db.execute(
        select(func.count()).select_from(CrawlJob).where(CrawlJob.created_at >= today_start)
    ).scalar() or 0

    # 24시간 에러 수
    yesterday = datetime.now(timezone.utc) - timedelta(hours=24)
    error_count = db.execute(
        select(func.count()).select_from(CrawlJob).where(
            and_(CrawlJob.status == "failed", CrawlJob.created_at >= yesterday)
        )
    ).scalar() or 0

    # 최근 5개 크롤 작업
    recent_jobs = db.execute(
        select(CrawlJob).order_by(CrawlJob.created_at.desc()).limit(5)
    ).scalars().all()

    # 마지막 크롤 시각
    last_crawl = db.execute(
        select(func.max(CrawlJob.completed_at)).where(CrawlJob.status == "completed")
    ).scalar()

    return {
        "complex_count": complex_count,
        "article_count": article_count,
        "total_article_count": total_article_count,
        "active_article_count": article_count,
        "user_count": user_count,
        "today_crawl_count": today_crawl_count,
        "error_count_24h": error_count,
        "last_crawl_at": last_crawl.isoformat() if last_crawl else None,
        "recent_crawl_jobs": [
            {
                "id": j.id,
                "job_type": j.job_type,
                "target_id": j.target_id,
                "status": j.status,
                "total_items": j.total_items,
                "processed_items": j.processed_items,
                "error_message": j.error_message,
                "started_at": j.started_at.isoformat() if j.started_at else None,
                "completed_at": j.completed_at.isoformat() if j.completed_at else None,
                "created_at": j.created_at.isoformat() if j.created_at else None,
            }
            for j in recent_jobs
        ],
    }
