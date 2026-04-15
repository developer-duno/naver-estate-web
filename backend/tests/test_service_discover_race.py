"""service_discover._finalize_job race 가드 테스트.

관리자가 pause/cancel 한 잡을 워커가 completed/failed 로 덮어쓰지 않는지 검증.
"""
from datetime import datetime, timezone
from unittest.mock import MagicMock

from crawler.service_discover import _finalize_job
from db.models import CrawlJob


def test_finalize_job_overwrites_running():
    """running 상태 → 정상적으로 target_status 로 전환"""
    job = CrawlJob(
        id=1,
        job_type="complex_articles",
        status="running",
        started_at=datetime.now(timezone.utc),
    )
    db = MagicMock()
    db.refresh = MagicMock(side_effect=lambda j: None)  # 실제 refresh 없이 통과
    result = _finalize_job(db, job, "completed", processed_items=10)
    assert result is True
    assert job.status == "completed"
    assert job.processed_items == 10


def test_finalize_job_skips_paused():
    """paused 상태 → 덮어쓰기 skip (관리자가 먼저 pause 한 경우)"""
    job = CrawlJob(
        id=2,
        job_type="complex_articles",
        status="paused",
        started_at=datetime.now(timezone.utc),
    )
    db = MagicMock()
    db.refresh = MagicMock(side_effect=lambda j: None)
    result = _finalize_job(db, job, "completed", processed_items=10)
    assert result is False
    assert job.status == "paused"  # 보존됨
    assert job.processed_items is None  # 할당 안 됨


def test_finalize_job_skips_cancelled():
    """cancelled 상태도 덮어쓰기 skip"""
    job = CrawlJob(
        id=3,
        job_type="popular_crawl",
        status="cancelled",
        started_at=datetime.now(timezone.utc),
    )
    db = MagicMock()
    db.refresh = MagicMock(side_effect=lambda j: None)
    result = _finalize_job(db, job, "failed", error_message="boom")
    assert result is False
    assert job.status == "cancelled"
