"""관리자 스케줄러 모니터링 라우트"""

import logging
from datetime import datetime, timedelta, timezone

from fastapi import Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from db.models import CrawlJob
from deps import get_admin_user, get_db

from ._shared import router

logger = logging.getLogger(__name__)

# 스케줄러 작업 메타데이터 (이름/스케줄/환경변수 이름)
SCHEDULER_JOB_META: dict[str, dict] = {
    "discover_regions": {"name": "전국 단지 발견", "schedule": "주 1회 일요일 03:00", "env": None},
    "crawl_articles": {"name": "매물 수집 배치", "schedule": "12시간마다", "env": None},
    "crawl_details": {"name": "매물 상세 보강", "schedule": "4시간마다", "env": None},
    "collect_prices": {"name": "시세 이력 수집", "schedule": "주 1회 수요일 04:00", "env": None},
    "popular_1030": {"name": "인기 단지 크롤링 10:30", "schedule": "매일 10:30", "env": "POPULAR_CRAWL_ENABLED"},
    "popular_1430": {"name": "인기 단지 크롤링 14:30", "schedule": "매일 14:30", "env": "POPULAR_CRAWL_ENABLED"},
    "popular_1900": {"name": "인기 단지 크롤링 19:00", "schedule": "매일 19:00", "env": "POPULAR_CRAWL_ENABLED"},
    "collect_public_trades": {"name": "공공데이터 실거래가", "schedule": "주 1회 토요일 05:00", "env": "PUBLIC_DATA_ENABLED"},
    "collect_air_quality": {"name": "에어코리아 대기질", "schedule": "매일 02:00", "env": "AIR_QUALITY_ENABLED"},
    "collect_emergency": {"name": "응급의료기관", "schedule": "매월 첫째 월요일 03:00", "env": "EMERGENCY_ENABLED"},
    "collect_childcare": {"name": "어린이집", "schedule": "매월 첫째 목요일 06:00", "env": "CHILDCARE_ENABLED"},
    "collect_crime_stats": {"name": "범죄통계", "schedule": "분기별 첫째 일요일 04:00", "env": "CRIME_STATS_ENABLED"},
}


@router.get("/scheduler-status")
def get_scheduler_status(
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user),
):
    """스케줄러 작업별 실행 이력 + 다음 실행 시각 조회"""
    import os

    from crawler.scheduler import get_scheduler

    scheduler = get_scheduler()
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # scheduler_job_id별 최신 실행 레코드 조회
    latest_subq = (
        db.query(
            CrawlJob.scheduler_job_id,
            func.max(CrawlJob.id).label("max_id"),
        )
        .filter(CrawlJob.scheduler_job_id.isnot(None))
        .group_by(CrawlJob.scheduler_job_id)
        .subquery()
    )
    latest_jobs = (
        db.query(CrawlJob)
        .join(latest_subq, CrawlJob.id == latest_subq.c.max_id)
        .all()
    )
    latest_map: dict[str, CrawlJob] = {j.scheduler_job_id: j for j in latest_jobs}

    # 24시간 내 실행/실패 통계
    past_24h = now - timedelta(hours=24)
    stats_rows = (
        db.query(
            CrawlJob.scheduler_job_id,
            CrawlJob.status,
            func.count().label("cnt"),
        )
        .filter(
            CrawlJob.scheduler_job_id.isnot(None),
            CrawlJob.started_at >= past_24h,
        )
        .group_by(CrawlJob.scheduler_job_id, CrawlJob.status)
        .all()
    )
    stats_24h: dict[str, dict] = {}
    for row in stats_rows:
        sid = row.scheduler_job_id
        if sid not in stats_24h:
            stats_24h[sid] = {"runs": 0, "failures": 0}
        stats_24h[sid]["runs"] += row.cnt
        if row.status == "failed":
            stats_24h[sid]["failures"] += row.cnt

    # 오늘 전체 실행/실패 수
    today_total = (
        db.query(func.count())
        .select_from(CrawlJob)
        .filter(CrawlJob.scheduler_job_id.isnot(None), CrawlJob.started_at >= today_start)
        .scalar() or 0
    )
    today_failures = (
        db.query(func.count())
        .select_from(CrawlJob)
        .filter(
            CrawlJob.scheduler_job_id.isnot(None),
            CrawlJob.started_at >= today_start,
            CrawlJob.status == "failed",
        )
        .scalar() or 0
    )

    jobs = []
    for job_id, meta in SCHEDULER_JOB_META.items():
        # 환경변수로 활성화 여부 판단
        env_key = meta["env"]
        enabled = True
        if env_key:
            enabled = os.getenv(env_key, "false").lower() == "true"

        # 마지막 실행 정보
        last = latest_map.get(job_id)
        last_run = None
        if last:
            duration = None
            if last.started_at and last.completed_at:
                duration = round((last.completed_at - last.started_at).total_seconds())
            last_run = {
                "status": last.status,
                "started_at": last.started_at.isoformat() if last.started_at else None,
                "completed_at": last.completed_at.isoformat() if last.completed_at else None,
                "duration_seconds": duration,
                "total_items": last.total_items,
                "processed_items": last.processed_items,
                "error_message": last.error_message,
            }

        # 다음 실행 시각 (스케줄러 인스턴스에서 조회)
        next_run_at = None
        if scheduler:
            sched_job = scheduler.get_job(job_id)
            if sched_job and sched_job.next_run_time:
                next_run_at = sched_job.next_run_time.isoformat()

        jobs.append({
            "scheduler_job_id": job_id,
            "name": meta["name"],
            "schedule": meta["schedule"],
            "enabled": enabled,
            "last_run": last_run,
            "next_run_at": next_run_at,
            "stats_24h": stats_24h.get(job_id, {"runs": 0, "failures": 0}),
        })

    return {
        "jobs": jobs,
        "summary": {
            "total_runs_today": today_total,
            "failures_today": today_failures,
        },
    }
