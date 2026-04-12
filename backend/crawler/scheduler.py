"""APScheduler 기반 크롤러 스케줄러"""

import logging
import os

from apscheduler.schedulers.background import BackgroundScheduler
from dotenv import load_dotenv

from crawler.service import (
    collect_price_history,
    crawl_article_details,
    crawl_articles_batch,
    crawl_popular_complexes,
    discover_all_regions,
)

load_dotenv()
logger = logging.getLogger(__name__)

CRAWL_INTERVAL_HOURS = int(os.getenv("CRAWL_INTERVAL_HOURS", "12"))
CRAWL_DETAIL_INTERVAL_MIN = int(os.getenv("CRAWL_DETAIL_INTERVAL_MIN", "240"))
CRAWL_BATCH_SIZE = int(os.getenv("CRAWL_BATCH_SIZE", "50"))
POPULAR_CRAWL_ENABLED = os.getenv("POPULAR_CRAWL_ENABLED", "true").lower() == "true"
POPULAR_CRAWL_BATCH_SIZE = int(os.getenv("POPULAR_CRAWL_BATCH_SIZE", "100"))
PUBLIC_DATA_ENABLED = os.getenv("PUBLIC_DATA_ENABLED", "false").lower() == "true"
PUBLIC_DATA_BATCH_SIZE = int(os.getenv("PUBLIC_DATA_BATCH_SIZE", "300"))
AIR_QUALITY_ENABLED = os.getenv("AIR_QUALITY_ENABLED", "false").lower() == "true"
AIR_QUALITY_BATCH_SIZE = int(os.getenv("AIR_QUALITY_BATCH_SIZE", "100"))
EMERGENCY_ENABLED = os.getenv("EMERGENCY_ENABLED", "false").lower() == "true"
EMERGENCY_BATCH_SIZE = int(os.getenv("EMERGENCY_BATCH_SIZE", "100"))
CHILDCARE_ENABLED = os.getenv("CHILDCARE_ENABLED", "false").lower() == "true"
CHILDCARE_BATCH_SIZE = int(os.getenv("CHILDCARE_BATCH_SIZE", "100"))
CRIME_STATS_ENABLED = os.getenv("CRIME_STATS_ENABLED", "false").lower() == "true"

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
    scheduler.add_job(
        crawl_articles_batch,
        "interval",
        hours=CRAWL_INTERVAL_HOURS,
        jitter=1800,
        kwargs={"batch_size": CRAWL_BATCH_SIZE, "scheduler_job_id": "crawl_articles"},
        id="crawl_articles",
        name="매물 수집 배치",
        misfire_grace_time=1800,
    )

    # C. 상세 보강 — N분마다 (jitter: 같은 IP 네이버 요청 분산)
    scheduler.add_job(
        crawl_article_details,
        "interval",
        minutes=CRAWL_DETAIL_INTERVAL_MIN,
        jitter=900,
        kwargs={"batch_size": 100, "scheduler_job_id": "crawl_details"},
        id="crawl_details",
        name="매물 상세 보강",
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

    # E. 인기 단지 선제적 크롤링 — 하루 3회 (10:30, 14:30, 19:00 KST)
    #    기존 스케줄(B: 12시간마다, C: 4시간마다)과 충돌 회피
    if POPULAR_CRAWL_ENABLED:
        for hour, minute, job_id in [(10, 30, "popular_1030"), (14, 30, "popular_1430"), (19, 0, "popular_1900")]:
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
        logger.info("인기 단지 선제적 크롤링 활성화: 10:30, 14:30, 19:00 (배치 %d)", POPULAR_CRAWL_BATCH_SIZE)

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

    global _scheduler
    _scheduler = scheduler
    return scheduler
