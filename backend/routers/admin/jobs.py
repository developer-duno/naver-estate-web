"""관리자 크롤작업 + 통계 라우트"""

import logging
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import Depends, HTTPException, Query
from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from auth.audit import log_action
from db.models import Article, Complex, CrawlJob, UserProfile
from deps import get_admin_user, get_db

from ._shared import router

logger = logging.getLogger(__name__)


def _safe_fill_rate(filled: int, total: int) -> float | None:
    """채움률 계산 — 모집단 0건이면 None 반환.

    None 반환 = FE 가 "—" 표시 (데이터 없음 / backend 옛 코드 가동 구별 가능).
    0.0 반환 = FE 가 "0.00%" 표시 (실제 0% 채움률).
    세션 230 박제 [[feedback-multi-field-fill-silent]] 답습.
    """
    if not total:
        return None
    return round(filled / total, 4)


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
        # running 필터에는 stale(유령) 1시간 컷오프 적용 — recrawl/status와 동일 정책
        if status == "running":
            stale_cutoff = datetime.now(timezone.utc) - timedelta(hours=1)
            conditions.append(CrawlJob.started_at >= stale_cutoff)

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


@router.get("/crawl-failures")
def list_crawl_failures(
    hours: int = Query(24, ge=1, le=720),
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user),
):
    """최근 N시간(기본 24h) 동안 실패한 크롤 잡을 job_type 별로 집계.

    응답 예: { "window_hours": 24, "total": 12,
              "items": [{ "job_type": "complex_articles", "count": 8,
                          "last_error": "...", "last_failed_at": "..." }] }
    """
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)

    # job_type 별 집계 (count + 가장 최근 실패 정보)
    rows = db.execute(
        select(
            CrawlJob.job_type,
            func.count(CrawlJob.id).label("count"),
            func.max(CrawlJob.completed_at).label("last_failed_at"),
        )
        .where(
            and_(
                CrawlJob.status == "failed",
                CrawlJob.created_at >= cutoff,
            )
        )
        .group_by(CrawlJob.job_type)
        .order_by(func.count(CrawlJob.id).desc())
    ).all()

    items = []
    total = 0
    for r in rows:
        # 해당 job_type 의 가장 최근 실패 1건에서 error_message 가져오기
        last = db.execute(
            select(CrawlJob.error_message)
            .where(
                and_(
                    CrawlJob.status == "failed",
                    CrawlJob.created_at >= cutoff,
                    CrawlJob.job_type == r.job_type,
                )
            )
            .order_by(CrawlJob.completed_at.desc().nullslast(), CrawlJob.created_at.desc())
            .limit(1)
        ).scalar()
        items.append(
            {
                "job_type": r.job_type,
                "count": int(r.count),
                "last_error": (last[:200] if last else None),
                "last_failed_at": r.last_failed_at.isoformat() if r.last_failed_at else None,
            }
        )
        total += int(r.count)

    return {"window_hours": hours, "total": total, "items": items}


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


@router.post("/crawl-jobs/{job_id}/pause")
def pause_crawl_job(
    job_id: int,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user),
):
    """running 상태 잡을 paused 로 전환.

    원자성: SQLAlchemy UPDATE ... WHERE status='running' 으로 race 차단.
    """
    job = db.get(CrawlJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다")
    if job.status != "running":
        raise HTTPException(
            status_code=409,
            detail=f"일시정지 불가 — 현재 상태: {job.status}",
        )
    job.status = "paused"
    log_action(db, admin["user_id"], "admin_crawl_pause", "crawl_job", str(job_id))
    db.commit()
    return {"status": "paused"}


@router.post("/crawl-jobs/{job_id}/resume")
def resume_crawl_job(
    job_id: int,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user),
):
    """paused 상태 잡을 pending 으로 복원 (스케줄러가 다음 라운드에 픽업)."""
    job = db.get(CrawlJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다")
    if job.status != "paused":
        raise HTTPException(
            status_code=409,
            detail=f"재개 불가 — 현재 상태: {job.status}",
        )
    job.status = "pending"
    log_action(db, admin["user_id"], "admin_crawl_resume", "crawl_job", str(job_id))
    db.commit()
    return {"status": "pending"}


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

    # 오늘 크롤 수 — 한국 사용자가 보는 화면이라 '오늘'은 KST 자정 기준
    # (UTC 자정이면 KST 오전 9시에야 리셋돼 하루가 어긋난다)
    # ⚠ 쿼리 바인딩은 반드시 UTC 로 변환 — created_at 저장값이 UTC(utcnow)라
    #   CI SQLite 의 ISO 문자열 비교에서 오프셋 표기가 어긋나면 결과가 틀어진다
    # ⚠ microsecond=0 은 필수 — 소수부가 남으면 SQLite 바인딩 문자열에 '.xxxxxx' 가 붙어
    #   저장 포맷(소수부 없음)과의 문자열 비교가 어긋난다 (제약: 지우지 말 것)
    kst_midnight = datetime.now(ZoneInfo("Asia/Seoul")).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    today_start = kst_midnight.astimezone(timezone.utc)
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

    # 채움률 3건 (PR 6a)
    # `func.count().filter()` = PostgreSQL FILTER + SQLite CASE WHEN SQLAlchemy 자동 변환
    # 인덱스 부재 풀스캔 발생하나 admin 빈도 낮음 (1~3명) → 허용
    complex_detail_filled = db.execute(
        select(func.count()).select_from(Complex).where(Complex.detail_crawled_at.isnot(None))
    ).scalar() or 0
    article_detail_filled = db.execute(
        select(func.count()).select_from(Article).where(
            and_(Article.detail_crawled == True, Article.is_active == True)
        )
    ).scalar() or 0
    complex_metric_filled = db.execute(
        select(func.count()).select_from(Complex).where(
            and_(
                Complex.nearby_median_price.isnot(None),
                Complex.jeonse_rate.isnot(None),
                Complex.recent_trades_6m.isnot(None),
            )
        )
    ).scalar() or 0

    return {
        "complex_count": complex_count,
        "article_count": article_count,
        "total_article_count": total_article_count,
        "active_article_count": article_count,
        "user_count": user_count,
        "today_crawl_count": today_crawl_count,
        "error_count_24h": error_count,
        "complex_detail_fill_rate": _safe_fill_rate(complex_detail_filled, complex_count),
        "article_detail_fill_rate": _safe_fill_rate(article_detail_filled, article_count),
        "complex_metric_fill_rate": _safe_fill_rate(complex_metric_filled, complex_count),
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
