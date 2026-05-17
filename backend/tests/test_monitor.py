"""크롤링 모니터 테스트 — 장애 감지 + 쿨다운
실행: python -m pytest tests/test_monitor.py -v
"""

from datetime import datetime, timedelta, timezone

from crawler.monitor import detect_issues
from db.models import CrawlJob
from tests.conftest import TestSession


def _utcnow():
    return datetime.now(timezone.utc)


def test_detect_issues_empty_db_no_issues():
    """정상: 빈 DB 면 장애 0건"""
    db = TestSession()
    try:
        issues = detect_issues(db)
        assert issues == []
    finally:
        db.close()


def test_detect_issues_failed_job():
    """정상: status=failed 작업이 있으면 crawl_failed 장애 1건"""
    db = TestSession()
    try:
        db.add(CrawlJob(
            job_type="complex_articles", status="failed",
            error_message="네이버 502", started_at=_utcnow(),
            completed_at=_utcnow(), created_at=_utcnow(),
        ))
        db.commit()
        issues = detect_issues(db)
        keys = [i["alert_key"] for i in issues]
        assert "crawl_failed:complex_articles" in keys
    finally:
        db.close()


def test_detect_issues_stale_running_job():
    """정상: running 상태로 1시간 넘게 멈춘 작업 → crawl_stale 장애"""
    db = TestSession()
    try:
        old = _utcnow() - timedelta(hours=2)
        db.add(CrawlJob(
            job_type="crawl_details", status="running",
            started_at=old, created_at=old,
        ))
        db.commit()
        issues = detect_issues(db)
        keys = [i["alert_key"] for i in issues]
        assert "crawl_stale:crawl_details" in keys
    finally:
        db.close()


def test_detect_issues_recent_running_not_stale():
    """엣지: 방금 시작한 running 작업은 마비 아님 (장애 아님)"""
    db = TestSession()
    try:
        db.add(CrawlJob(
            job_type="crawl_details", status="running",
            started_at=_utcnow(), created_at=_utcnow(),
        ))
        db.commit()
        issues = detect_issues(db)
        keys = [i["alert_key"] for i in issues]
        assert "crawl_stale:crawl_details" not in keys
    finally:
        db.close()


def test_detect_issues_running_just_under_stale_boundary():
    """엣지: 59분 전 시작 running 은 마비 아님 (1h 경계 직전)"""
    db = TestSession()
    try:
        db.add(CrawlJob(
            job_type="crawl_details", status="running",
            started_at=_utcnow() - timedelta(minutes=59),
            created_at=_utcnow() - timedelta(minutes=59),
        ))
        db.commit()
        assert "crawl_stale:crawl_details" not in [i["alert_key"] for i in detect_issues(db)]
    finally:
        db.close()


def test_detect_issues_running_just_over_stale_boundary():
    """엣지: 61분 전 시작 running 은 마비 (1h 경계 직후)"""
    db = TestSession()
    try:
        db.add(CrawlJob(
            job_type="crawl_details", status="running",
            started_at=_utcnow() - timedelta(minutes=61),
            created_at=_utcnow() - timedelta(minutes=61),
        ))
        db.commit()
        assert "crawl_stale:crawl_details" in [i["alert_key"] for i in detect_issues(db)]
    finally:
        db.close()


def test_detect_issues_old_failed_job_outside_window():
    """엣지: 25시간 전 실패 작업은 24h 윈도 밖 — 감지 안 됨"""
    db = TestSession()
    try:
        old = _utcnow() - timedelta(hours=25)
        db.add(CrawlJob(
            job_type="complex_articles", status="failed",
            error_message="오래된 실패", started_at=old,
            completed_at=old, created_at=old,
        ))
        db.commit()
        assert "crawl_failed:complex_articles" not in [i["alert_key"] for i in detect_issues(db)]
    finally:
        db.close()
