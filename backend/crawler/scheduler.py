"""APScheduler 기반 크롤러 스케줄러"""

import logging
import os

from apscheduler.schedulers.background import BackgroundScheduler
from dotenv import load_dotenv

from crawler.service import (
    discover_all_regions,
    crawl_articles_batch,
    crawl_article_details,
    collect_price_history,
    crawl_popular_complexes,
)

load_dotenv()
logger = logging.getLogger(__name__)

CRAWL_INTERVAL_HOURS = int(os.getenv("CRAWL_INTERVAL_HOURS", "12"))
CRAWL_DETAIL_INTERVAL_MIN = int(os.getenv("CRAWL_DETAIL_INTERVAL_MIN", "240"))
CRAWL_BATCH_SIZE = int(os.getenv("CRAWL_BATCH_SIZE", "50"))
POPULAR_CRAWL_ENABLED = os.getenv("POPULAR_CRAWL_ENABLED", "true").lower() == "true"
POPULAR_CRAWL_BATCH_SIZE = int(os.getenv("POPULAR_CRAWL_BATCH_SIZE", "100"))


def create_scheduler() -> BackgroundScheduler:
    """크롤러 스케줄러 생성 (BackgroundScheduler — 메인 스레드 차단 없음)"""
    scheduler = BackgroundScheduler()

    # A. 단지 발견 — 주 1회 일요일 새벽 3시
    scheduler.add_job(
        discover_all_regions,
        "cron",
        day_of_week="sun",
        hour=3,
        id="discover_regions",
        name="전국 단지 발견",
        misfire_grace_time=3600,
    )

    # B. 매물 수집 — N시간마다
    scheduler.add_job(
        crawl_articles_batch,
        "interval",
        hours=CRAWL_INTERVAL_HOURS,
        kwargs={"batch_size": CRAWL_BATCH_SIZE},
        id="crawl_articles",
        name="매물 수집 배치",
        misfire_grace_time=1800,
    )

    # C. 상세 보강 — N분마다
    scheduler.add_job(
        crawl_article_details,
        "interval",
        minutes=CRAWL_DETAIL_INTERVAL_MIN,
        kwargs={"batch_size": 100},
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
        kwargs={"batch_size": CRAWL_BATCH_SIZE},
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
                kwargs={"batch_size": POPULAR_CRAWL_BATCH_SIZE},
                id=job_id,
                name=f"인기 단지 크롤링 {hour:02d}:{minute:02d}",
                max_instances=1,
                misfire_grace_time=1800,
            )
        logger.info("인기 단지 선제적 크롤링 활성화: 10:30, 14:30, 19:00 (배치 %d)", POPULAR_CRAWL_BATCH_SIZE)

    return scheduler
