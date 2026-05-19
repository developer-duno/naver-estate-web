"""APScheduler 기반 크롤러 스케줄러"""

import logging
import os

from apscheduler.schedulers.background import BackgroundScheduler
from dotenv import load_dotenv

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
COMPLEX_DETAIL_BATCH_SIZE = int(os.getenv("COMPLEX_DETAIL_BATCH_SIZE", "500"))
COMPLEX_METRIC_ENABLED = os.getenv("COMPLEX_METRIC_ENABLED", "true").lower() == "true"
COMPLEX_METRIC_BATCH_SIZE = int(os.getenv("COMPLEX_METRIC_BATCH_SIZE", "200"))
MONITOR_ENABLED = os.getenv("MONITOR_ENABLED", "false").lower() == "true"
MONITOR_INTERVAL_MIN = int(os.getenv("MONITOR_INTERVAL_MIN", "30"))

# 모듈 레벨 스케줄러 참조 — admin API에서 다음 실행 시각 조회용
_scheduler: BackgroundScheduler | None = None


def get_scheduler() -> BackgroundScheduler | None:
    """실행 중인 스케줄러 인스턴스 반환 (미실행 시 None)"""
    return _scheduler


def create_scheduler() -> BackgroundScheduler:
    """크롤러 스케줄러 생성 (BackgroundScheduler — 메인 스레드 차단 없음)"""
    scheduler = BackgroundScheduler()

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
            kwargs={"batch_size": PUBLIC_PRICE_BACKFILL_BATCH_SIZE},
            id="backfill_price",
            name="시세 이력 소급 수집",
            max_instances=1,
            misfire_grace_time=3600,
        )
        logger.info("시세 이력 소급 수집 활성화: 매일 03:30 (배치 %d)", PUBLIC_PRICE_BACKFILL_BATCH_SIZE)

    # E. 인기 단지 선제적 크롤링 — 하루 3회 (10:45, 14:45, 19:15 KST)
    #    기존 스케줄(B: 12시간마다, C: 4시간마다)과 충돌 회피
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

    # K. 단지 상세 유형별 backfill — 매물유형별 독립 job (05~07시 빈 슬롯)
    #    APT(4.6만)·OPST(1.5만)는 매일, 소수 유형은 주 1회. jitter 로 추가 분산.
    if COMPLEX_DETAIL_ENABLED:
        # 대량 유형 — 매일
        for hour, rtype in [(5, "APT"), (6, "OPST")]:
            scheduler.add_job(
                crawl_complex_details_batch,
                "cron",
                hour=hour,
                jitter=600,
                kwargs={"real_estate_type": rtype, "batch_size": COMPLEX_DETAIL_BATCH_SIZE,
                        "scheduler_job_id": f"complex_detail_{rtype}"},
                id=f"complex_detail_{rtype}",
                name=f"단지 상세 backfill {rtype} {hour:02d}:00",
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
        logger.info("단지 상세 backfill 활성화: APT 05:00 / OPST 06:00 매일, JGC·ABYG·OBYG 주1회 07:00 (배치 %d)", COMPLEX_DETAIL_BATCH_SIZE)

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

    # M. 단지 가치지표 수집 — 매일 08:30
    #    complex_price_history 집계만 (네이버 API 호출 0) → IP 차단 무관.
    #    08:30 = 08:00 mibunyang 로컬 수집과 30분 분리 + 05~07시 단지 상세
    #    backfill(complexes UPDATE) 시간대 밖 — row 경합 회피.
    #    주1회→매일 전환: 집계 대상(시세 이력 보유 단지) 완주를 가속.
    if COMPLEX_METRIC_ENABLED:
        scheduler.add_job(
            collect_complex_metrics,
            "cron",
            hour=8,
            minute=30,
            kwargs={"batch_size": COMPLEX_METRIC_BATCH_SIZE, "scheduler_job_id": "collect_metrics"},
            id="collect_metrics",
            name="단지 가치지표 수집",
            max_instances=1,
            misfire_grace_time=3600,
        )
        logger.info("단지 가치지표 수집 활성화: 매일 08:30 (배치 %d)", COMPLEX_METRIC_BATCH_SIZE)

    global _scheduler
    _scheduler = scheduler
    return scheduler
