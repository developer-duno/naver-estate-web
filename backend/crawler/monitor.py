"""크롤링 수집기 모니터 — 장애 감지 + 쿨다운 + 텔레그램 알림.

APScheduler 의 monitor job 이 주기적으로 run_monitor() 를 호출한다.
감지 신호 3종: 작업 실패 / 작업 마비 / 데이터 미축적.
설계 = docs/superpowers/specs/2026-05-18-crawler-telegram-monitoring-design.md
"""

import logging
import os
from datetime import datetime, timedelta, timezone

from sqlalchemy import and_, func, select

from db.models import CrawlJob, MonitorAlert
from routers.admin.freshness import compute_freshness
from services.telegram import send_telegram
from utils import utcnow

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
            "detail": f"{row.job_type} 작업 {row.cnt}건이 {_STALE_HOURS}시간 넘게 running 상태 — 마비 의심",
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


def _cooldown_hours() -> int:
    """쿨다운 시간 (기본 6h)."""
    return int(os.getenv("MONITOR_COOLDOWN_HOURS", "6"))


def run_monitor(db) -> None:
    """장애 감지 → monitor_alerts 대조 → 쿨다운 적용 → 텔레그램 발송.

    APScheduler monitor job 이 주기적으로 호출. 예외는 자체 흡수.
    """
    try:
        issues = detect_issues(db)
    except Exception:
        logger.warning("[monitor] 장애 감지 실패", exc_info=True)
        return

    now = utcnow()
    current_keys = {i["alert_key"] for i in issues}
    cooldown = timedelta(hours=_cooldown_hours())

    # 1. 현재 장애 — 신규 발송 / 쿨다운 억제
    for issue in issues:
        key = issue["alert_key"]
        alert = db.execute(
            select(MonitorAlert).where(MonitorAlert.alert_key == key)
        ).scalar_one_or_none()

        if alert is None:
            # 신규 장애 — 발송 성공 시에만 last_notified 기록
            sent = send_telegram(f"⚠ 크롤링 장애\n{issue['detail']}")
            db.add(MonitorAlert(
                alert_key=key, status="active",
                detail=issue["detail"],
                last_notified=now if sent else None,
            ))
        elif alert.status == "resolved":
            # 해소됐던 장애 재발 — 발송 성공 시에만 last_notified 갱신
            sent = send_telegram(f"⚠ 크롤링 장애 재발\n{issue['detail']}")
            alert.status = "active"
            alert.detail = issue["detail"]
            if sent:
                alert.last_notified = now
        else:
            # 진행 중 장애 — 쿨다운 확인
            last = alert.last_notified
            # SQLite 는 DateTime(timezone=True) 라도 naive 로 돌려줄 수 있어
            # tz-aware now 와 빼면 에러 → freshness._to_utc 와 동일하게 보정
            if last is not None and last.tzinfo is None:
                last = last.replace(tzinfo=timezone.utc)
            if last is None or (now - last) >= cooldown:
                if send_telegram(f"⚠ 크롤링 장애 지속\n{issue['detail']}"):
                    alert.last_notified = now
            alert.detail = issue["detail"]

    # 2. 해소된 장애 — 이번 스캔에 없는 active 행
    actives = db.execute(
        select(MonitorAlert).where(MonitorAlert.status == "active")
    ).scalars().all()
    for alert in actives:
        if alert.alert_key not in current_keys:
            # 복구 알림 성공 시에만 resolved 처리 — 실패 시 다음 스캔 재시도
            if send_telegram(f"✅ 크롤링 복구\n{alert.alert_key} — 정상으로 돌아왔습니다."):
                alert.status = "resolved"

    db.commit()
