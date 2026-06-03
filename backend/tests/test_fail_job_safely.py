"""fail_job_safely 회귀 가드 (세션 266).

배경: except 블록에서 같은 세션으로 rollback/commit 하다 연결이 끊기면 그 호출이
또 예외를 던져 job 이 status='running' 인 채 영원히 남았다(5/31 11시간 running 실측).
fail_job_safely 는 새 SessionLocal 로 job 을 failed 로 확실히 마킹한다.
"""
from datetime import datetime, timezone

from crawler.service_common import fail_job_safely
from db.models import CrawlJob


def _make_running_job(db, job_id: int) -> CrawlJob:
    job = CrawlJob(
        id=job_id,
        job_type="article_detail",
        status="running",
        started_at=datetime.now(timezone.utc),
    )
    db.add(job)
    db.commit()
    return job


def test_fail_job_safely_marks_running_to_failed(db):
    """running 작업을 새 세션으로 failed 마킹 (정상 경로)."""
    _make_running_job(db, 9001)

    ok = fail_job_safely(9001, "connection dropped")

    assert ok is True
    # 새 세션이 커밋했으므로 현재 세션에서도 다시 읽으면 failed
    db.expire_all()
    row = db.get(CrawlJob, 9001)
    assert row.status == "failed"
    assert row.error_message == "connection dropped"
    assert row.completed_at is not None


def test_fail_job_safely_skips_non_running(db):
    """이미 cancelled/paused 인 작업은 덮어쓰지 않음 (race guard)."""
    job = CrawlJob(
        id=9002,
        job_type="article_detail",
        status="cancelled",
        started_at=datetime.now(timezone.utc),
    )
    db.add(job)
    db.commit()

    ok = fail_job_safely(9002, "boom")

    assert ok is False
    db.expire_all()
    row = db.get(CrawlJob, 9002)
    assert row.status == "cancelled"  # 보존됨


def test_fail_job_safely_missing_job_returns_false(db):
    """존재하지 않는 job_id 는 조용히 False (best-effort)."""
    ok = fail_job_safely(999999, "no such job")
    assert ok is False


def test_fail_job_safely_truncates_long_error(db):
    """긴 에러 메시지는 500자로 잘림 (컬럼 한도)."""
    _make_running_job(db, 9003)

    ok = fail_job_safely(9003, "x" * 1000)

    assert ok is True
    db.expire_all()
    row = db.get(CrawlJob, 9003)
    assert len(row.error_message) == 500
