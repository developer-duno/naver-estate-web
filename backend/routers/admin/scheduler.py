"""관리자 스케줄러 모니터링 라우트"""

import logging
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from db.models import CrawlJob
from deps import get_admin_user, get_db

from ._shared import router

# 에러율 차트에서 집계할 status 값 (crawl_jobs 테이블 실측 기준)
_ERROR_STATS_STATUSES = ("completed", "failed", "paused", "pending", "running", "cancelled")

logger = logging.getLogger(__name__)

# 스케줄러 작업 메타데이터 (이름/스케줄/환경변수 이름)
SCHEDULER_JOB_META: dict[str, dict] = {
    "discover_regions": {"name": "전국 단지 발견", "schedule": "주 1회 일요일 03:00", "env": None},
    "crawl_articles": {"name": "매물 수집 배치", "schedule": "12시간마다", "env": None},
    "crawl_details": {"name": "매물 상세 보강", "schedule": "4시간마다", "env": None},
    "collect_prices": {"name": "시세 이력 수집", "schedule": "주 1회 수요일 04:00", "env": None},
    "popular_1030": {"name": "인기 단지 크롤링 10:45", "schedule": "매일 10:45", "env": "POPULAR_CRAWL_ENABLED", "env_default": "true"},
    "popular_1430": {"name": "인기 단지 크롤링 14:45", "schedule": "매일 14:45", "env": "POPULAR_CRAWL_ENABLED", "env_default": "true"},
    "popular_1900": {"name": "인기 단지 크롤링 19:15", "schedule": "매일 19:15", "env": "POPULAR_CRAWL_ENABLED", "env_default": "true"},
    "collect_public_trades": {"name": "공공데이터 실거래가", "schedule": "주 1회 토요일 05:00", "env": "PUBLIC_DATA_ENABLED"},
    "backfill_price": {"name": "시세 이력 소급 수집", "schedule": "매일 03:30", "env": "PUBLIC_DATA_ENABLED"},
    "collect_air_quality": {"name": "에어코리아 대기질", "schedule": "매일 02:00", "env": "AIR_QUALITY_ENABLED"},
    "collect_emergency": {"name": "응급의료기관", "schedule": "매월 첫째 월요일 03:00", "env": "EMERGENCY_ENABLED"},
    "collect_childcare": {"name": "어린이집", "schedule": "매월 첫째 목요일 06:00", "env": "CHILDCARE_ENABLED"},
    "collect_crime_stats": {"name": "범죄통계", "schedule": "분기별 첫째 일요일 04:00", "env": "CRIME_STATS_ENABLED"},
    "complex_detail_APT": {"name": "단지 상세 backfill APT", "schedule": "6시간 interval", "env": "COMPLEX_DETAIL_ENABLED", "env_default": "true"},
    "complex_detail_OPST": {"name": "단지 상세 backfill OPST", "schedule": "6시간 interval", "env": "COMPLEX_DETAIL_ENABLED", "env_default": "true"},
    "complex_detail_JGC": {"name": "단지 상세 backfill JGC", "schedule": "주 1회 화요일 07:00", "env": "COMPLEX_DETAIL_ENABLED", "env_default": "true"},
    "complex_detail_ABYG": {"name": "단지 상세 backfill ABYG", "schedule": "주 1회 수요일 07:00", "env": "COMPLEX_DETAIL_ENABLED", "env_default": "true"},
    "complex_detail_OBYG": {"name": "단지 상세 backfill OBYG", "schedule": "주 1회 목요일 07:00", "env": "COMPLEX_DETAIL_ENABLED", "env_default": "true"},
    "collect_metrics": {"name": "단지 가치지표 수집", "schedule": "매일 08:30", "env": "COMPLEX_METRIC_ENABLED", "env_default": "true"},
    "crawler_monitor": {"name": "크롤링 모니터", "schedule": "30분 interval", "env": "MONITOR_ENABLED"},
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
            env_default = meta.get("env_default", "false")
            enabled = os.getenv(env_key, env_default).lower() == "true"

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


@router.get("/error-stats")
def get_error_stats(
    days: int = Query(14, description="조회 기간 (일)"),
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user),
):
    """최근 N일 crawl_jobs 의 일자별 status 분포.

    days 는 7/14/30 만 허용. 응답 형식:
    [{date: "2026-04-15", completed: 12, failed: 1, paused: 0, ...}, ...]

    날짜는 KST 기준, 빈 날도 0으로 채워 반환 (차트 연속성).
    """
    if days not in (7, 14, 30):
        raise HTTPException(status_code=422, detail="days 는 7, 14, 30 중 하나여야 합니다")
    now_utc = datetime.now(timezone.utc)
    cutoff = now_utc - timedelta(days=days)

    # PostgreSQL / SQLite 공통 동작을 위해 Python 측에서 KST 변환 후 집계
    rows = (
        db.query(
            CrawlJob.created_at,
            CrawlJob.status,
        )
        .filter(CrawlJob.created_at >= cutoff)
        .all()
    )

    kst = timezone(timedelta(hours=9))
    buckets: dict[str, dict[str, int]] = {}
    for created_at, status in rows:
        if created_at is None:
            continue
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)
        day_key = created_at.astimezone(kst).strftime("%Y-%m-%d")
        if day_key not in buckets:
            buckets[day_key] = {s: 0 for s in _ERROR_STATS_STATUSES}
        buckets[day_key][status] = buckets[day_key].get(status, 0) + 1

    # 빈 날도 0으로 채움 (cutoff ~ today)
    out: list[dict] = []
    today_kst = now_utc.astimezone(kst).date()
    for i in range(days, -1, -1):
        d = (today_kst - timedelta(days=i)).strftime("%Y-%m-%d")
        stats = buckets.get(d, {s: 0 for s in _ERROR_STATS_STATUSES})
        out.append({"date": d, **stats})

    return {"days": days, "rows": out}
