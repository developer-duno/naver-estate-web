"""크롤링 수집기 모니터 — 장애 감지 + 쿨다운 + 텔레그램 알림.

APScheduler 의 monitor job 이 주기적으로 run_monitor() 를 호출한다.
감지 신호 3종: 작업 실패 / 작업 마비 / 데이터 미축적.
설계 = docs/superpowers/specs/2026-05-18-crawler-telegram-monitoring-design.md
"""

import logging
import os
from datetime import datetime, timedelta, timezone

from sqlalchemy import and_, case, func, select, text

from crawler.alert_format import format_issue_message
from db.models import CrawlJob, MonitorAlert
from routers.admin.freshness import compute_freshness
from services.telegram import send_telegram
from utils import utcnow

logger = logging.getLogger(__name__)

# 작업 마비 판정 — running 인 채 이 시간 넘으면 stale (기본)
_STALE_HOURS = 1
# job_type 별 stale 임계 override (시간) — 정상적으로 오래 도는 잡의 오탐 방지.
# 배경(세션 266): public_trade_data 는 정상 69~105분(실측 4139~6291초) 도는데
# 기본 1h 임계로 "마비" 오탐(5/29 가짜 경보). 정상 최대 소요의 ~2배로 여유.
# 배경(2026-08-15): official_price(공동주택 공시가격, 매월 15일 06:30) 가 이 표에
# 누락돼 8/15 첫 정기 실행(job 43010)이 07:31 오탐 sweep(cancelled + 텔레그램
# "마비 의심" 실발화) — 실제로는 07:55 까지 44,621행 수집 중이었다. 8/10 수동
# 실행 2건(41781·41797)도 동일하게 도중 sweep. 관측 정상 소요 = 청크당 3h36m
# (24,719건·25,475건), 전량 fresh 1패스 약 7.2h → ~2배 여유로 16h.
_STALE_HOURS_BY_TYPE = {
    "public_trade_data": 3,
    "official_price": 16,
}
# 실패 작업 조회 윈도 — 최근 이 시간 내 failed 만
_FAILED_WINDOW_HOURS = 24


def _job_stats(db, job_type: str) -> dict | None:
    """해당 job_type 의 마지막 completed 작업 통계 1건.

    24h 합산이 아니라 마지막 1건만 — completed 여도 처리율이 낮을 수 있어
    합산하면 의미가 섞인다 (실측: public_trades 가 completed 인데 18% 처리).
    """
    row = db.execute(
        select(
            CrawlJob.processed_items,
            CrawlJob.total_items,
            CrawlJob.completed_at,
        )
        .where(and_(CrawlJob.job_type == job_type, CrawlJob.status == "completed"))
        .order_by(CrawlJob.completed_at.desc())
        .limit(1)
    ).first()
    if row is None:
        return None
    return {
        "processed": int(row.processed_items or 0),
        "total": int(row.total_items or 0),
        "completed_at": row.completed_at.isoformat() if row.completed_at else None,
    }


def detect_issues(db) -> list[dict]:
    """현재 크롤링 장애를 감지해 리스트로 반환.

    각 항목: {"alert_key": str, "kind": str, "detail": str, "data": dict}
    alert_key 는 장애 종류 식별자 — monitor_alerts 쿨다운 키.
    detail 은 평문 (MonitorAlert.detail 컬럼 저장용), data 는 메시지 포맷용 구조화 필드.
    """
    now = datetime.now(timezone.utc)
    issues: list[dict] = []

    # 1. 작업 실패 — 최근 24h failed job_type 별
    # err = 같은 job_type 다중 실패 시 사전순 마지막 1건 (최근순 아님 — count 로 다건 표기)
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

    # 1-a. 자가 복구된 job_type 식별 — 마지막 failed 이후 같은 job_type 에 completed 가 있으면
    # 이미 정상 복구된 것으로 간주하고 발화 skip. run_monitor 의 line 215 분기가 자동으로
    # "✅ 크롤링 복구" 텔레그램 알림 + status='resolved' 전이.
    # (배경: 24h 윈도 안에 옛 failed 가 있으면 매 스캔마다 active 유지되어 stale 알림 결함)
    recovery = db.execute(
        select(
            CrawlJob.job_type,
            func.max(case((CrawlJob.status == "failed", CrawlJob.created_at))).label("last_failed"),
            func.max(case((CrawlJob.status == "completed", CrawlJob.created_at))).label("last_completed"),
        )
        .where(CrawlJob.created_at >= cutoff)
        .group_by(CrawlJob.job_type)
    ).all()
    recovered = {
        r.job_type for r in recovery
        if r.last_failed and r.last_completed and r.last_completed > r.last_failed
    }

    for row in failed:
        if row.job_type in recovered:
            continue
        stats = _job_stats(db, row.job_type)
        issues.append({
            "alert_key": f"crawl_failed:{row.job_type}",
            "kind": "crawl_failed",
            "detail": f"{row.job_type} 작업 {row.cnt}건 실패 — {(row.err or '')[:200]}",
            "data": {
                "job_type": row.job_type,
                "count": row.cnt,
                "error": row.err or "",
                "processed": stats["processed"] if stats else None,
                "total": stats["total"] if stats else None,
                "last_completed_at": stats["completed_at"] if stats else None,
            },
        })

    # 2. 작업 마비 — running 인 채 job_type 별 임계 초과
    # 가장 작은 기본 임계(1h)로 후보를 넓게 가져온 뒤 Python 에서 job_type 별 임계로
    # 필터한다. public_trade_data 처럼 정상적으로 오래 도는 잡(69~105분)의 오탐 방지
    # (세션 266: 5/29 정상 80분 잡이 1h 임계로 "마비" 가짜 경보).
    base_cutoff = now - timedelta(hours=_STALE_HOURS)
    stale = db.execute(
        select(
            CrawlJob.job_type,
            func.count(CrawlJob.id).label("cnt"),
            func.min(CrawlJob.started_at).label("oldest"),
        )
        .where(and_(CrawlJob.status == "running", CrawlJob.started_at < base_cutoff))
        .group_by(CrawlJob.job_type)
    ).all()
    for row in stale:
        threshold = _STALE_HOURS_BY_TYPE.get(row.job_type, _STALE_HOURS)
        # oldest 가 job_type 임계를 아직 안 넘었으면 정상 — skip (오탐 방지).
        # SQLite 는 DateTime(timezone=True) 라도 naive 로 돌려줄 수 있어 tz 보정
        # (run_monitor line 224 _to_utc 패턴 답습).
        oldest = row.oldest
        if oldest is not None and oldest.tzinfo is None:
            oldest = oldest.replace(tzinfo=timezone.utc)
        if oldest is not None and oldest >= now - timedelta(hours=threshold):
            continue
        issues.append({
            "alert_key": f"crawl_stale:{row.job_type}",
            "kind": "crawl_stale",
            "detail": f"{row.job_type} 작업 {row.cnt}건이 {threshold}시간 넘게 running 상태 — 마비 의심",
            "data": {
                "job_type": row.job_type,
                "count": row.cnt,
                "stale_hours": threshold,
                "started_at": row.oldest.isoformat() if row.oldest else None,
            },
        })

    # 3. 데이터 미축적 — 신선도 red 종목
    # ⚠ compute_freshness 는 8종목 풀 테이블 집계라 부하 시 8초 statement_timeout 을
    # 넘길 수 있다(세션 342 실측: articles slow query 9.6초). timeout 이 나면 트랜잭션이
    # aborted 되는데, 메인 db 를 공유하면 그 뒤 monitor_alerts SELECT/UPDATE 가 전부
    # InFailedSqlTransaction 으로 연쇄 실패한다. 그래서 freshness 는 **별도 세션**으로
    # 격리해 실패해도 메인 트랜잭션을 오염시키지 않게 한다(NullPool 이라 연결 1개 잠깐 추가).
    try:
        from db.database import SessionLocal
        fresh_db = SessionLocal()
        try:
            fresh = compute_freshness(fresh_db)
        finally:
            fresh_db.close()
        for item in fresh["items"]:
            if item["status"] != "red":
                continue
            # age_hours 는 item 에 없음 — last_updated 로 직접 계산
            age_hours = None
            if item["last_updated"]:
                last = datetime.fromisoformat(item["last_updated"])
                age_hours = int((now - last).total_seconds() // 3600)
            job = item.get("last_job") or {}
            issues.append({
                "alert_key": f"freshness:{item['key']}",
                "kind": "freshness",
                "detail": f"{item['label']} 데이터 미축적 (신선도 red, 마지막 갱신 {item['last_updated']})",
                "data": {
                    "label": item["label"],
                    "status": item["status"],
                    "spinning": item.get("spinning", False),
                    "new_rows": item.get("new_rows"),
                    "last_updated": item["last_updated"],
                    "age_hours": age_hours,
                    "processed": job.get("processed_items"),
                    "total": job.get("total_items"),
                    "link_path": "/admin#freshness",
                },
            })
    except Exception:
        logger.warning("[monitor] 신선도 계산 실패 — 이번 스캔 skip", exc_info=True)

    return issues


def _cooldown_hours() -> int:
    """쿨다운 시간 (기본 6h)."""
    return int(os.getenv("MONITOR_COOLDOWN_HOURS", "6"))


def _sweep_stale_jobs(db, issues: list[dict], now: datetime) -> int:
    """crawl_stale 로 감지된 job_type 의 running 잡을 cancelled 로 정리.

    모니터가 stale 을 감지(알림)만 하던 사각지대 보완 — 부팅 sweep(main.py)이
    '부팅 직전 시작된 잡'을 5분 임계로 놓치면 고아 running 이 영원히 남아
    매 사이클 텔레그램 오탐을 유발한다(세션 269: 잡 22665, 6시간 잔존).

    cutoff 는 detect_issues 와 동일한 job_type 별 임계(_STALE_HOURS_BY_TYPE)로
    계산 — 감지와 정리 조건을 일치시켜 drift 방지. UPDATE 는 run_monitor 의
    기존 db.commit() 에 함께 묶인다(별도 커밋 없음).
    'cancelled' 사용(failed 아님) — 강제종료/유령 잔재는 실패 통계에 잡히면 안 됨.
    """
    swept = 0
    for issue in issues:
        if issue["kind"] != "crawl_stale":
            continue
        job_type = issue["data"]["job_type"]
        threshold = _STALE_HOURS_BY_TYPE.get(job_type, _STALE_HOURS)
        cutoff = now - timedelta(hours=threshold)
        # raw text SQL — ORM update() 는 SQLite 에서 in-Python 평가 시 naive/aware
        # datetime 비교로 깨진다(_sweep_stale_running_jobs main.py 패턴 답습).
        # cutoff 는 Python 측 계산해 paramize (PG/SQLite 호환, NOW()-INTERVAL 금지).
        res = db.execute(
            text("""
                UPDATE crawl_jobs
                SET status = 'cancelled',
                    completed_at = :now,
                    error_message = COALESCE(error_message, 'stale running — swept by monitor')
                WHERE status = 'running'
                  AND completed_at IS NULL
                  AND job_type = :job_type
                  AND started_at < :cutoff
            """),
            {"now": now, "job_type": job_type, "cutoff": cutoff},
        )
        swept += res.rowcount or 0
    if swept:
        logger.info("[monitor] stale running crawl_jobs %d개 cancelled 정리", swept)
    return swept


def run_monitor(db) -> None:
    """장애 감지 → monitor_alerts 대조 → 쿨다운 적용 → 텔레그램 발송.

    APScheduler monitor job 이 호출. 장애 감지(detect_issues) 단계 예외만
    자체 흡수하며, 그 뒤 DB·발송 단계 예외는 run_monitor_job 이 감싼다.
    """
    try:
        issues = detect_issues(db)
    except Exception:
        logger.warning("[monitor] 장애 감지 실패", exc_info=True)
        return

    now = utcnow()
    current_keys = {i["alert_key"] for i in issues}
    cooldown = timedelta(hours=_cooldown_hours())
    # 헤더 "N건 활성" — 이번 스캔 장애 총 건수. 모든 발송에 동일 값 (전체 상황 요약).
    header_ctx = {"active_count": len(issues), "now": now}

    # 0. stale running 잡 정리 — 감지만 하던 사각지대 보완 (세션 269).
    #    아래 alert 처리의 db.commit() 에 함께 묶임.
    _sweep_stale_jobs(db, issues, now)

    # 1. 현재 장애 — 신규 발송 / 쿨다운 억제
    for issue in issues:
        key = issue["alert_key"]
        kind = issue["kind"]
        data = issue["data"]
        alert = db.execute(
            select(MonitorAlert).where(MonitorAlert.alert_key == key)
        ).scalar_one_or_none()

        if alert is None:
            # 신규 장애 — 발송 성공 시에만 last_notified 기록
            msg = format_issue_message(kind, data, event="new", header_ctx=header_ctx)
            sent = send_telegram(msg, parse_mode="HTML")
            db.add(MonitorAlert(
                alert_key=key, status="active",
                detail=issue["detail"],
                last_notified=now if sent else None,
            ))
        elif alert.status == "resolved":
            # 해소됐던 장애 재발 — 발송 성공 시에만 last_notified 갱신
            msg = format_issue_message(kind, data, event="recur", header_ctx=header_ctx)
            sent = send_telegram(msg, parse_mode="HTML")
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
                msg = format_issue_message(kind, data, event="ongoing", header_ctx=header_ctx)
                if send_telegram(msg, parse_mode="HTML"):
                    alert.last_notified = now
            alert.detail = issue["detail"]

    # 2. 해소된 장애 — 이번 스캔에 없는 active 행
    actives = db.execute(
        select(MonitorAlert).where(MonitorAlert.status == "active")
    ).scalars().all()
    for alert in actives:
        if alert.alert_key not in current_keys:
            # 복구 알림 성공 시에만 resolved 처리 — 실패 시 다음 스캔 재시도
            # 구조화 data 없음 → alert_key·detail 만 전달
            # kind = alert_key 의 prefix (crawl_failed / crawl_stale / freshness).
            # 현재 alert_format resolved 분기는 kind 무관이지만 미래 분기 추가 시 안전.
            kind = alert.alert_key.split(":", 1)[0]
            msg = format_issue_message(
                kind,
                {"alert_key": alert.alert_key, "detail": alert.detail},
                event="resolved", header_ctx=header_ctx,
            )
            if send_telegram(msg, parse_mode="HTML"):
                alert.status = "resolved"

    db.commit()


def run_monitor_job() -> None:
    """APScheduler 진입점 — DB 세션 열고 run_monitor 호출."""
    from db.database import SessionLocal

    db = SessionLocal()
    try:
        run_monitor(db)
    except Exception:
        logger.warning("[monitor] job 실행 실패", exc_info=True)
        db.rollback()
    finally:
        db.close()
