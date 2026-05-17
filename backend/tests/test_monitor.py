"""크롤링 모니터 테스트 — 장애 감지 + 쿨다운
실행: python -m pytest tests/test_monitor.py -v
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from sqlalchemy import select

from crawler.monitor import detect_issues, run_monitor
from db.models import CrawlJob, MonitorAlert
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


def test_run_monitor_new_issue_sends_telegram():
    """정상: 새 장애 → 텔레그램 발송 + monitor_alerts active 행 생성"""
    db = TestSession()
    try:
        db.add(CrawlJob(
            job_type="complex_articles", status="failed",
            error_message="네이버 502", started_at=_utcnow(),
            completed_at=_utcnow(), created_at=_utcnow(),
        ))
        db.commit()
        with patch("crawler.monitor.send_telegram", return_value=True) as mock_tg:
            run_monitor(db)
        assert mock_tg.called
        alert = db.execute(
            select(MonitorAlert).where(MonitorAlert.alert_key == "crawl_failed:complex_articles")
        ).scalar_one()
        assert alert.status == "active"
        assert alert.last_notified is not None
    finally:
        db.close()


def test_run_monitor_same_issue_within_cooldown_suppressed():
    """정상: 같은 장애가 쿨다운 내 재발 → 텔레그램 재발송 안 함"""
    db = TestSession()
    try:
        db.add(CrawlJob(
            job_type="complex_articles", status="failed",
            error_message="네이버 502", started_at=_utcnow(),
            completed_at=_utcnow(), created_at=_utcnow(),
        ))
        db.add(MonitorAlert(
            alert_key="crawl_failed:complex_articles", status="active",
            detail="이전", last_notified=_utcnow(),
        ))
        db.commit()
        with patch("crawler.monitor.send_telegram", return_value=True) as mock_tg:
            run_monitor(db)
        assert not mock_tg.called
    finally:
        db.close()


def test_run_monitor_resolved_issue_sends_recovery():
    """정상: 이전 active 장애가 이번 스캔에 없음 → 복구 알림 + resolved"""
    db = TestSession()
    try:
        db.add(MonitorAlert(
            alert_key="crawl_failed:complex_articles", status="active",
            detail="이전", last_notified=_utcnow() - timedelta(hours=12),
        ))
        db.commit()
        with patch("crawler.monitor.send_telegram", return_value=True) as mock_tg:
            run_monitor(db)
        assert mock_tg.called
        alert = db.execute(
            select(MonitorAlert).where(MonitorAlert.alert_key == "crawl_failed:complex_articles")
        ).scalar_one()
        assert alert.status == "resolved"
    finally:
        db.close()
