"""환경데이터 수집 _fail_job 새-세션 폴백 회귀 가드 (세션 278 H1).

배경: 네이버 크롤러 5종은 fail_job_safely(새 SessionLocal)로 '연결 끊김 시 job running
영구 잔존'(세션266, 5/31 11시간 실측)을 막았으나, 환경데이터 4종(air/emergency/crime/
childcare)의 _fail_job 은 같은 세션으로 rollback/commit 해 그 가드가 빠져 있었다.

이 테스트는 _fail_job 의 두 경로를 가드한다:
- 정상: 같은 세션으로 running -> failed 마킹.
- 깨진 세션: 같은-세션 commit 이 예외를 던지면 fail_job_safely(새 세션) 폴백으로 failed 마킹.
"""
from datetime import datetime, timezone
from unittest.mock import patch

from crawler.env_common import _fail_job
from db.models import CrawlJob


def _make_running_job(db, job_id: int) -> CrawlJob:
    job = CrawlJob(
        id=job_id,
        job_type="air_quality",
        status="running",
        started_at=datetime.now(timezone.utc),
    )
    db.add(job)
    db.commit()
    return job


def test_fail_job_same_session_marks_failed(db):
    """정상 경로 — 같은 세션으로 running -> failed."""
    job = _make_running_job(db, 8101)

    _fail_job(db, job, "collect boom")

    db.expire_all()
    row = db.get(CrawlJob, 8101)
    assert row.status == "failed"
    assert row.error_message == "collect boom"
    assert row.completed_at is not None


def test_fail_job_broken_session_falls_back_to_new_session(db):
    """깨진 세션 — 같은-세션 commit 이 터지면 fail_job_safely 새-세션 폴백으로 failed 마킹.

    세션266 취약점(연결 끊김 시 rollback/commit 재예외 -> except 탈출 -> running 영구 잔존)이
    환경 수집에서 재발하지 않음을 가드. db.commit 을 1회 예외로 만들어 깨진 세션을 시뮬레이트.
    """
    job = _make_running_job(db, 8102)

    # 이 db 인스턴스의 commit 만 깨뜨림 (fail_job_safely 가 만드는 새 SessionLocal 은
    # 별도 인스턴스라 정상 동작해야 함 — 실제 운영에서 끊긴 건 요청 세션 하나뿐).
    with patch.object(db, "commit", side_effect=RuntimeError("SSL connection closed")):
        # 예외가 _fail_job 밖으로 전파되지 않아야 한다 (best-effort 폴백)
        _fail_job(db, job, "connection dropped mid-collect")

    # 새 세션이 커밋했으므로 재조회 시 failed
    db.expire_all()
    row = db.get(CrawlJob, 8102)
    assert row.status == "failed"
    assert row.error_message == "connection dropped mid-collect"
    assert row.completed_at is not None
