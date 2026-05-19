"""크롤링 모니터 테스트 — 장애 감지 + 쿨다운
실행: python -m pytest tests/test_monitor.py -v
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from sqlalchemy import select

from crawler.monitor import _job_stats, detect_issues, run_monitor
from db.models import Article, CrawlJob, MonitorAlert
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


def test_detect_issues_failed_includes_data_fields():
    """정상: crawl_failed 장애에 kind·data 구조화 필드가 붙는다"""
    db = TestSession()
    try:
        db.add(CrawlJob(
            job_type="complex_articles", status="failed",
            error_message="네이버 502", started_at=_utcnow(),
            completed_at=_utcnow(), created_at=_utcnow(),
        ))
        db.commit()
        issue = next(i for i in detect_issues(db) if i["kind"] == "crawl_failed")
        assert issue["data"]["job_type"] == "complex_articles"
        assert issue["data"]["count"] == 1
        assert issue["data"]["error"] == "네이버 502"
        assert "detail" in issue  # 평문 detail 유지
    finally:
        db.close()


def test_detect_issues_stale_data_fields():
    """정상: crawl_stale 장애 data 에 stale_hours·started_at 포함"""
    db = TestSession()
    try:
        old = _utcnow() - timedelta(hours=2)
        db.add(CrawlJob(
            job_type="crawl_details", status="running",
            started_at=old, created_at=old,
        ))
        db.commit()
        issue = next(i for i in detect_issues(db) if i["kind"] == "crawl_stale")
        assert issue["data"]["job_type"] == "crawl_details"
        assert issue["data"]["stale_hours"] == 1
        assert issue["data"]["started_at"] is not None
    finally:
        db.close()


def test_job_stats_no_completed_returns_none():
    """엣지: completed 작업이 없으면 _job_stats 는 None"""
    db = TestSession()
    try:
        db.add(CrawlJob(
            job_type="complex_articles", status="failed",
            started_at=_utcnow(), created_at=_utcnow(),
        ))
        db.commit()
        assert _job_stats(db, "complex_articles") is None
    finally:
        db.close()


def test_job_stats_returns_last_completed():
    """정상: completed 작업이 있으면 마지막 1건의 처리 통계 반환"""
    db = TestSession()
    try:
        db.add(CrawlJob(
            job_type="complex_articles", status="completed",
            processed_items=40, total_items=50,
            started_at=_utcnow(), completed_at=_utcnow(), created_at=_utcnow(),
        ))
        db.commit()
        stats = _job_stats(db, "complex_articles")
        assert stats is not None
        assert stats["processed"] == 40
        assert stats["total"] == 50
    finally:
        db.close()


def test_detect_issues_freshness_data_fields():
    """정상: 매물 데이터가 36시간 넘게 안 갱신 → freshness red 장애 + data 필드"""
    db = TestSession()
    try:
        # articles 신선도 기준 = 12h, red = 36h 초과 → 40시간 전 매물 1건
        stale = _utcnow() - timedelta(hours=40)
        db.add(Article(
            article_no="test-art-1", complex_no="test-cx-1",
            created_at=stale, updated_at=stale,
        ))
        db.commit()
        freshness = [i for i in detect_issues(db) if i["kind"] == "freshness"]
        articles_issue = next(
            (i for i in freshness if i["alert_key"] == "freshness:articles"), None
        )
        assert articles_issue is not None
        data = articles_issue["data"]
        assert data["label"] == "매물"
        assert data["status"] == "red"
        assert data["age_hours"] is not None and data["age_hours"] >= 36
        assert data["link_path"] == "/admin#freshness"
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


def test_run_monitor_send_failure_does_not_record_notified():
    """버그 가드: 텔레그램 발송 실패 시 last_notified 를 찍지 않는다 (다음 스캔 재시도 가능)"""
    db = TestSession()
    try:
        db.add(CrawlJob(
            job_type="complex_articles", status="failed",
            error_message="네이버 502", started_at=_utcnow(),
            completed_at=_utcnow(), created_at=_utcnow(),
        ))
        db.commit()
        with patch("crawler.monitor.send_telegram", return_value=False):
            run_monitor(db)
        alert = db.execute(
            select(MonitorAlert).where(MonitorAlert.alert_key == "crawl_failed:complex_articles")
        ).scalar_one()
        assert alert.status == "active"
        assert alert.last_notified is None  # 발송 실패 → 미기록
    finally:
        db.close()


def test_run_monitor_sends_html_parse_mode():
    """정상: 새 장애 발송 시 parse_mode='HTML' + <b> 태그 포함 메시지"""
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
        mock_tg.assert_called_once()
        text, kwargs = mock_tg.call_args[0][0], mock_tg.call_args[1]
        assert kwargs["parse_mode"] == "HTML"
        assert "<b>" in text
        assert "complex_articles" in text
    finally:
        db.close()


def test_run_monitor_cooldown_expired_resends():
    """정상: 쿨다운(6h) 지난 진행 중 장애는 텔레그램 재발송"""
    db = TestSession()
    try:
        db.add(CrawlJob(
            job_type="complex_articles", status="failed",
            error_message="네이버 502", started_at=_utcnow(),
            completed_at=_utcnow(), created_at=_utcnow(),
        ))
        db.add(MonitorAlert(
            alert_key="crawl_failed:complex_articles", status="active",
            detail="이전", last_notified=_utcnow() - timedelta(hours=7),
        ))
        db.commit()
        with patch("crawler.monitor.send_telegram", return_value=True) as mock_tg:
            run_monitor(db)
        assert mock_tg.called  # 쿨다운 만료 → 재발송
    finally:
        db.close()
