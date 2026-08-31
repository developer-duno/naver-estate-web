"""startup stale running sweep 테스트
실행: python -m pytest tests/test_stale_running_sweep.py -v

main.py 의 _sweep_stale_running_jobs() 가:
1. 5분 이상 running + completed_at NULL 인 row 만 cancelled 로 정정
2. 정정 status = 'cancelled' (failed 아님 — 실패율 통계 보호)
3. error_message 기존 값 보존 + 스윕 마커 append (세션 391 — 마커는 항상 붙어야
   monitor 의 해소 사유 판정이 'swept' 를 알아본다)
4. 5분 미만 running 은 건드리지 않음 (false positive 차단)
"""

from datetime import datetime, timedelta, timezone

from db.models import CrawlJob


def test_sweep_marks_old_running_as_cancelled(db):
    """5분 이상 running + completed_at NULL → cancelled 정정."""
    from main import _sweep_stale_running_jobs

    now = datetime.now(timezone.utc)
    job = CrawlJob(
        job_type="article_detail", scheduler_job_id="crawl_details",
        started_at=now - timedelta(minutes=10),
        status="running",
        completed_at=None,
    )
    db.add(job)
    db.commit()

    swept = _sweep_stale_running_jobs()
    assert swept == 1

    db.refresh(job)
    assert job.status == "cancelled"
    assert job.completed_at is not None
    assert "stale running" in (job.error_message or "")


def test_sweep_preserves_existing_error_message_and_appends_marker(db):
    """error_message 가 이미 있으면 원문 보존 + 스윕 마커 append (세션 391 정정).

    옛 구현은 COALESCE 라 값이 있으면 마커를 아예 안 붙였다. 그런데 진행 상황을
    error_message 에 남기는 잡(official_price)은 스윕 시점에 항상 값이 있어,
    monitor 의 해소 사유 판정이 그 잡을 'swept' 가 아니라 '수동 취소' 로
    오분류했다 — 사장님에게 "취소됨" 이라 잘못 통지되는 경로.
    """
    from main import _sweep_stale_running_jobs

    now = datetime.now(timezone.utc)
    job = CrawlJob(
        job_type="x", scheduler_job_id="crawl_details",
        started_at=now - timedelta(minutes=10),
        status="running",
        completed_at=None,
        error_message="기존 에러 메시지",
    )
    db.add(job)
    db.commit()

    _sweep_stale_running_jobs()
    db.refresh(job)
    assert "기존 에러 메시지" in (job.error_message or "")  # 원문 보존
    assert "swept on startup" in (job.error_message or "")  # 마커 보장


def test_sweep_ignores_recent_running(db):
    """5분 미만 running 은 건드리지 않음 — false positive 차단."""
    from main import _sweep_stale_running_jobs

    now = datetime.now(timezone.utc)
    job = CrawlJob(
        job_type="x", scheduler_job_id="crawl_details",
        started_at=now - timedelta(minutes=2),  # 2분 = 임계 미만
        status="running",
        completed_at=None,
    )
    db.add(job)
    db.commit()

    swept = _sweep_stale_running_jobs()
    assert swept == 0

    db.refresh(job)
    assert job.status == "running"  # 변경 없음


def test_sweep_ignores_already_completed(db):
    """completed_at 이 채워진 row 는 status 가 running 이어도 무시 (race 보호)."""
    from main import _sweep_stale_running_jobs

    now = datetime.now(timezone.utc)
    job = CrawlJob(
        job_type="x", scheduler_job_id="crawl_details",
        started_at=now - timedelta(minutes=10),
        status="running",
        completed_at=now - timedelta(minutes=1),  # 종료시각 있음 = 정상 완료 중
    )
    db.add(job)
    db.commit()

    swept = _sweep_stale_running_jobs()
    assert swept == 0

    db.refresh(job)
    assert job.status == "running"


def test_sweep_handles_no_stale_rows(db):
    """대상 row 0건 → 0 반환, 예외 없음."""
    from main import _sweep_stale_running_jobs

    swept = _sweep_stale_running_jobs()
    assert swept == 0


def test_sweep_handles_multiple_stale_rows(db):
    """여러 stale row 일괄 정정."""
    from main import _sweep_stale_running_jobs

    now = datetime.now(timezone.utc)
    for i in range(3):
        db.add(CrawlJob(
            job_type=f"x{i}", scheduler_job_id="crawl_details",
            started_at=now - timedelta(minutes=10 + i),
            status="running",
            completed_at=None,
        ))
    db.commit()

    swept = _sweep_stale_running_jobs()
    assert swept == 3
