"""APScheduler 기반 크롤러 스케줄러"""

import logging
import os

from apscheduler.schedulers.background import BackgroundScheduler
from dotenv import load_dotenv

from crawler.billing_charge import charge_due_billing_keys
from crawler.service import (
    backfill_price_batch,
    collect_price_history,
    crawl_article_details,
    crawl_articles_batch,
    crawl_complex_details_batch,
    crawl_popular_complexes,
    discover_all_regions,
)
from crawler.service_metrics import collect_complex_metrics
from crawler.vacuum_maintenance import run_vacuum_maintenance

load_dotenv()
logger = logging.getLogger(__name__)

CRAWL_INTERVAL_HOURS = int(os.getenv("CRAWL_INTERVAL_HOURS", "12"))
CRAWL_DETAIL_INTERVAL_MIN = int(os.getenv("CRAWL_DETAIL_INTERVAL_MIN", "30"))
CRAWL_DETAIL_BATCH_SIZE = int(os.getenv("CRAWL_DETAIL_BATCH_SIZE", "500"))
CRAWL_BATCH_SIZE = int(os.getenv("CRAWL_BATCH_SIZE", "50"))
POPULAR_CRAWL_ENABLED = os.getenv("POPULAR_CRAWL_ENABLED", "true").lower() == "true"
POPULAR_CRAWL_BATCH_SIZE = int(os.getenv("POPULAR_CRAWL_BATCH_SIZE", "50"))
PUBLIC_DATA_ENABLED = os.getenv("PUBLIC_DATA_ENABLED", "false").lower() == "true"
PUBLIC_DATA_BATCH_SIZE = int(os.getenv("PUBLIC_DATA_BATCH_SIZE", "300"))
# 시세 이력 부족 단지 소급 수집 (국토교통부 실거래가). PUBLIC_DATA_ENABLED 와 같은
# data.go.kr 키 사용 — 일일 쿼터(10,000회, mibunyang 공유) 보호 위해 배치 작게.
PUBLIC_PRICE_BACKFILL_BATCH_SIZE = int(os.getenv("PUBLIC_PRICE_BACKFILL_BATCH_SIZE", "30"))
AIR_QUALITY_ENABLED = os.getenv("AIR_QUALITY_ENABLED", "false").lower() == "true"
AIR_QUALITY_BATCH_SIZE = int(os.getenv("AIR_QUALITY_BATCH_SIZE", "100"))
EMERGENCY_ENABLED = os.getenv("EMERGENCY_ENABLED", "false").lower() == "true"
EMERGENCY_BATCH_SIZE = int(os.getenv("EMERGENCY_BATCH_SIZE", "100"))
CHILDCARE_ENABLED = os.getenv("CHILDCARE_ENABLED", "false").lower() == "true"
CHILDCARE_BATCH_SIZE = int(os.getenv("CHILDCARE_BATCH_SIZE", "100"))
CRIME_STATS_ENABLED = os.getenv("CRIME_STATS_ENABLED", "false").lower() == "true"
COMPLEX_DETAIL_ENABLED = os.getenv("COMPLEX_DETAIL_ENABLED", "true").lower() == "true"
COMPLEX_DETAIL_BATCH_SIZE = int(os.getenv("COMPLEX_DETAIL_BATCH_SIZE", "1000"))
COMPLEX_DETAIL_APT_INTERVAL_HOURS = int(os.getenv("COMPLEX_DETAIL_APT_INTERVAL_HOURS", "4"))
COMPLEX_DETAIL_OPST_INTERVAL_HOURS = int(os.getenv("COMPLEX_DETAIL_OPST_INTERVAL_HOURS", "4"))
COMPLEX_METRIC_ENABLED = os.getenv("COMPLEX_METRIC_ENABLED", "true").lower() == "true"
COMPLEX_METRIC_BATCH_SIZE = int(os.getenv("COMPLEX_METRIC_BATCH_SIZE", "1000"))
# 빌링키 자동결제(정기결제 PR3) — 매일 04:50 next_charge_at 도래분 결제. 기본 활성.
BILLING_AUTO_CHARGE_ENABLED = os.getenv("BILLING_AUTO_CHARGE_ENABLED", "true").lower() == "true"
MONITOR_ENABLED = os.getenv("MONITOR_ENABLED", "false").lower() == "true"
MONITOR_INTERVAL_MIN = int(os.getenv("MONITOR_INTERVAL_MIN", "30"))
# 정기 VACUUM (ANALYZE) — articles/trades visibility map 재악화 차단 (세션 260)
VACUUM_MAINTENANCE_ENABLED = os.getenv("VACUUM_MAINTENANCE_ENABLED", "true").lower() == "true"

# 모듈 레벨 스케줄러 참조 — admin API에서 다음 실행 시각 조회용
_scheduler: BackgroundScheduler | None = None


def get_scheduler() -> BackgroundScheduler | None:
    """실행 중인 스케줄러 인스턴스 반환 (미실행 시 None)"""
    return _scheduler


def create_scheduler() -> BackgroundScheduler:
    """크롤러 스케줄러 생성 (BackgroundScheduler — 메인 스레드 차단 없음).

    add_job 호출을 래핑해 같은 id 두 번 등록 시 즉시 ValueError. APScheduler
    기본 동작은 silent 허용이라 동적 id (예: f"popular_{hour}") 충돌 시 발견
    지연 — 시작 시점에 즉시 적발.
    """
    scheduler = BackgroundScheduler()
    _seen_ids: set[str] = set()
    _orig_add_job = scheduler.add_job

    def _add_job_unique(*args, **kwargs):
        job_id = kwargs.get("id")
        if job_id is None and len(args) >= 4:
            # add_job(func, trigger, args, kwargs, id, ...) 위치 인자 호환
            job_id = args[4] if len(args) > 4 else None
        if job_id is not None:
            if job_id in _seen_ids:
                raise ValueError(
                    f"create_scheduler: 같은 id '{job_id}' 가 두 번 등록됨 — "
                    "동적 id 생성 시 충돌 의심"
                )
            _seen_ids.add(job_id)
        return _orig_add_job(*args, **kwargs)

    scheduler.add_job = _add_job_unique  # type: ignore[method-assign]

    # A. 단지 발견 — 주 1회 일요일 새벽 3시
    scheduler.add_job(
        discover_all_regions,
        "cron",
        day_of_week="sun",
        hour=3,
        kwargs={"scheduler_job_id": "discover_regions"},
        id="discover_regions",
        name="전국 단지 발견",
        misfire_grace_time=3600,
    )

    # B. 매물 수집 — N시간마다 (jitter: mibunyang 08:00 월/목 크롤링과 충돌 회피)
    #    max_instances=1: 이전 배치가 안 끝났는데 다음 주기가 시작되는 중복 실행 차단
    #    (cron job 들과 일관성 — 동시 크롤은 같은 IP 부하·DB 경합 유발).
    scheduler.add_job(
        crawl_articles_batch,
        "interval",
        hours=CRAWL_INTERVAL_HOURS,
        jitter=2700,
        kwargs={"batch_size": CRAWL_BATCH_SIZE, "scheduler_job_id": "crawl_articles"},
        id="crawl_articles",
        name="매물 수집 배치",
        max_instances=1,
        misfire_grace_time=1800,
    )

    # C. 상세 보강 — 30분마다 (jitter: 같은 IP 네이버 요청 분산)
    #    max_instances=1: B 와 동일 — 30분 주기가 밀려도 중복 실행 안 함.
    scheduler.add_job(
        crawl_article_details,
        "interval",
        minutes=CRAWL_DETAIL_INTERVAL_MIN,
        jitter=900,
        kwargs={"batch_size": CRAWL_DETAIL_BATCH_SIZE, "scheduler_job_id": "crawl_details"},
        id="crawl_details",
        name="매물 상세 보강",
        max_instances=1,
        misfire_grace_time=900,
    )

    # D. 시세 수집 — 주 1회 수요일 새벽 4시 (Phase 1)
    scheduler.add_job(
        collect_price_history,
        "cron",
        day_of_week="wed",
        hour=4,
        kwargs={"batch_size": CRAWL_BATCH_SIZE, "scheduler_job_id": "collect_prices"},
        id="collect_prices",
        name="시세 이력 수집",
        misfire_grace_time=3600,
    )

    # D-2. 시세 이력 소급 수집 — 매일 새벽 3시 30분
    #   complex_price_history 6행 미만 단지를 세대수 상위순으로 국토교통부
    #   실거래가 backfill. 가치지표(M)의 집계 대상 단지를 늘리는 근본 경로.
    #   공공데이터 API 라 네이버 IP 차단 무관. PUBLIC_DATA_ENABLED 토글 공유
    #   (같은 data.go.kr 키) — 토요일 collect_public_trades 와 시각 분리.
    if PUBLIC_DATA_ENABLED:
        scheduler.add_job(
            backfill_price_batch,
            "cron",
            hour=3,
            minute=30,
            kwargs={"batch_size": PUBLIC_PRICE_BACKFILL_BATCH_SIZE, "scheduler_job_id": "backfill_price"},
            id="backfill_price",
            name="시세 이력 소급 수집",
            max_instances=1,
            misfire_grace_time=3600,
        )
        logger.info("시세 이력 소급 수집 활성화: 매일 03:30 (배치 %d)", PUBLIC_PRICE_BACKFILL_BATCH_SIZE)

    # E. 인기 단지 선제적 크롤링 — 하루 3회 (10:45, 14:45, 19:15 KST)
    #    기존 스케줄(B: 12시간마다, C: 30분마다)과 충돌 회피
    #    2026-04-16: mibunyang 쿨다운 대응 — 기존 10:30/14:30/19:00에서 15분씩 시프트
    if POPULAR_CRAWL_ENABLED:
        for hour, minute, job_id in [(10, 45, "popular_1030"), (14, 45, "popular_1430"), (19, 15, "popular_1900")]:
            scheduler.add_job(
                crawl_popular_complexes,
                "cron",
                hour=hour,
                minute=minute,
                kwargs={"batch_size": POPULAR_CRAWL_BATCH_SIZE, "scheduler_job_id": job_id},
                id=job_id,
                name=f"인기 단지 크롤링 {hour:02d}:{minute:02d}",
                max_instances=1,
                misfire_grace_time=1800,
            )
        logger.info("인기 단지 선제적 크롤링 활성화: 10:45, 14:45, 19:15 (배치 %d)", POPULAR_CRAWL_BATCH_SIZE)

    # K. 단지 상세 유형별 backfill — 매물유형별 독립 job
    #    APT(4.6만)·OPST(1.5만)는 interval 가속 (PR #19 매물상세 패턴 답습),
    #    소수 유형은 주 1회 07:00 cron 유지. jitter 로 같은 IP 다른 잡과 분산.
    if COMPLEX_DETAIL_ENABLED:
        # 대량 유형 — interval (env 시간 조절, 자동 감속 throttle 자율 보호)
        scheduler.add_job(
            crawl_complex_details_batch,
            "interval",
            hours=COMPLEX_DETAIL_APT_INTERVAL_HOURS,
            jitter=600,
            kwargs={"real_estate_type": "APT", "batch_size": COMPLEX_DETAIL_BATCH_SIZE,
                    "scheduler_job_id": "complex_detail_APT"},
            id="complex_detail_APT",
            name="단지 상세 backfill APT",
            max_instances=1,
            misfire_grace_time=3600,
        )
        scheduler.add_job(
            crawl_complex_details_batch,
            "interval",
            hours=COMPLEX_DETAIL_OPST_INTERVAL_HOURS,
            jitter=600,
            kwargs={"real_estate_type": "OPST", "batch_size": COMPLEX_DETAIL_BATCH_SIZE,
                    "scheduler_job_id": "complex_detail_OPST"},
            id="complex_detail_OPST",
            name="단지 상세 backfill OPST",
            max_instances=1,
            misfire_grace_time=3600,
        )
        # 소수 유형 — 주 1회 07:00 (요일 분산)
        for dow, rtype in [("tue", "JGC"), ("wed", "ABYG"), ("thu", "OBYG")]:
            scheduler.add_job(
                crawl_complex_details_batch,
                "cron",
                day_of_week=dow,
                hour=7,
                jitter=600,
                kwargs={"real_estate_type": rtype, "batch_size": COMPLEX_DETAIL_BATCH_SIZE,
                        "scheduler_job_id": f"complex_detail_{rtype}"},
                id=f"complex_detail_{rtype}",
                name=f"단지 상세 backfill {rtype} {dow} 07:00",
                max_instances=1,
                misfire_grace_time=3600,
            )
        logger.info(
            "단지 상세 backfill 활성화: APT %dh interval / OPST %dh interval 매일, "
            "JGC·ABYG·OBYG 주1회 07:00 (배치 %d)",
            COMPLEX_DETAIL_APT_INTERVAL_HOURS, COMPLEX_DETAIL_OPST_INTERVAL_HOURS, COMPLEX_DETAIL_BATCH_SIZE,
        )

    # F. 공공데이터 실거래가 수집 — 주 1회 토요일 새벽 5시
    #    네이버 API 보완용, IP 차단 우려 없음
    if PUBLIC_DATA_ENABLED:
        from crawler.service import collect_public_trade_data

        scheduler.add_job(
            collect_public_trade_data,
            "cron",
            day_of_week="sat",
            hour=5,
            kwargs={"batch_size": PUBLIC_DATA_BATCH_SIZE, "scheduler_job_id": "collect_public_trades"},
            id="collect_public_trades",
            name="공공데이터 실거래가 수집",
            max_instances=1,
            misfire_grace_time=3600,
        )
        logger.info("공공데이터 실거래가 수집 활성화: 토요일 05:00 (배치 %d)", PUBLIC_DATA_BATCH_SIZE)

    # F-1. 청약홈 오피스텔·민간임대 수집 — 주 1회 월요일 새벽 5시 (이슈 #323)
    #      공공데이터 실거래가(토요일 5시)와 겹치지 않게 요일 분리.
    if PUBLIC_DATA_ENABLED:
        from crawler.service_applyhome_officetel import collect_officetel_presale
        from crawler.service_applyhome_rental import collect_rental_presale

        scheduler.add_job(
            collect_officetel_presale,
            "cron",
            day_of_week="mon",
            hour=5,
            minute=0,
            kwargs={"scheduler_job_id": "collect_officetel_presale"},
            id="collect_officetel_presale",
            name="청약홈 오피스텔 수집",
            max_instances=1,
            misfire_grace_time=3600,
        )
        scheduler.add_job(
            collect_rental_presale,
            "cron",
            day_of_week="mon",
            hour=5,
            minute=30,
            kwargs={"scheduler_job_id": "collect_rental_presale"},
            id="collect_rental_presale",
            name="청약홈 민간임대 수집",
            max_instances=1,
            misfire_grace_time=3600,
        )
        logger.info("청약홈 오피스텔·민간임대 수집 활성화: 월요일 05:00/05:30")

    # G. 에어코리아 대기질 수집 — 매일 새벽 2시
    if AIR_QUALITY_ENABLED:
        from crawler.env_service import collect_air_quality

        scheduler.add_job(
            collect_air_quality,
            "cron",
            hour=2,
            kwargs={"batch_size": AIR_QUALITY_BATCH_SIZE},
            id="collect_air_quality",
            name="에어코리아 대기질 수집",
            max_instances=1,
            misfire_grace_time=3600,
        )
        logger.info("에어코리아 대기질 수집 활성화: 매일 02:00 (배치 %d)", AIR_QUALITY_BATCH_SIZE)

    # H. 응급의료기관 수집 — 매월 첫째 월요일 새벽 3시
    if EMERGENCY_ENABLED:
        from crawler.env_service import collect_emergency_data

        scheduler.add_job(
            collect_emergency_data,
            "cron",
            day="1-7",
            day_of_week="mon",
            hour=3,
            kwargs={"batch_size": EMERGENCY_BATCH_SIZE},
            id="collect_emergency",
            name="응급의료기관 수집",
            max_instances=1,
            misfire_grace_time=3600,
        )
        logger.info("응급의료기관 수집 활성화: 매월 첫째 월요일 03:00 (배치 %d)", EMERGENCY_BATCH_SIZE)

    # I. 어린이집 수집 — 매월 첫째 목요일 새벽 6시
    if CHILDCARE_ENABLED:
        from crawler.env_service import collect_childcare_data

        scheduler.add_job(
            collect_childcare_data,
            "cron",
            day="1-7",
            day_of_week="thu",
            hour=6,
            kwargs={"batch_size": CHILDCARE_BATCH_SIZE},
            id="collect_childcare",
            name="어린이집 수집",
            max_instances=1,
            misfire_grace_time=3600,
        )
        logger.info("어린이집 수집 활성화: 매월 첫째 목요일 06:00 (배치 %d)", CHILDCARE_BATCH_SIZE)

    # J. 범죄통계 수집 — 분기 1회 (1/4/7/10월 첫째 일요일 새벽 4시)
    #    경찰청 범죄통계 분기별 공표 주기에 맞춤
    if CRIME_STATS_ENABLED:
        from crawler.env_service import collect_crime_stats

        scheduler.add_job(
            collect_crime_stats,
            "cron",
            month="1,4,7,10",
            day="1-7",
            day_of_week="sun",
            hour=4,
            id="collect_crime_stats",
            name="범죄통계 수집",
            max_instances=1,
            misfire_grace_time=3600,
        )
        logger.info("범죄통계 수집 활성화: 분기별 첫째 일요일 04:00")

    # L. 크롤링 모니터 — N분마다 장애 감지 + 텔레그램 알림
    if MONITOR_ENABLED:
        from crawler.monitor import run_monitor_job

        scheduler.add_job(
            run_monitor_job,
            "interval",
            minutes=MONITOR_INTERVAL_MIN,
            id="crawler_monitor",
            name="크롤링 모니터",
            max_instances=1,
            misfire_grace_time=600,
        )
        logger.info("크롤링 모니터 활성화: %d분 간격", MONITOR_INTERVAL_MIN)

    # M. 단지 가치지표 수집 — 매일 04:30
    #    complex_price_history 집계만 (네이버 API 호출 0) → IP 차단 무관.
    #    04:30 = 새벽 저트래픽 창(0~9시 매물 변동 거의 없음, services/cache.py 동적 TTL).
    #    09~12시 매물 등록 피크를 완전히 비켜감 — 배치 1000 집계가 사용자 요청과
    #    같은 micro 인스턴스 RAM 을 경합하지 않게 함 (세션 254 micro RAM 스파이크 답습).
    #    08:00 mibunyang 로컬 수집과도 더 멀어짐(기존 08:30=30분 분리 → 04:30=3.5h 분리).
    #    03:30 backfill·04:00 Wed 시세와 시작 instant 겹침 없음, 전부 max_instances=1·집계 전용.
    #    주1회→매일 전환: 집계 대상(시세 이력 보유 단지) 완주를 가속.
    if COMPLEX_METRIC_ENABLED:
        scheduler.add_job(
            collect_complex_metrics,
            "cron",
            hour=4,
            minute=30,
            kwargs={"batch_size": COMPLEX_METRIC_BATCH_SIZE, "scheduler_job_id": "collect_metrics"},
            id="collect_metrics",
            name="단지 가치지표 수집",
            max_instances=1,
            misfire_grace_time=3600,
        )
        logger.info("단지 가치지표 수집 활성화: 매일 04:30 (배치 %d)", COMPLEX_METRIC_BATCH_SIZE)

    # M-2. 빌링키 자동결제 — 매일 새벽 4시 50분 (정기결제 PR3, 세션 330).
    #   next_charge_at 도래분(status='active' AND is_default) 카드를 PortOne 빌링키 결제.
    #   PortOne 결제라 네이버 IP 차단 무관 → 04:50 = 04:30 metrics·03:50 vacuum 과 instant
    #   겹침 없는 빈 슬롯. 결제 대상이 소수(active 빌링키)라 가볍다. 3일 연속 실패 시 중단(알림).
    #   BILLING_AUTO_CHARGE_ENABLED=false 로 끄면 자동결제 미동작(카드 등록·첫결제는 무관).
    if BILLING_AUTO_CHARGE_ENABLED:
        scheduler.add_job(
            charge_due_billing_keys,
            "cron",
            hour=4,
            minute=50,
            kwargs={"scheduler_job_id": "billing_charge"},
            id="billing_charge",
            name="빌링키 자동결제",
            max_instances=1,
            misfire_grace_time=3600,
        )
        logger.info("빌링키 자동결제 활성화: 매일 04:50")

    # 정기 VACUUM (ANALYZE) articles/trades — visibility map 재악화 차단 (세션 260).
    # 03:50 = 03:30 backfill·04:00 Wed 시세·04:30 metrics 와 instant 겹침 없는 빈 슬롯.
    # DB 전용(네이버 API 0) 이라 IP 차단 무관. VACUUM 은 ACCESS SHARE only = 비차단.
    if VACUUM_MAINTENANCE_ENABLED:
        scheduler.add_job(
            run_vacuum_maintenance,
            "cron",
            hour=3,
            minute=50,
            id="vacuum_maintenance",
            name="정기 VACUUM 유지보수",
            max_instances=1,
            misfire_grace_time=3600,
        )
        logger.info("정기 VACUUM 유지보수 활성화: 매일 03:50 (articles/trades)")

    global _scheduler
    _scheduler = scheduler
    return scheduler
