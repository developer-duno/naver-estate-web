"""관리자 스케줄러 모니터링 라우트"""

import logging
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from db.models import CrawlJob
from deps import get_admin_user, get_db

from ._shared import router

# 에러율 차트에서 집계할 status 값 (crawl_jobs 테이블 실측 기준)
_ERROR_STATS_STATUSES = ("completed", "failed", "paused", "pending", "running", "cancelled")

logger = logging.getLogger(__name__)

# 스케줄러 작업 메타데이터 (이름/스케줄/환경변수 이름).
#
# "schedule" 은 fallback 전용 — 활성 잡은 scheduler-status 가 실제 trigger 에서
# describe_trigger() 로 한국어를 런타임 생성한다 (SSOT, 세션 256). 이 문자열은
# 비활성 잡(env=false 라 미등록) + scheduler 미실행(None) 일 때만 화면에 쓰인다.
# test_meta_fallback_matches_describe_trigger_for_active_jobs 가 모든 활성 잡의
# trigger 와 강제 대조하므로 손글씨 drift 시 CI 가 빨간불 (PR #99·6a·monitor 답습).
SCHEDULER_JOB_META: dict[str, dict] = {
    "discover_regions": {"name": "전국 단지 발견", "schedule": "주 1회 일요일 03:00", "env": None},
    "crawl_articles": {"name": "매물 수집 배치", "schedule": "12시간마다", "env": None},
    "crawl_details": {"name": "매물 상세 보강", "schedule": "30분마다", "env": None},
    "collect_prices": {"name": "시세 이력 수집", "schedule": "주 1회 수요일 04:00", "env": None},
    "popular_1030": {"name": "인기 단지 크롤링 10:45", "schedule": "매일 10:45", "env": "POPULAR_CRAWL_ENABLED", "env_default": "true"},
    "popular_1430": {"name": "인기 단지 크롤링 14:45", "schedule": "매일 14:45", "env": "POPULAR_CRAWL_ENABLED", "env_default": "true"},
    "popular_1900": {"name": "인기 단지 크롤링 19:15", "schedule": "매일 19:15", "env": "POPULAR_CRAWL_ENABLED", "env_default": "true"},
    "collect_public_trades": {"name": "공공데이터 실거래가", "schedule": "주 1회 토요일 05:00", "env": "PUBLIC_DATA_ENABLED"},
    "collect_officetel_presale": {"name": "청약홈 오피스텔 수집", "schedule": "주 1회 월요일 05:00", "env": "PUBLIC_DATA_ENABLED"},
    "collect_rental_presale": {"name": "청약홈 민간임대 수집", "schedule": "주 1회 월요일 05:30", "env": "PUBLIC_DATA_ENABLED"},
    "official_price": {"name": "공동주택 공시가격 수집", "schedule": "매월 15일 06:30", "env": "OFFICIAL_PRICE_ENABLED"},
    "backfill_price": {"name": "시세 이력 소급 수집", "schedule": "매일 03:30", "env": "PUBLIC_DATA_ENABLED"},
    "collect_air_quality": {"name": "에어코리아 대기질", "schedule": "매일 02:00", "env": "AIR_QUALITY_ENABLED"},
    "collect_emergency": {"name": "응급의료기관", "schedule": "매월 첫째 월요일 03:00", "env": "EMERGENCY_ENABLED"},
    "collect_childcare": {"name": "어린이집", "schedule": "매월 첫째 목요일 01:00", "env": "CHILDCARE_ENABLED"},
    "collect_crime_stats": {"name": "범죄통계", "schedule": "분기별 첫째 일요일 04:00", "env": "CRIME_STATS_ENABLED"},
    "complex_detail_APT": {"name": "단지 상세 backfill APT", "schedule": "4시간마다", "env": "COMPLEX_DETAIL_ENABLED", "env_default": "true"},
    "complex_detail_OPST": {"name": "단지 상세 backfill OPST", "schedule": "4시간마다", "env": "COMPLEX_DETAIL_ENABLED", "env_default": "true"},
    "complex_detail_JGC": {"name": "단지 상세 backfill JGC", "schedule": "주 1회 화요일 07:00", "env": "COMPLEX_DETAIL_ENABLED", "env_default": "true"},
    "complex_detail_ABYG": {"name": "단지 상세 backfill ABYG", "schedule": "주 1회 수요일 07:00", "env": "COMPLEX_DETAIL_ENABLED", "env_default": "true"},
    "complex_detail_OBYG": {"name": "단지 상세 backfill OBYG", "schedule": "주 1회 목요일 07:00", "env": "COMPLEX_DETAIL_ENABLED", "env_default": "true"},
    "collect_metrics": {"name": "단지 가치지표 수집", "schedule": "매일 04:30", "env": "COMPLEX_METRIC_ENABLED", "env_default": "true"},
    "billing_charge": {"name": "빌링키 자동결제", "schedule": "매일 04:50", "env": "BILLING_AUTO_CHARGE_ENABLED", "env_default": "true"},
    "crawler_monitor": {"name": "크롤링 모니터", "schedule": "10분마다", "env": "MONITOR_ENABLED"},
    "vacuum_maintenance": {"name": "정기 VACUUM 유지보수", "schedule": "매일 03:50", "env": "VACUUM_MAINTENANCE_ENABLED", "env_default": "true"},
    "api_version_probe": {"name": "data.go.kr API 버전 감시", "schedule": "주 1회 일요일 06:40", "env": "API_VERSION_MONITOR_ENABLED", "env_default": "true"},
    "kapt_match": {"name": "K-apt 단지 매칭", "schedule": "매월 21일 06:10", "env": "KAPT_ENABLED"},
    "kapt_costs": {"name": "K-apt 관리비 수집", "schedule": "매일 06:20", "env": "KAPT_ENABLED"},
}

# 캘린더 전용 이름표 — 스케줄러에 등록되지 않는 "수동 실행" 잡들.
#
# 이들은 관리자 버튼(recrawl)·수동 스크립트(backfill_*)가 CrawlJob 을 남길 때 쓰는
# scheduler_job_id 다. 정기 잡이 아니라 trigger 도 next_run 도 없으므로 캘린더 과거
# 이벤트에만 등장한다. 이름표가 없으면 화면에 raw id("admin_recrawl")가 그대로 노출된다.
#
# ⚠ SCHEDULER_JOB_META 에 넣지 말 것 — scheduler-status 가 META 키를 그대로 순회해
# (아래 `for job_id, meta in SCHEDULER_JOB_META.items()`) 표에 "예정 없음" 유령 행이
# 생기고, test_scheduler_job_meta_covers_all_registered_jobs 류 가드와도 어긋난다.
MANUAL_JOB_NAMES: dict[str, str] = {
    "backfill_apartment_public_data": "실거래 이력 보충 (수동)",
    "backfill_missing_price_history": "시세 이력 보충 (수동)",
    "admin_recrawl": "관리자 일괄 재수집",
    "admin_single_recrawl": "관리자 단지 재수집",
    # 세션 355~356 공시가격 첫 수동 적재가 남긴 job id (R3 — 캘린더에 raw 노출되던 것).
    # ⚠ *_TEST 접미사·manual_session359 는 디버그 잔재라 원문 노출이 오히려 정보성 —
    #   여기 추가하지 말 것.
    "collect_official_prices": "공동주택 공시가격 수집 (수동)",
}


def _calendar_job_name(job_id: str, fallback: str | None = None) -> str:
    """캘린더 이벤트 표시 이름 — META → MANUAL_JOB_NAMES → 원문 3단 폴백."""
    meta = SCHEDULER_JOB_META.get(job_id)
    if meta:
        return meta["name"]
    manual = MANUAL_JOB_NAMES.get(job_id)
    if manual:
        return manual
    return fallback or job_id


@router.get("/scheduler-status")
def get_scheduler_status(
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user),
):
    """스케줄러 작업별 실행 이력 + 다음 실행 시각 조회"""
    import os

    from crawler.schedule_describe import describe_trigger
    from crawler.scheduler import get_scheduler

    scheduler = get_scheduler()
    now = datetime.now(timezone.utc)
    # 오늘 실행/실패 수 — 한국 사용자 화면이라 '오늘'은 KST 자정 기준
    # (UTC 자정이면 KST 오전 9시에야 리셋. 같은 파일 error-stats 차트도 KST 버킷)
    # ⚠ 쿼리 바인딩은 UTC 로 변환 — started_at 저장값이 UTC 라 CI SQLite 문자열 비교 안전
    # ⚠ microsecond=0 은 필수 — 소수부가 남으면 SQLite 바인딩 문자열에 '.xxxxxx' 가 붙어
    #   저장 포맷(소수부 없음)과의 문자열 비교가 어긋난다 (제약: 지우지 말 것)
    kst_midnight = datetime.now(ZoneInfo("Asia/Seoul")).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    today_start = kst_midnight.astimezone(timezone.utc)

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

        # 다음 실행 시각 + schedule 문구 — 둘 다 스케줄러 인스턴스의 같은 job 에서 조회
        # (SSOT: 활성 잡은 실제 trigger 에서 한국어 생성. 비활성·미실행 시 meta fallback.)
        next_run_at = None
        schedule_text = meta["schedule"]  # fallback (비활성 잡 + scheduler=None)
        if scheduler:
            sched_job = scheduler.get_job(job_id)
            if sched_job:
                if sched_job.next_run_time:
                    next_run_at = sched_job.next_run_time.isoformat()
                generated = describe_trigger(sched_job.trigger)
                if generated:  # 활성 잡 + 파싱 성공 → trigger 가 진실의 원천
                    schedule_text = generated

        jobs.append({
            "scheduler_job_id": job_id,
            "name": meta["name"],
            "schedule": schedule_text,
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


# 캘린더 월간 안전 상한 — interval 30분 × 31일 × 20 job 추정 최대 = 29,760
# 5만 cap 으로 메모리 폭주 차단 (FullCalendar dayMaxEvents 가 화면 압축).
_CALENDAR_MAX_EVENTS = 50_000


def _month_range_utc(year: int, month: int) -> tuple[datetime, datetime]:
    """KST 기준 (year, month) 의 [월초 00:00, 다음달 00:00) 을 UTC 로 변환."""
    kst = timezone(timedelta(hours=9))
    start_kst = datetime(year, month, 1, tzinfo=kst)
    next_year, next_month = (year, month + 1) if month < 12 else (year + 1, 1)
    end_kst = datetime(next_year, next_month, 1, tzinfo=kst)
    return start_kst.astimezone(timezone.utc), end_kst.astimezone(timezone.utc)


@router.get("/scheduler-calendar")
def get_scheduler_calendar(
    year: int = Query(..., ge=2020, le=2099),
    month: int = Query(..., ge=1, le=12),
    mode: str = Query("both", pattern="^(past|upcoming|both)$"),
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user),
):
    """월 단위 발화 이벤트 — 과거(crawl_jobs) + 미래(trigger 전개).

    응답 = {"events": [{"scheduler_job_id", "name", "start", "status", "kind"}, ...]}
      - kind: "past" | "upcoming"
      - start: KST iso (FullCalendar 가 그대로 파싱)
      - status: past 면 crawl_jobs.status, upcoming 이면 "upcoming"
    """
    from crawler.scheduler import get_scheduler

    start_utc, end_utc = _month_range_utc(year, month)
    kst = timezone(timedelta(hours=9))
    events: list[dict] = []

    if mode in ("past", "both"):
        rows = (
            db.query(
                CrawlJob.scheduler_job_id,
                CrawlJob.started_at,
                CrawlJob.status,
            )
            .filter(
                CrawlJob.scheduler_job_id.isnot(None),
                CrawlJob.started_at >= start_utc,
                CrawlJob.started_at < end_utc,
            )
            .order_by(CrawlJob.started_at)
            .all()
        )
        for row in rows:
            if row.started_at is None:
                continue
            started = row.started_at
            if started.tzinfo is None:
                started = started.replace(tzinfo=timezone.utc)
            events.append({
                "scheduler_job_id": row.scheduler_job_id,
                "name": _calendar_job_name(row.scheduler_job_id),
                "start": started.astimezone(kst).isoformat(),
                "status": row.status,
                "kind": "past",
            })
            if len(events) >= _CALENDAR_MAX_EVENTS:
                return {"year": year, "month": month, "mode": mode, "events": events, "truncated": True}

    if mode in ("upcoming", "both"):
        scheduler = get_scheduler()
        if scheduler is not None:
            now_utc = datetime.now(timezone.utc)
            # 과거 전개 막기 위해 max(now, start_utc) 부터 전개
            range_start = max(now_utc, start_utc)
            for job in scheduler.get_jobs():
                if range_start >= end_utc:
                    break
                prev = range_start - timedelta(microseconds=1)
                while True:
                    next_t = job.trigger.get_next_fire_time(prev, prev)
                    if next_t is None or next_t >= end_utc:
                        break
                    events.append({
                        "scheduler_job_id": job.id,
                        "name": _calendar_job_name(job.id, job.name),
                        "start": next_t.astimezone(kst).isoformat(),
                        "status": "upcoming",
                        "kind": "upcoming",
                    })
                    prev = next_t
                    if len(events) >= _CALENDAR_MAX_EVENTS:
                        return {"year": year, "month": month, "mode": mode, "events": events, "truncated": True}

    return {"year": year, "month": month, "mode": mode, "events": events, "truncated": False}
