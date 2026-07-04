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


def test_run_monitor_sweep_preserves_existing_error_message():
    """엣지: 기존 error_message 가 있으면 COALESCE 로 덮어쓰지 않음"""
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
        assert swept.error_message == "이미 있던 에러"
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
