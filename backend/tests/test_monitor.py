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


def test_detect_issues_public_trade_under_type_threshold_not_stale():
    """엣지(세션266): public_trade_data 는 정상 80분 도므로 1h 초과여도 마비 아님.

    기본 임계 1h 면 오탐(5/29 가짜 경보)이지만 job_type 임계 3h 미만이라 skip.
    """
    db = TestSession()
    try:
        started = _utcnow() - timedelta(minutes=80)
        db.add(CrawlJob(
            job_type="public_trade_data", status="running",
            started_at=started, created_at=started,
        ))
        db.commit()
        keys = [i["alert_key"] for i in detect_issues(db)]
        assert "crawl_stale:public_trade_data" not in keys
    finally:
        db.close()


def test_detect_issues_public_trade_over_type_threshold_stale():
    """정상(세션266): public_trade_data 가 3h(job_type 임계) 넘으면 진짜 마비."""
    db = TestSession()
    try:
        started = _utcnow() - timedelta(hours=4)
        db.add(CrawlJob(
            job_type="public_trade_data", status="running",
            started_at=started, created_at=started,
        ))
        db.commit()
        issue = next(
            (i for i in detect_issues(db) if i["alert_key"] == "crawl_stale:public_trade_data"),
            None,
        )
        assert issue is not None
        assert issue["data"]["stale_hours"] == 3
    finally:
        db.close()


def test_detect_issues_official_price_under_type_threshold_not_stale():
    """엣지(2026-08-15): official_price 는 정상 3~7시간 도므로 10h 여도 마비 아님.

    기본 임계 1h 면 오탐(8/15 job 43010 이 07:31 sweep 당하고 텔레그램 실발화)이지만
    job_type 임계 16h 미만이라 skip.
    """
    db = TestSession()
    try:
        started = _utcnow() - timedelta(hours=10)
        db.add(CrawlJob(
            job_type="official_price", status="running",
            started_at=started, created_at=started,
        ))
        db.commit()
        keys = [i["alert_key"] for i in detect_issues(db)]
        assert "crawl_stale:official_price" not in keys
    finally:
        db.close()


def test_detect_issues_official_price_over_type_threshold_stale():
    """정상(2026-08-15): official_price 가 16h(job_type 임계) 넘으면 진짜 마비."""
    db = TestSession()
    try:
        started = _utcnow() - timedelta(hours=17)
        db.add(CrawlJob(
            job_type="official_price", status="running",
            started_at=started, created_at=started,
        ))
        db.commit()
        issue = next(
            (i for i in detect_issues(db) if i["alert_key"] == "crawl_stale:official_price"),
            None,
        )
        assert issue is not None
        assert issue["data"]["stale_hours"] == 16
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


# ── stale running 잡 감지 즉시 cancelled 정리 (세션 269) ──


def test_run_monitor_sweeps_stale_running_to_cancelled():
    """정상: 1시간 넘게 running 인 잡 → run_monitor 가 cancelled + completed_at 정리"""
    db = TestSession()
    try:
        old = _utcnow() - timedelta(hours=2)
        job = CrawlJob(
            job_type="crawl_details", status="running",
            started_at=old, created_at=old,
        )
        db.add(job)
        db.commit()
        job_id = job.id

        with patch("crawler.monitor.send_telegram", return_value=True):
            run_monitor(db)

        swept = db.execute(
            select(CrawlJob).where(CrawlJob.id == job_id)
        ).scalar_one()
        assert swept.status == "cancelled"
        assert swept.completed_at is not None
        assert swept.error_message == "stale running — swept by monitor"
    finally:
        db.close()


def test_run_monitor_does_not_sweep_recent_running():
    """경계: stale 임계 미만(방금 시작) running 잡은 정리 안 됨 (running 유지)"""
    db = TestSession()
    try:
        recent = _utcnow() - timedelta(minutes=10)
        job = CrawlJob(
            job_type="crawl_details", status="running",
            started_at=recent, created_at=recent,
        )
        db.add(job)
        db.commit()
        job_id = job.id

        with patch("crawler.monitor.send_telegram", return_value=True):
            run_monitor(db)

        still = db.execute(
            select(CrawlJob).where(CrawlJob.id == job_id)
        ).scalar_one()
        assert still.status == "running"
        assert still.completed_at is None
    finally:
        db.close()


def test_run_monitor_respects_job_type_threshold():
    """경계: public_trade_data 는 3h 임계 — 80분 running 은 정리 안 됨 (오탐 방지)"""
    db = TestSession()
    try:
        eighty_min = _utcnow() - timedelta(minutes=80)
        job = CrawlJob(
            job_type="public_trade_data", status="running",
            started_at=eighty_min, created_at=eighty_min,
        )
        db.add(job)
        db.commit()
        job_id = job.id

        with patch("crawler.monitor.send_telegram", return_value=True):
            run_monitor(db)

        still = db.execute(
            select(CrawlJob).where(CrawlJob.id == job_id)
        ).scalar_one()
        assert still.status == "running"
    finally:
        db.close()


def test_run_monitor_does_not_sweep_official_price_under_threshold():
    """경계(2026-08-15): official_price 는 16h 임계 — 10h running 은 정리 안 됨.

    실사고 재현 가드: 8/15 job 43010 이 06:30 시작 → 07:31 에 status='cancelled',
    error_message='stale running — swept by monitor' 로 오탐 sweep 당했으나 실제로는
    07:55 까지 44,621행 수집 중이었다. 이 테스트가 그 sweep 을 차단한다.
    """
    db = TestSession()
    try:
        ten_hours = _utcnow() - timedelta(hours=10)
        job = CrawlJob(
            job_type="official_price", status="running",
            started_at=ten_hours, created_at=ten_hours,
        )
        db.add(job)
        db.commit()
        job_id = job.id

        with patch("crawler.monitor.send_telegram", return_value=True) as mock_tg:
            run_monitor(db)

        still = db.execute(
            select(CrawlJob).where(CrawlJob.id == job_id)
        ).scalar_one()
        assert still.status == "running"
        assert still.completed_at is None
        # 알림 경로도 함께 확인 — 오탐 텔레그램이 발화하지 않아야 한다
        assert not mock_tg.called
    finally:
        db.close()


def test_run_monitor_sweeps_official_price_over_threshold():
    """정상(2026-08-15): official_price 도 16h 넘으면 진짜 마비 — sweep 은 계속 동작."""
    db = TestSession()
    try:
        seventeen_hours = _utcnow() - timedelta(hours=17)
        job = CrawlJob(
            job_type="official_price", status="running",
            started_at=seventeen_hours, created_at=seventeen_hours,
        )
        db.add(job)
        db.commit()
        job_id = job.id

        with patch("crawler.monitor.send_telegram", return_value=True):
            run_monitor(db)

        swept = db.execute(
            select(CrawlJob).where(CrawlJob.id == job_id)
        ).scalar_one()
        assert swept.status == "cancelled"
        assert swept.completed_at is not None
    finally:
        db.close()


def test_run_monitor_sweep_preserves_existing_error_message():
    """엣지: 기존 error_message 는 보존하되 스윕 마커를 append 한다.

    세션 391 정정: 옛 구현은 COALESCE 라 값이 있으면 마커를 아예 안 붙였는데,
    진행 상황을 error_message 에 남기는 잡(official_price)이 그 탓에 해소 사유
    판정에서 'swept' 가 아니라 '수동 취소' 로 오분류됐다. 원문 보존 + 마커 보장.
    """
    db = TestSession()
    try:
        old = _utcnow() - timedelta(hours=2)
        job = CrawlJob(
            job_type="crawl_details", status="running",
            error_message="이미 있던 에러", started_at=old, created_at=old,
        )
        db.add(job)
        db.commit()
        job_id = job.id

        with patch("crawler.monitor.send_telegram", return_value=True):
            run_monitor(db)

        swept = db.execute(
            select(CrawlJob).where(CrawlJob.id == job_id)
        ).scalar_one()
        assert swept.status == "cancelled"
        assert "이미 있던 에러" in (swept.error_message or "")  # 원문 보존
        assert "swept" in (swept.error_message or "")  # 마커 보장
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


def test_detect_issues_skips_failed_with_later_completed():
    """버그 가드: 옛 failed + 그 후 completed = 자가 복구로 간주, 발화 skip

    배경: 24h 윈도 안에 옛 failed 가 있으면 매 스캔마다 active 유지되어
    monitor_alerts auto-resolve 가 영구 차단되던 결함 정정 (사용자 보고 2026-05-24).
    """
    db = TestSession()
    try:
        now = _utcnow()
        db.add(CrawlJob(
            job_type="complex_list", status="failed",
            error_message="SSL 끊김",
            started_at=now - timedelta(hours=5),
            completed_at=now - timedelta(hours=5),
            created_at=now - timedelta(hours=5),
        ))
        db.add(CrawlJob(
            job_type="complex_list", status="completed",
            started_at=now - timedelta(hours=1),
            completed_at=now - timedelta(hours=1),
            created_at=now - timedelta(hours=1),
        ))
        db.commit()
        issues = detect_issues(db)
        assert not any(i["alert_key"] == "crawl_failed:complex_list" for i in issues)
    finally:
        db.close()


def test_detect_issues_still_fires_when_latest_is_failed():
    """버그 가드: completed 이후 다시 failed 가 발생하면 정상 발화 (skip 로직 과적용 방지)"""
    db = TestSession()
    try:
        now = _utcnow()
        db.add(CrawlJob(
            job_type="complex_list", status="completed",
            started_at=now - timedelta(hours=3),
            completed_at=now - timedelta(hours=3),
            created_at=now - timedelta(hours=3),
        ))
        db.add(CrawlJob(
            job_type="complex_list", status="failed",
            error_message="다시 실패",
            started_at=now - timedelta(hours=1),
            completed_at=now - timedelta(hours=1),
            created_at=now - timedelta(hours=1),
        ))
        db.commit()
        issues = detect_issues(db)
        keys = [i["alert_key"] for i in issues]
        assert "crawl_failed:complex_list" in keys
    finally:
        db.close()


def test_run_monitor_recovered_failed_sends_resolved_alert():
    """버그 가드 (통합): 옛 failed + 그 후 completed + active alert 존재 →
    detect_issues 에서 빠짐 → run_monitor line 215 분기 → '✅ 크롤링 복구' 발송 + status='resolved'.

    사용자 인사이트 (2026-05-24): "텔레그램은 현재 상태의 정확한 지표 — 잘 되면 잘 되었다고 알려줘야 함"
    """
    db = TestSession()
    try:
        now = _utcnow()
        db.add(CrawlJob(
            job_type="complex_list", status="failed",
            error_message="SSL 끊김",
            started_at=now - timedelta(hours=5),
            completed_at=now - timedelta(hours=5),
            created_at=now - timedelta(hours=5),
        ))
        db.add(CrawlJob(
            job_type="complex_list", status="completed",
            started_at=now - timedelta(hours=1),
            completed_at=now - timedelta(hours=1),
            created_at=now - timedelta(hours=1),
        ))
        db.add(MonitorAlert(
            alert_key="crawl_failed:complex_list", status="active",
            detail="complex_list 작업 1건 실패 — SSL 끊김",
            last_notified=now - timedelta(hours=4),
        ))
        db.commit()
        with patch("crawler.monitor.send_telegram", return_value=True) as mock_tg:
            run_monitor(db)
        assert mock_tg.called  # 복구 알림 발송됨
        # 메시지 본문에 "복구" 또는 "정상으로 돌아왔습니다" 포함
        sent_msg = mock_tg.call_args[0][0]
        assert "복구" in sent_msg or "정상으로 돌아왔습니다" in sent_msg
        alert = db.execute(
            select(MonitorAlert).where(MonitorAlert.alert_key == "crawl_failed:complex_list")
        ).scalar_one()
        assert alert.status == "resolved"
    finally:
        db.close()


# ── 세션 342: compute_freshness timeout 트랜잭션 격리 회귀 ──
# 배경: monitor 가 compute_freshness(8종목 풀스캔)를 메인 db 로 호출하다 8초
# statement_timeout 을 넘기면 트랜잭션이 aborted → 그 뒤 monitor_alerts SELECT/UPDATE 가
# InFailedSqlTransaction 으로 연쇄 실패, 매 10분 크래시. 수정 = freshness 를 별도 세션으로
# 격리. 아래 테스트는 compute_freshness 가 raise 해도 메인 트랜잭션이 살아있음을 단언.


def test_detect_issues_freshness_raise_does_not_poison_main_tx():
    """compute_freshness 가 예외(timeout 모사)를 던져도 detect_issues 는 정상 반환하고
    메인 db 세션은 오염되지 않아 이후 쿼리가 살아있다."""
    from sqlalchemy.exc import OperationalError

    db = TestSession()
    try:
        now = _utcnow()
        # 감지될 failed 잡 1건 (freshness 이전 단계에서 이미 issues 에 담김)
        db.add(CrawlJob(
            job_type="complex_list", status="failed",
            created_at=now - timedelta(hours=1),
            error_message="SSL 끊김",
        ))
        db.commit()

        # compute_freshness 가 timeout 처럼 raise — 별도 세션에서 실패해도 메인 무손상이어야
        with patch(
            "crawler.monitor.compute_freshness",
            side_effect=OperationalError("SELECT ...", {}, Exception("statement timeout")),
        ):
            issues = detect_issues(db)

        # freshness 신호는 빠지지만 failed 신호는 정상 감지 (예외가 전파되지 않음)
        keys = {i["alert_key"] for i in issues}
        assert "crawl_failed:complex_list" in keys
        assert not any(k.startswith("freshness:") for k in keys)

        # ★ 핵심: 메인 db 트랜잭션이 살아있어 이후 쿼리가 성공해야 한다
        #   (격리 실패 시 여기서 InFailedSqlTransaction 이 났었음)
        row = db.execute(select(CrawlJob).where(CrawlJob.job_type == "complex_list")).scalar_one()
        assert row is not None
    finally:
        db.close()


def test_run_monitor_completes_alerts_when_freshness_times_out():
    """run_monitor 전체가 compute_freshness timeout 후에도 monitor_alerts 를 정상
    기록/발송한다(트랜잭션 격리 덕에 alert 처리가 통째로 실패하지 않음)."""
    from sqlalchemy.exc import OperationalError

    db = TestSession()
    try:
        now = _utcnow()
        db.add(CrawlJob(
            job_type="complex_list", status="failed",
            created_at=now - timedelta(hours=1),
            error_message="SSL 끊김",
        ))
        db.commit()

        with patch(
            "crawler.monitor.compute_freshness",
            side_effect=OperationalError("SELECT ...", {}, Exception("statement timeout")),
        ), patch("crawler.monitor.send_telegram", return_value=True) as mock_tg:
            run_monitor(db)

        # 알림이 발송되고 monitor_alerts 행이 기록됨 (트랜잭션 안 죽음)
        assert mock_tg.called
        alert = db.execute(
            select(MonitorAlert).where(MonitorAlert.alert_key == "crawl_failed:complex_list")
        ).scalar_one()
        assert alert.status == "active"
    finally:
        db.close()


# ── 세션 391: 가짜 복구 3경로 구분 (§5-C) ──
# "이번 스캔에 키가 없다" 를 전부 '✅ 정상으로 돌아왔습니다' 로 통지하던 결함.
# ① 스윕 강제 cancelled ② 24h 창 이탈(성공 미확인) ③ 신선도 계산 실패로 키 소멸.
# 사유(reason) 는 문구에만 영향 — status 전환(resolved)은 전부 기존과 동일해야 한다.


def _is_resolved_message(msg: str) -> bool:
    """해소 알림인가 — 사유(reason)에 따라 헤더가 '크롤링 복구'/'알림 종료' 로 갈린다.

    셀렉터를 특정 헤더 문구에 묶으면, 헤더가 사유별로 갈리는 순간 '해소 알림을
    못 찾음' 으로 오탐한다. 두 헤더를 모두 인정해 사유와 무관하게 고른다.
    """
    return "크롤링 복구" in msg or "알림 종료" in msg


def _resolved_message(mock_tg) -> str:
    """발송된 메시지 중 해소 알림 1건을 골라 반환 (사유 무관)."""
    msgs = [c[0][0] for c in mock_tg.call_args_list if _is_resolved_message(c[0][0])]
    assert msgs, f"해소 알림이 발송되지 않았다: {[c[0][0] for c in mock_tg.call_args_list]}"
    return msgs[0]


def test_run_monitor_resolved_after_sweep_says_swept():
    """경로 ①: 직전 스캔 스윕(cancelled + 'swept' 마커) → 다음 스캔 해소는 swept 문구.

    스윕은 '멈춘 잡을 강제로 끊은 것' 이지 복구가 아니다 — 복구라고 통지하면
    사장님이 원인 미해결 상태를 정상으로 오인한다.
    """
    db = TestSession()
    try:
        now = _utcnow()
        # 직전 스캔에서 스윕당한 잡 (monitor 스윕 마커)
        db.add(CrawlJob(
            job_type="crawl_details", status="cancelled",
            error_message="stale running — swept by monitor",
            started_at=now - timedelta(hours=3), completed_at=now - timedelta(minutes=10),
            created_at=now - timedelta(hours=3),
        ))
        db.add(MonitorAlert(
            alert_key="crawl_stale:crawl_details", status="active",
            detail="crawl_details 작업 1건이 1시간 넘게 running 상태 — 마비 의심",
            last_notified=now - timedelta(hours=1),
        ))
        db.commit()

        with patch("crawler.monitor.send_telegram", return_value=True) as mock_tg:
            run_monitor(db)

        msg = _resolved_message(mock_tg)
        assert "강제 정리" in msg and "원인은 미해결" in msg
        assert "정상으로 돌아왔습니다" not in msg
        # 헤더도 본문과 같은 결이어야 한다 — "✅ 크롤링 복구" 헤더가 붙으면
        # 헤더만 본 사장님이 원인 미해결을 정상으로 오인한다(헤더·본문 모순 가드).
        assert "복구" not in msg, f"swept 인데 헤더에 '복구' 가 남음: {msg}"
        assert "알림 종료" in msg
        # 상태 전환 자체는 기존과 동일하게 resolved
        alert = db.execute(
            select(MonitorAlert).where(MonitorAlert.alert_key == "crawl_stale:crawl_details")
        ).scalar_one()
        assert alert.status == "resolved"
    finally:
        db.close()


def test_run_monitor_resolved_after_boot_sweep_also_says_swept():
    """경로 ①-b: 부팅 스윕 마커('swept on startup')도 같은 swept 문구여야 한다.

    마커 문구가 둘(monitor / main.py 부팅)인데 한쪽만 보면 나머지가 가짜 복구로 샌다.
    """
    db = TestSession()
    try:
        now = _utcnow()
        db.add(CrawlJob(
            job_type="crawl_details", status="cancelled",
            error_message="stale running — swept on startup",
            started_at=now - timedelta(hours=3), completed_at=now - timedelta(minutes=5),
            created_at=now - timedelta(hours=3),
        ))
        db.add(MonitorAlert(
            alert_key="crawl_stale:crawl_details", status="active",
            detail="이전 마비", last_notified=now - timedelta(hours=1),
        ))
        db.commit()

        with patch("crawler.monitor.send_telegram", return_value=True) as mock_tg:
            run_monitor(db)

        assert "강제 정리" in _resolved_message(mock_tg)
    finally:
        db.close()


def test_run_monitor_resolved_swept_job_with_prior_error_message_says_swept():
    """경로 ①-c: 스윕 전부터 error_message 가 있던 잡도 swept 로 분류돼야 한다.

    official_price 처럼 진행 상황을 error_message 에 남기는 잡이 대표 사례.
    스윕 마커가 COALESCE 로 안 붙던 시절엔 이런 잡이 '수동 취소' 로 오분류됐다.
    """
    db = TestSession()
    try:
        now = _utcnow()
        db.add(CrawlJob(
            job_type="official_price", status="cancelled",
            error_message="진행: 1234동 처리 중 | stale running — swept by monitor",
            started_at=now - timedelta(hours=20), completed_at=now - timedelta(minutes=10),
            created_at=now - timedelta(hours=20),
        ))
        db.add(MonitorAlert(
            alert_key="crawl_stale:official_price", status="active",
            detail="이전 마비", last_notified=now - timedelta(hours=1),
        ))
        db.commit()

        with patch("crawler.monitor.send_telegram", return_value=True) as mock_tg:
            run_monitor(db)

        msg = _resolved_message(mock_tg)
        assert "강제 정리" in msg
        assert "취소됨" not in msg, f"기존 error_message 탓에 수동 취소로 오분류: {msg}"
    finally:
        db.close()


def test_run_monitor_resolved_stale_with_failed_omits_window_wording():
    """Med-4: crawl_stale 해소는 24h 관찰 창과 무관 — 그 문구를 붙이면 거짓 설명."""
    db = TestSession()
    try:
        now = _utcnow()
        db.add(CrawlJob(
            job_type="crawl_details", status="failed", error_message="네이버 502",
            started_at=now - timedelta(hours=2), completed_at=now - timedelta(hours=2),
            created_at=now - timedelta(hours=2),
        ))
        db.add(MonitorAlert(
            alert_key="crawl_stale:crawl_details", status="active",
            detail="이전 마비", last_notified=now - timedelta(hours=1),
        ))
        db.commit()

        with patch("crawler.monitor.send_telegram", return_value=True) as mock_tg:
            run_monitor(db)

        msg = _resolved_message(mock_tg)
        assert "마지막 실행: 실패" in msg
        assert "관찰 창" not in msg, f"crawl_stale 인데 24h 창 문구가 붙음: {msg}"
    finally:
        db.close()


def test_run_monitor_resolved_other_status_reports_status_verbatim():
    """Med-4: pending·paused 등은 '실패' 로 뭉개지 않고 상태를 그대로 표기."""
    db = TestSession()
    try:
        now = _utcnow()
        db.add(CrawlJob(
            job_type="complex_list", status="paused",
            started_at=now - timedelta(hours=2), created_at=now - timedelta(hours=2),
        ))
        db.add(MonitorAlert(
            alert_key="crawl_failed:complex_list", status="active",
            detail="이전 장애", last_notified=now - timedelta(hours=2),
        ))
        db.commit()

        with patch("crawler.monitor.send_telegram", return_value=True) as mock_tg:
            run_monitor(db)

        msg = _resolved_message(mock_tg)
        assert "마지막 실행: paused" in msg
        assert "실패" not in msg, f"paused 를 실패로 오표기: {msg}"
    finally:
        db.close()


def test_run_monitor_resolution_reason_failure_falls_back_to_legacy_wording():
    """High-1: 사유 판정이 죽어도 스캔 전체가 죽지 않고 기존 문구로 폴백한다.

    사유는 부가 정보다 — 여기서 예외가 새면 alert 처리 트랜잭션이 통째로
    되돌아가 monitor 가 매 주기 크래시한다(세션 342 재현 위험).
    """
    db = TestSession()
    try:
        db.add(MonitorAlert(
            alert_key="crawl_failed:complex_list", status="active",
            detail="이전 장애", last_notified=_utcnow() - timedelta(hours=12),
        ))
        db.commit()

        with patch(
            "crawler.monitor._resolution_reason",
            side_effect=RuntimeError("판정 폭발"),
        ), patch("crawler.monitor.send_telegram", return_value=True) as mock_tg:
            run_monitor(db)  # raise 하면 이 줄에서 테스트 실패

        msg = _resolved_message(mock_tg)
        assert "정상으로 돌아왔습니다" in msg  # legacy 문구 폴백
        alert = db.execute(
            select(MonitorAlert).where(MonitorAlert.alert_key == "crawl_failed:complex_list")
        ).scalar_one()
        assert alert.status == "resolved"
    finally:
        db.close()


def test_run_monitor_resolved_after_completed_says_recovered():
    """정상: 마지막 실행이 completed 면 진짜 복구 — '최근 실행 성공 확인' 문구."""
    db = TestSession()
    try:
        now = _utcnow()
        db.add(CrawlJob(
            job_type="complex_list", status="completed",
            started_at=now - timedelta(hours=1), completed_at=now - timedelta(hours=1),
            created_at=now - timedelta(hours=1),
        ))
        db.add(MonitorAlert(
            alert_key="crawl_failed:complex_list", status="active",
            detail="complex_list 작업 1건 실패 — SSL 끊김",
            last_notified=now - timedelta(hours=2),
        ))
        db.commit()

        with patch("crawler.monitor.send_telegram", return_value=True) as mock_tg:
            run_monitor(db)

        msg = _resolved_message(mock_tg)
        assert "최근 실행 성공 확인" in msg
        assert "강제 정리" not in msg
        alert = db.execute(
            select(MonitorAlert).where(MonitorAlert.alert_key == "crawl_failed:complex_list")
        ).scalar_one()
        assert alert.status == "resolved"
    finally:
        db.close()


def test_run_monitor_resolved_only_failed_says_unconfirmed_expired():
    """경로 ②: 24h 창을 벗어난 failed 만 있고 성공은 없음 → unconfirmed + 실패 detail.

    조건(24h 윈도)은 해소됐지만 그 작업이 성공한 적은 한 번도 없다 —
    '정상으로 돌아왔습니다' 는 거짓말이 된다.
    """
    db = TestSession()
    try:
        now = _utcnow()
        old = now - timedelta(hours=30)  # 24h 관찰 창 밖
        db.add(CrawlJob(
            job_type="complex_list", status="failed", error_message="SSL 끊김",
            started_at=old, completed_at=old, created_at=old,
        ))
        db.add(MonitorAlert(
            alert_key="crawl_failed:complex_list", status="active",
            detail="complex_list 작업 1건 실패 — SSL 끊김",
            last_notified=now - timedelta(hours=25),
        ))
        db.commit()

        with patch("crawler.monitor.send_telegram", return_value=True) as mock_tg:
            run_monitor(db)

        msg = _resolved_message(mock_tg)
        assert "성공 실행은 확인되지 않았습니다" in msg
        assert "마지막 실행: 실패" in msg
        assert "정상으로 돌아왔습니다" not in msg
    finally:
        db.close()


def test_run_monitor_resolved_manual_cancel_says_unconfirmed_cancelled():
    """엣지: 'swept' 마커 없는 cancelled(수동 취소·토글 off) 는 swept 도 복구도 아니다.

    v1 설계가 이걸 '24h 경과' 로 뭉뚱그렸던 결함 — 마지막 실행이 취소됨을 명시한다.
    """
    db = TestSession()
    try:
        now = _utcnow()
        db.add(CrawlJob(
            job_type="complex_list", status="cancelled",
            error_message="관리자 수동 취소",
            started_at=now - timedelta(hours=2), completed_at=now - timedelta(hours=1),
            created_at=now - timedelta(hours=2),
        ))
        db.add(MonitorAlert(
            alert_key="crawl_failed:complex_list", status="active",
            detail="이전 장애", last_notified=now - timedelta(hours=2),
        ))
        db.commit()

        with patch("crawler.monitor.send_telegram", return_value=True) as mock_tg:
            run_monitor(db)

        msg = _resolved_message(mock_tg)
        assert "성공 실행은 확인되지 않았습니다" in msg
        assert "취소됨" in msg
        assert "강제 정리" not in msg
    finally:
        db.close()


def test_run_monitor_resolved_no_history_says_unconfirmed_no_runs():
    """엣지: 그 job_type 의 실행 이력이 아예 없으면 '실행 이력 없음' 으로 명시."""
    db = TestSession()
    try:
        db.add(MonitorAlert(
            alert_key="crawl_failed:complex_articles", status="active",
            detail="이전", last_notified=_utcnow() - timedelta(hours=12),
        ))
        db.commit()

        with patch("crawler.monitor.send_telegram", return_value=True) as mock_tg:
            run_monitor(db)

        msg = _resolved_message(mock_tg)
        assert "실행 이력 없음" in msg
        # 기존 계약: 상태는 여전히 resolved 로 전환된다
        alert = db.execute(
            select(MonitorAlert).where(MonitorAlert.alert_key == "crawl_failed:complex_articles")
        ).scalar_one()
        assert alert.status == "resolved"
    finally:
        db.close()


def test_run_monitor_keeps_freshness_alert_when_freshness_computation_fails():
    """경로 ③: 신선도 계산이 실패한 스캔에서는 freshness:* 알림을 해소하지 않는다.

    계산이 죽으면 freshness:* 키가 통째로 사라진다 — 그걸 '복구' 로 읽으면
    데이터 미축적이 계속되는데 정상 통지가 나간다.
    """
    from sqlalchemy.exc import OperationalError

    db = TestSession()
    try:
        db.add(MonitorAlert(
            alert_key="freshness:articles", status="active",
            detail="매물 데이터 미축적", last_notified=_utcnow() - timedelta(hours=12),
        ))
        db.commit()

        with patch(
            "crawler.monitor.compute_freshness",
            side_effect=OperationalError("SELECT ...", {}, Exception("statement timeout")),
        ), patch("crawler.monitor.send_telegram", return_value=True) as mock_tg:
            run_monitor(db)

        alert = db.execute(
            select(MonitorAlert).where(MonitorAlert.alert_key == "freshness:articles")
        ).scalar_one()
        assert alert.status == "active", "신선도 계산 실패 스캔에서 가짜 복구로 해소됨"
        assert not any(_is_resolved_message(c[0][0]) for c in mock_tg.call_args_list)
    finally:
        db.close()


def test_run_monitor_resolves_freshness_alert_once_computation_recovers():
    """경로 ③ 대칭: 신선도 계산이 정상인 스캔에서는 freshness 알림이 제대로 해소된다.

    위 가드가 '영영 해소 안 됨' 으로 과적용되지 않았는지 확인 (미해소 고착 방지).
    """
    db = TestSession()
    try:
        db.add(MonitorAlert(
            alert_key="freshness:articles", status="active",
            detail="매물 데이터 미축적", last_notified=_utcnow() - timedelta(hours=12),
        ))
        db.commit()

        # 빈 DB → compute_freshness 는 정상 동작하고 articles red 신호가 없다
        with patch("crawler.monitor.send_telegram", return_value=True) as mock_tg:
            run_monitor(db)

        alert = db.execute(
            select(MonitorAlert).where(MonitorAlert.alert_key == "freshness:articles")
        ).scalar_one()
        assert alert.status == "resolved"
        # freshness 는 계산 성공 스캔에서만 해소되므로 recovered 문구
        assert "최근 실행 성공 확인" in _resolved_message(mock_tg)
    finally:
        db.close()


# ── 세션 393 §5-J: 알림 조율 4건 회귀 가드 ──
# ① monitor 자기실패 무알림 → 예외 재던지기(리스너 경유 텔레그램)
# ② crawl_failed 대표 에러 = 사전순 max → 최신 실패의 error_message
# ④ 해소 알림 여러 건 → 1통 묶음


def test_run_monitor_job_reraises_so_scheduler_listener_fires():
    """① monitor 자신이 죽으면 예외를 삼키지 않고 위로 던진다.

    삼키면 APScheduler EVENT_JOB_ERROR 가 안 떠서 job_error_listener 텔레그램이
    영영 발화하지 못한다 — 감시자의 사망이 무알림이 되는 사각지대.

    ⚠ 뮤테이션 검증(세션 393): run_monitor_job 의 raise 를 지워 옛 코드
    (logger.warning + rollback 후 흡수)로 되돌리면 pytest.raises 가
    "DID NOT RAISE <class 'RuntimeError'>" 로 실패함을 확인 후 복원.
    """
    import pytest

    from crawler.monitor import run_monitor_job

    fake_db = TestSession()
    try:
        with patch("db.database.SessionLocal", return_value=fake_db), patch(
            "crawler.monitor.run_monitor", side_effect=RuntimeError("모니터 폭발")
        ):
            with pytest.raises(RuntimeError, match="모니터 폭발"):
                run_monitor_job()
    finally:
        fake_db.close()


def test_run_monitor_reraises_detect_failure():
    """① detect 단계 실패도 흡수하지 않고 전파 — run_monitor_job 이 받아 재던진다."""
    import pytest

    db = TestSession()
    try:
        with patch(
            "crawler.monitor.detect_issues_ex", side_effect=RuntimeError("감지 폭발")
        ), patch("crawler.monitor.send_telegram", return_value=True):
            with pytest.raises(RuntimeError, match="감지 폭발"):
                run_monitor(db)
    finally:
        db.close()


def test_detect_issues_failed_uses_latest_error_not_alphabetical_max():
    """② 대표 에러는 '가장 최근 실패' — 사전순 최대가 아니다.

    fixture 는 시간축과 사전순이 **서로 반대**가 되도록 설계했다:
      먼저 실패(옛)   = "zzz 옛 에러"   (사전순으로는 최대)
      나중 실패(최신) = "aaa 최신 에러" (사전순으로는 최소)
    → func.max(error_message) 로 되돌리면 "zzz 옛 에러" 가 뽑혀 실패한다.

    ⚠ 뮤테이션 검증(세션 393): _latest_failure_error 호출을 옛
    func.max(CrawlJob.error_message) 로 되돌리면 이 단언이
    "assert 'zzz 옛 에러' == 'aaa 최신 에러'" 로 실패함을 확인 후 복원.
    """
    db = TestSession()
    try:
        now = _utcnow()
        db.add(CrawlJob(
            job_type="complex_list", status="failed", error_message="zzz 옛 에러",
            started_at=now - timedelta(hours=10), completed_at=now - timedelta(hours=10),
            created_at=now - timedelta(hours=10),
        ))
        db.add(CrawlJob(
            job_type="complex_list", status="failed", error_message="aaa 최신 에러",
            started_at=now - timedelta(hours=1), completed_at=now - timedelta(hours=1),
            created_at=now - timedelta(hours=1),
        ))
        db.commit()

        issue = next(i for i in detect_issues(db) if i["kind"] == "crawl_failed")
        assert issue["data"]["error"] == "aaa 최신 에러"
        assert issue["data"]["count"] == 2  # 집계(건수)는 그대로 유지
        assert "aaa 최신 에러" in issue["detail"]
    finally:
        db.close()


def test_detect_issues_failed_error_null_message_is_empty_string():
    """② error_message 가 NULL 인 최신 실패도 안전하게 빈 문자열로 처리."""
    db = TestSession()
    try:
        now = _utcnow()
        db.add(CrawlJob(
            job_type="complex_list", status="failed", error_message=None,
            created_at=now - timedelta(hours=1),
        ))
        db.commit()

        issue = next(i for i in detect_issues(db) if i["kind"] == "crawl_failed")
        assert issue["data"]["error"] == ""
    finally:
        db.close()


def _seed_three_resolvable_alerts(db, now):
    """해소 대상 3건 (전부 마지막 실행 completed = recovered) 심기."""
    for job_type in ("complex_list", "crawl_details", "collect_prices"):
        db.add(CrawlJob(
            job_type=job_type, status="completed",
            started_at=now - timedelta(hours=1), completed_at=now - timedelta(hours=1),
            created_at=now - timedelta(hours=1),
        ))
        db.add(MonitorAlert(
            alert_key=f"crawl_failed:{job_type}", status="active",
            detail=f"{job_type} 작업 1건 실패 — 옛 원인",
            last_notified=now - timedelta(hours=2),
        ))
    db.commit()


def test_run_monitor_batches_multiple_resolved_into_one_message():
    """④ 3건 동시 해소 → 텔레그램 1통 + 3행 모두 resolved.

    DB 장애 복구 직후처럼 여러 건이 한 스캔에 해소되면 건당 1통이 알림 폭탄이
    됐다(세션 381 배경).

    ⚠ 뮤테이션 검증(세션 393): run_monitor 의 묶음 분기를 옛 '건마다 발송'
    루프로 되돌리면 "발송 3통 — 묶이지 않음" 으로 이 단언이 실패함을 확인 후 복원.
    """
    db = TestSession()
    try:
        now = _utcnow()
        _seed_three_resolvable_alerts(db, now)

        with patch("crawler.monitor.send_telegram", return_value=True) as mock_tg:
            run_monitor(db)

        resolved_msgs = [c[0][0] for c in mock_tg.call_args_list if _is_resolved_message(c[0][0])]
        assert len(resolved_msgs) == 1, f"발송 {len(resolved_msgs)}통 — 묶이지 않음"
        msg = resolved_msgs[0]
        assert "해소 3건" in msg
        for job_type in ("complex_list", "crawl_details", "collect_prices"):
            assert f"{job_type} 작업 1건 실패" in msg, f"{job_type} detail 누락: {msg}"

        rows = db.execute(select(MonitorAlert)).scalars().all()
        assert all(r.status == "resolved" for r in rows), [(r.alert_key, r.status) for r in rows]
    finally:
        db.close()


def test_run_monitor_batch_send_failure_keeps_all_active():
    """④ 묶음 발송이 실패하면 아무도 resolved 로 전이하지 않는다 (다음 스캔 재시도).

    단건 경로의 '발송 성공 시에만 전이' 의미를 묶음에서도 그대로 보존.
    """
    db = TestSession()
    try:
        now = _utcnow()
        _seed_three_resolvable_alerts(db, now)

        with patch("crawler.monitor.send_telegram", return_value=False):
            run_monitor(db)

        rows = db.execute(select(MonitorAlert)).scalars().all()
        assert all(r.status == "active" for r in rows), [(r.alert_key, r.status) for r in rows]
    finally:
        db.close()


def test_run_monitor_batch_header_warns_when_reason_mixed():
    """④ 사유가 섞이면(복구 + 강제정리) 헤더는 '⚠️ 알림 종료' — '복구' 라 하면 안 된다."""
    db = TestSession()
    try:
        now = _utcnow()
        # 1) 진짜 복구
        db.add(CrawlJob(
            job_type="complex_list", status="completed",
            started_at=now - timedelta(hours=1), completed_at=now - timedelta(hours=1),
            created_at=now - timedelta(hours=1),
        ))
        db.add(MonitorAlert(
            alert_key="crawl_failed:complex_list", status="active",
            detail="complex_list 작업 1건 실패 — SSL 끊김",
            last_notified=now - timedelta(hours=2),
        ))
        # 2) 스윕당한 잡 (원인 미해결)
        db.add(CrawlJob(
            job_type="crawl_details", status="cancelled",
            error_message="stale running — swept by monitor",
            started_at=now - timedelta(hours=3), completed_at=now - timedelta(minutes=10),
            created_at=now - timedelta(hours=3),
        ))
        db.add(MonitorAlert(
            alert_key="crawl_stale:crawl_details", status="active",
            detail="crawl_details 작업 1건이 1시간 넘게 running 상태 — 마비 의심",
            last_notified=now - timedelta(hours=1),
        ))
        db.commit()

        with patch("crawler.monitor.send_telegram", return_value=True) as mock_tg:
            run_monitor(db)

        msgs = [c[0][0] for c in mock_tg.call_args_list if _is_resolved_message(c[0][0])]
        assert len(msgs) == 1
        msg = msgs[0]
        assert "알림 종료" in msg
        assert "크롤링 복구" not in msg, f"원인 미해결이 섞였는데 헤더가 '복구': {msg}"
        # 각 줄은 자기 사유대로 표기 — 복구는 성공확인, 스윕은 강제 정리 문구
        assert "최근 실행 성공 확인" in msg
        assert "강제 정리" in msg and "원인은 미해결" in msg
    finally:
        db.close()


def test_run_monitor_batch_header_ok_when_all_recovered():
    """④ 전부 recovered 면 헤더는 '✅ 크롤링 복구' 유지."""
    db = TestSession()
    try:
        now = _utcnow()
        _seed_three_resolvable_alerts(db, now)

        with patch("crawler.monitor.send_telegram", return_value=True) as mock_tg:
            run_monitor(db)

        msg = _resolved_message(mock_tg)
        assert "크롤링 복구" in msg
        assert "알림 종료" not in msg
    finally:
        db.close()
