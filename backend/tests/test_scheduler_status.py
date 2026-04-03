"""스케줄러 모니터링 API 테스트
실행: python -m pytest tests/test_scheduler_status.py -v
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from jose import jwt

from db.models import CrawlJob, UserProfile

JWT_SECRET = "test-secret-key-for-testing-only"


def _token(sub):
    return jwt.encode(
        {"sub": sub, "aud": "authenticated", "email": f"{sub}@test.com"},
        JWT_SECRET,
        algorithm="HS256",
    )


def _make_admin(db, uid="admin1"):
    p = UserProfile(user_id=uid, email=f"{uid}@test.com", role="admin", status="approved")
    db.add(p)
    db.commit()
    return p


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


# ── 인증 ──


def test_scheduler_status_no_auth_401(client):
    """인증 없이 스케줄러 상태 조회 → 401"""
    assert client.get("/api/admin/scheduler-status").status_code == 401


def test_scheduler_status_regular_user_403(client, db):
    """일반 사용자 → 403"""
    p = UserProfile(user_id="u1", email="u1@test.com", role="user", status="approved")
    db.add(p)
    db.commit()
    res = client.get("/api/admin/scheduler-status", headers=_auth(_token("u1")))
    assert res.status_code == 403


# ── 빈 데이터 ──


@patch("crawler.scheduler.get_scheduler", return_value=None)
def test_scheduler_status_empty(mock_sched, client, db):
    """CrawlJob 없을 때 기본 응답 확인"""
    _make_admin(db)
    res = client.get("/api/admin/scheduler-status", headers=_auth(_token("admin1")))
    assert res.status_code == 200
    data = res.json()
    assert "jobs" in data
    assert "summary" in data
    assert data["summary"]["total_runs_today"] == 0
    assert data["summary"]["failures_today"] == 0
    # 12개 작업 메타데이터가 모두 반환되어야 함
    assert len(data["jobs"]) == 12


# ── 실행 이력 반영 ──


@patch("crawler.scheduler.get_scheduler", return_value=None)
def test_scheduler_status_with_job_history(mock_sched, client, db):
    """CrawlJob 이력이 last_run에 반영되는지 확인"""
    _make_admin(db)
    now = datetime.now(timezone.utc)
    job = CrawlJob(
        job_type="air_quality",
        scheduler_job_id="collect_air_quality",
        status="completed",
        total_items=50,
        processed_items=48,
        started_at=now - timedelta(minutes=5),
        completed_at=now,
    )
    db.add(job)
    db.commit()

    res = client.get("/api/admin/scheduler-status", headers=_auth(_token("admin1")))
    assert res.status_code == 200
    data = res.json()

    # collect_air_quality 작업 찾기
    air_job = next(j for j in data["jobs"] if j["scheduler_job_id"] == "collect_air_quality")
    assert air_job["last_run"] is not None
    assert air_job["last_run"]["status"] == "completed"
    assert air_job["last_run"]["processed_items"] == 48
    assert air_job["last_run"]["total_items"] == 50
    assert air_job["last_run"]["duration_seconds"] == 300


# ── 실패 이력 ──


@patch("crawler.scheduler.get_scheduler", return_value=None)
def test_scheduler_status_failed_job(mock_sched, client, db):
    """실패한 작업의 에러 메시지가 반환되는지 확인"""
    _make_admin(db)
    now = datetime.now(timezone.utc)
    job = CrawlJob(
        job_type="crime_stats",
        scheduler_job_id="collect_crime_stats",
        status="failed",
        error_message="API 연결 실패",
        started_at=now - timedelta(minutes=1),
        completed_at=now,
    )
    db.add(job)
    db.commit()

    res = client.get("/api/admin/scheduler-status", headers=_auth(_token("admin1")))
    data = res.json()
    crime_job = next(j for j in data["jobs"] if j["scheduler_job_id"] == "collect_crime_stats")
    assert crime_job["last_run"]["status"] == "failed"
    assert crime_job["last_run"]["error_message"] == "API 연결 실패"
    assert crime_job["stats_24h"]["failures"] >= 1


# ── 24시간 통계 ──


@patch("crawler.scheduler.get_scheduler", return_value=None)
def test_scheduler_status_24h_stats(mock_sched, client, db):
    """24시간 내 실행/실패 통계 확인"""
    _make_admin(db)
    now = datetime.now(timezone.utc)

    # 3개 작업: 2 completed + 1 failed
    for i, status in enumerate(["completed", "completed", "failed"]):
        db.add(CrawlJob(
            job_type="air_quality",
            scheduler_job_id="collect_air_quality",
            status=status,
            started_at=now - timedelta(hours=i),
            completed_at=now - timedelta(hours=i) + timedelta(minutes=5),
            error_message="에러" if status == "failed" else None,
        ))
    db.commit()

    res = client.get("/api/admin/scheduler-status", headers=_auth(_token("admin1")))
    data = res.json()
    air = next(j for j in data["jobs"] if j["scheduler_job_id"] == "collect_air_quality")
    assert air["stats_24h"]["runs"] == 3
    assert air["stats_24h"]["failures"] == 1


# ── env_service CrawlJob 기록 헬퍼 ──


def test_record_job_helper(db):
    """_record_job 헬퍼가 CrawlJob을 올바르게 생성하는지 확인"""
    from crawler.env_service import _record_job

    job = _record_job(db, "test_type", "test_scheduler_id")
    assert job.job_type == "test_type"
    assert job.scheduler_job_id == "test_scheduler_id"
    assert job.status == "running"
    assert job.started_at is not None
    assert job.id is not None  # DB에 저장됨


def test_complete_job_helper(db):
    """_complete_job 헬퍼가 상태를 올바르게 갱신하는지 확인"""
    from crawler.env_service import _complete_job, _record_job

    job = _record_job(db, "test_type", "test_id")
    _complete_job(db, job, collected=10, failed=2)
    assert job.status == "completed"
    assert job.processed_items == 10
    assert job.total_items == 12
    assert job.completed_at is not None


def test_fail_job_helper(db):
    """_fail_job 헬퍼가 실패 상태를 올바르게 기록하는지 확인"""
    from crawler.env_service import _fail_job, _record_job

    job = _record_job(db, "test_type", "test_id")
    _fail_job(db, job, "테스트 에러 메시지")
    assert job.status == "failed"
    assert job.error_message == "테스트 에러 메시지"
    assert job.completed_at is not None
