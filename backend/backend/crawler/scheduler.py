"""APScheduler 기반 크롤러 스케줄러"""

import logging
import os

from apscheduler.schedulers.background import BackgroundScheduler
from dotenv import load_dotenv

from crawler.service import (
    discover_all_regions,
    crawl_articles_batch,
    crawl_article_details,
)

load_dotenv()
logger = logging.getLogger(__name__)

CRAWL_INTERVAL_HOURS = int(os.getenv("CRAWL_INTERVAL_HOURS", "12"))
CRAWL_DETAIL_INTERVAL_MIN = int(os.getenv("CRAWL_DETAIL_INTERVAL_MIN", "240"))
CRAWL_BATCH_SIZE = int(os.getenv("CRAWL_BATCH_SIZE", "50"))


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

    return scheduler
