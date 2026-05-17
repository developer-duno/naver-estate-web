"""크롤링 수집기 모니터 — 장애 감지 + 쿨다운 + 텔레그램 알림.

APScheduler 의 monitor job 이 주기적으로 run_monitor() 를 호출한다.
감지 신호 3종: 작업 실패 / 작업 마비 / 데이터 미축적.
설계 = docs/superpowers/specs/2026-05-18-crawler-telegram-monitoring-design.md
"""

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import and_, func, select

from db.models import CrawlJob
from routers.admin.freshness import compute_freshness

logger = logging.getLogger(__name__)

# 작업 마비 판정 — running 인 채 이 시간 넘으면 stale
_STALE_HOURS = 1
# 실패 작업 조회 윈도 — 최근 이 시간 내 failed 만
_FAILED_WINDOW_HOURS = 24


def detect_issues(db) -> list[dict]:
    """현재 크롤링 장애를 감지해 리스트로 반환.

    각 항목: {"alert_key": str, "detail": str}
    alert_key 는 장애 종류 식별자 — monitor_alerts 쿨다운 키.
    """
    now = datetime.now(timezone.utc)
    issues: list[dict] = []

    # 1. 작업 실패 — 최근 24h failed job_type 별
    cutoff = now - timedelta(hours=_FAILED_WINDOW_HOURS)
    failed = db.execute(
        select(
            CrawlJob.job_type,
            func.count(CrawlJob.id).label("cnt"),
            func.max(CrawlJob.error_message).label("err"),
        )
        .where(and_(CrawlJob.status == "failed", CrawlJob.created_at >= cutoff))
        .group_by(CrawlJob.job_type)
    ).all()
    for row in failed:
        issues.append({
            "alert_key": f"crawl_failed:{row.job_type}",
            "detail": f"{row.job_type} 작업 {row.cnt}건 실패 — {(row.err or '')[:200]}",
        })

    # 2. 작업 마비 — running 인 채 _STALE_HOURS 초과
    stale_cutoff = now - timedelta(hours=_STALE_HOURS)
    stale = db.execute(
        select(CrawlJob.job_type, func.count(CrawlJob.id).label("cnt"))
        .where(and_(CrawlJob.status == "running", CrawlJob.started_at < stale_cutoff))
        .group_by(CrawlJob.job_type)
    ).all()
    for row in stale:
        issues.append({
            "alert_key": f"crawl_stale:{row.job_type}",
            "detail": f"{row.job_type} 작업 {row.cnt}건이 1시간 넘게 running 상태 — 마비 의심",
        })

    # 3. 데이터 미축적 — 신선도 red 종목
    try:
        fresh = compute_freshness(db)
        for item in fresh["items"]:
            if item["status"] == "red":
                issues.append({
                    "alert_key": f"freshness:{item['key']}",
                    "detail": f"{item['label']} 데이터 미축적 (신선도 red, 마지막 갱신 {item['last_updated']})",
                })
    except Exception:
        logger.warning("[monitor] 신선도 계산 실패 — 이번 스캔 skip", exc_info=True)

    return issues
