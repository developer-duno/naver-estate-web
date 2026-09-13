"""관리자 스케줄러 모니터링 라우트"""

import logging
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from crawler.api_version_monitor import PROBE_REGISTRY
from db.models import CrawlJob
from deps import get_admin_user, get_db
from shared.constants import NAVER_LAND_BASE

from ._shared import router

# PROBE_REGISTRY 안의 "name" → 그 항목 dict. 출처 이름·URL 을 손글씨로 다시 적지
# 않고 여기서 조회해 재사용한다 (derived-display-ssot.md — 파생 표시값은 source 에서
# 자동생성, 손글씨 중복 금지). PROBE_REGISTRY 자체가 이미 "이 API 가 어디서 오는지"의
# SSOT(각 크롤러 모듈의 BASE_URL 상수와 1:1 대응, 세션 코멘트 참조)이므로 재사용이 자연스럽다.
_PROBE_BY_NAME: dict[str, dict] = {entry["name"]: entry for entry in PROBE_REGISTRY}

# PROBE_REGISTRY 에 없는 출처 (data.go.kr 감시 대상이 아닌 API·플랫폼).
# PROBE_REGISTRY 는 "data.go.kr 격변 감시" 전용이라 네이버·V-WORLD·CPMS 는 원래
# 대상이 아니다 — 이 항목들은 각 크롤러 모듈의 실제 호출 상수를 그대로 재사용한다.
#   - 네이버: shared/constants.py NAVER_LAND_BASE (여러 크롤러 잡이 공유하는 단일 상수)
#   - V-WORLD 공동주택 공시가격: crawler/vworld_price_api.py APART_HOUSING_PRICE_URL
#   - CPMS 어린이집: crawler/childcare_api.py CHILDCARE_LIST_URL
# 손글씨 URL 은 이 두 곳(V-WORLD·CPMS)만 — 각 모듈에 이미 있는 상수를 그대로 옮긴
# 값이며, 모듈이 바뀌면 이 두 줄도 함께 바꿔야 한다(그 외엔 PROBE_REGISTRY 참조로 자동 추종).
_NAVER_SOURCE = f"네이버 부동산 ({NAVER_LAND_BASE})"
_VWORLD_OFFICIAL_PRICE_SOURCE = "V-WORLD 공동주택 공시가격 (api.vworld.kr/ned/data/getApartHousingPriceAttr)"
_CPMS_CHILDCARE_SOURCE = "보육정보공개포털 CPMS (api.childcare.go.kr cpmsapi030)"

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
#
# "source" 는 출처 표시용 필드 (세션 402 — 관리자 화면에 "이 데이터가 어디서 오는가"
# 노출 요청). 손글씨 중복을 피하려고 두 형태만 허용한다:
#   - {"probe": "<PROBE_REGISTRY 안의 name 문자열>"} — 이름·URL 을 PROBE_REGISTRY 에서
#     런타임 조회(_source_text 참조). data.go.kr/odcloud 계열 API 는 전부 이 형태.
#   - 문자열 그대로 — PROBE_REGISTRY 밖(네이버·V-WORLD·CPMS, 위 _NAVER_SOURCE 등 상수 참조)
#   - None — 외부 API 호출이 없는 내부 DB 전용 잡 (화면에 "-" 로 표시)
SCHEDULER_JOB_META: dict[str, dict] = {
    "discover_regions": {"name": "전국 단지 발견", "schedule": "주 1회 일요일 03:00", "env": None, "source": _NAVER_SOURCE},
    "crawl_articles": {"name": "매물 수집 배치", "schedule": "매일 01:00, 13:00", "env": None, "source": _NAVER_SOURCE},
    "crawl_details": {"name": "매물 상세 보강", "schedule": "30분마다", "env": None, "source": _NAVER_SOURCE},
    "backfill_detail_dawn": {"name": "상세 백필 00:20(키 드리프트 대응)", "schedule": "매일 00:20", "env": "BACKFILL_DETAIL_ENABLED", "source": _NAVER_SOURCE},
    "backfill_detail_noon": {"name": "상세 백필 12:20(키 드리프트 대응)", "schedule": "매일 12:20", "env": "BACKFILL_DETAIL_ENABLED", "source": _NAVER_SOURCE},
    "collect_prices": {"name": "시세 이력 수집", "schedule": "주 1회 수요일 04:00", "env": None, "source": _NAVER_SOURCE},
    "popular_1030": {"name": "인기 단지 크롤링 10:45", "schedule": "매일 10:45", "env": "POPULAR_CRAWL_ENABLED", "env_default": "true", "source": _NAVER_SOURCE},
    "popular_1430": {"name": "인기 단지 크롤링 14:45", "schedule": "매일 14:45", "env": "POPULAR_CRAWL_ENABLED", "env_default": "true", "source": _NAVER_SOURCE},
    "popular_1900": {"name": "인기 단지 크롤링 19:15", "schedule": "매일 19:15", "env": "POPULAR_CRAWL_ENABLED", "env_default": "true", "source": _NAVER_SOURCE},
    "collect_public_trades": {"name": "공공데이터 실거래가", "schedule": "주 1회 토요일 05:00", "env": "PUBLIC_DATA_ENABLED", "source": {"probe": "국토교통부 아파트 매매 실거래가"}},
    "collect_officetel_presale": {"name": "청약홈 오피스텔 수집", "schedule": "주 1회 월요일 05:00", "env": "PUBLIC_DATA_ENABLED", "source": {"probe": "청약홈 오피스텔·민간임대 분양정보 (ApplyhomeInfoDetailSvc/v1)"}},
    "collect_rental_presale": {"name": "청약홈 민간임대 수집", "schedule": "주 1회 월요일 05:30", "env": "PUBLIC_DATA_ENABLED", "source": {"probe": "청약홈 오피스텔·민간임대 분양정보 (ApplyhomeInfoDetailSvc/v1)"}},
    "official_price": {"name": "공동주택 공시가격 수집", "schedule": "매월 15일 06:30", "env": "OFFICIAL_PRICE_ENABLED", "source": _VWORLD_OFFICIAL_PRICE_SOURCE},
    "backfill_price": {"name": "시세 이력 소급 수집", "schedule": "매일 03:30", "env": "PUBLIC_DATA_ENABLED", "source": {"probe": "국토교통부 아파트 매매 실거래가"}},
    "collect_air_quality": {"name": "에어코리아 대기질", "schedule": "매일 02:00", "env": "AIR_QUALITY_ENABLED", "source": {"probe": "에어코리아 실시간 대기질"}},
    "collect_emergency": {"name": "응급의료기관", "schedule": "매월 첫째 월요일 03:00", "env": "EMERGENCY_ENABLED", "source": {"probe": "응급의료기관 목록"}},
    "collect_childcare": {"name": "어린이집", "schedule": "매월 첫째 목요일 01:00", "env": "CHILDCARE_ENABLED", "source": _CPMS_CHILDCARE_SOURCE},
    "collect_crime_stats": {"name": "범죄통계", "schedule": "분기별 첫째 일요일 04:00", "env": "CRIME_STATS_ENABLED", "source": {"probe": "경찰청 범죄통계 (3074462)"}},
    "complex_detail_APT": {"name": "단지 상세 backfill APT", "schedule": "4시간마다", "env": "COMPLEX_DETAIL_ENABLED", "env_default": "true", "source": _NAVER_SOURCE},
    "complex_detail_OPST": {"name": "단지 상세 backfill OPST", "schedule": "4시간마다", "env": "COMPLEX_DETAIL_ENABLED", "env_default": "true", "source": _NAVER_SOURCE},
    "complex_detail_JGC": {"name": "단지 상세 backfill JGC", "schedule": "주 1회 화요일 07:00", "env": "COMPLEX_DETAIL_ENABLED", "env_default": "true", "source": _NAVER_SOURCE},
    "complex_detail_ABYG": {"name": "단지 상세 backfill ABYG", "schedule": "주 1회 수요일 07:00", "env": "COMPLEX_DETAIL_ENABLED", "env_default": "true", "source": _NAVER_SOURCE},
    "complex_detail_OBYG": {"name": "단지 상세 backfill OBYG", "schedule": "주 1회 목요일 07:00", "env": "COMPLEX_DETAIL_ENABLED", "env_default": "true", "source": _NAVER_SOURCE},
    "collect_metrics": {"name": "단지 가치지표 수집", "schedule": "매일 04:30", "env": "COMPLEX_METRIC_ENABLED", "env_default": "true", "source": None},
    # env_extra: 이 잡이 등록되려면 env 와 **함께** 참이어야 하는 추가 토글 (AND).
    #   scheduler.py 의 `if BILLING_AUTO_CHARGE_ENABLED and PAYMENT_ENABLED:` 와 짝을 맞춘다 —
    #   없으면 PAYMENT_ENABLED 가 꺼진 무료 전환 기간에도 화면이 "활성 · 매일 04:50"으로
    #   거짓 표시된다(세션 400 적대검증 HIGH). 새 잡에 토글이 둘 이상이면 여기에 추가.
    "billing_charge": {"name": "빌링키 자동결제", "schedule": "매일 04:50", "env": "BILLING_AUTO_CHARGE_ENABLED", "env_default": "true", "env_extra": [("PAYMENT_ENABLED", "false")], "source": None},
    "crawler_monitor": {"name": "크롤링 모니터", "schedule": "10분마다", "env": "MONITOR_ENABLED", "source": None},
    "vacuum_maintenance": {"name": "정기 VACUUM 유지보수", "schedule": "매일 03:50", "env": "VACUUM_MAINTENANCE_ENABLED", "env_default": "true", "source": None},
    "api_version_probe": {"name": "data.go.kr API 버전 감시", "schedule": "주 1회 일요일 06:40", "env": "API_VERSION_MONITOR_ENABLED", "env_default": "true", "source": "data.go.kr / odcloud.kr API 12종 전수 감시 (PROBE_REGISTRY)"},
    "kapt_match": {"name": "K-apt 단지 매칭", "schedule": "매월 21일 06:10", "env": "KAPT_ENABLED", "source": {"probe": "K-apt 단지 기본정보 (AptBasisInfoServiceV5)"}},
    "kapt_costs": {"name": "K-apt 관리비 수집", "schedule": "매일 06:20", "env": "KAPT_ENABLED", "source": {"probe": "K-apt 공용관리비 (AptCmnuseManageCostServiceV3)"}},
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


def _source_text(source: dict | str | None) -> tuple[str | None, str | None]:
    """META 의 "source" 값을 (표시용 이름, 출처 URL) 로 변환.

    {"probe": "<PROBE_REGISTRY name>"} 형태면 PROBE_REGISTRY 에서 실제 url 을
    조회해 조립 (손글씨 URL 중복 저장 금지, derived-display-ssot.md 답습).
    문자열이면 그대로(이름에 URL 이 괄호로 이미 포함돼 있어 url 은 None).
    None 이면 (None, None) — 화면에 "-" 로 표시.
    """
    if source is None:
        return None, None
    if isinstance(source, str):
        return source, None
    probe_name = source.get("probe")
    entry = _PROBE_BY_NAME.get(probe_name)
    if entry is None:
        # PROBE_REGISTRY 항목명이 바뀌었는데 META 를 안 고친 경우 — drift 를 숨기지
        # 않고 원문 키를 그대로 노출해 눈에 띄게 한다(테스트가 이 경로를 가드).
        return probe_name, None
    return entry["name"], entry["url"]


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
        # 추가 토글(AND) — 등록 조건이 토글 둘 이상인 잡. META 의 env_extra 참조.
        for extra_key, extra_default in meta.get("env_extra", []):
            enabled = enabled and os.getenv(extra_key, extra_default).lower() == "true"

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

        source_name, source_url = _source_text(meta.get("source"))

        jobs.append({
            "scheduler_job_id": job_id,
            "name": meta["name"],
            "schedule": schedule_text,
            "enabled": enabled,
            "last_run": last_run,
            "next_run_at": next_run_at,
            "stats_24h": stats_24h.get(job_id, {"runs": 0, "failures": 0}),
            "source": source_name,
            "source_url": source_url,
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
