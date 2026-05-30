"""스케줄러 모니터링 API 테스트
실행: python -m pytest tests/test_scheduler_status.py -v
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import jwt

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
    # SCHEDULER_JOB_META 의 모든 키가 응답에 반영되어야 함 (META 갱신 시 자동 확장)
    from routers.admin.scheduler import SCHEDULER_JOB_META
    assert len(data["jobs"]) == len(SCHEDULER_JOB_META)
    assert {j["scheduler_job_id"] for j in data["jobs"]} == set(SCHEDULER_JOB_META.keys())


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


# ── non-env 작업 scheduler_job_id 반영 ──


@patch("crawler.scheduler.get_scheduler", return_value=None)
def test_scheduler_status_non_env_job(mock_sched, client, db):
    """non-env 작업(price_history)의 scheduler_job_id가 모니터에 반영되는지 확인"""
    _make_admin(db)
    now = datetime.now(timezone.utc)
    db.add(CrawlJob(
        job_type="price_history",
        scheduler_job_id="collect_prices",
        status="completed",
        total_items=100,
        processed_items=95,
        started_at=now - timedelta(minutes=10),
        completed_at=now,
    ))
    db.commit()

    res = client.get("/api/admin/scheduler-status", headers=_auth(_token("admin1")))
    data = res.json()
    price_job = next(j for j in data["jobs"] if j["scheduler_job_id"] == "collect_prices")
    assert price_job["last_run"] is not None
    assert price_job["last_run"]["status"] == "completed"
    assert price_job["last_run"]["processed_items"] == 95


# ── 인기 단지 크롤링 시간대 회귀 (2026-04-16 세션 49 쿨다운 대응) ──
#
# 세션 49에서 인기 단지 크롤링을 10:30/14:30/19:00 → 10:45/14:45/19:15 로 15분씩
# 시프트했다. 세 곳(scheduler.py cron 등록 / admin/scheduler.py 메타 / job id)의
# 시간이 서로 drift 하면 UI와 실제 실행이 어긋나거나 mibunyang 쪽 시간대와 다시
# 겹쳐 쿨다운이 재발할 수 있어 회귀 테스트로 고정한다.

POPULAR_EXPECTED = [
    ("popular_1030", 10, 45, "인기 단지 크롤링 10:45", "매일 10:45"),
    ("popular_1430", 14, 45, "인기 단지 크롤링 14:45", "매일 14:45"),
    ("popular_1900", 19, 15, "인기 단지 크롤링 19:15", "매일 19:15"),
]


def test_popular_crawl_meta_matches_session49_shift():
    """SCHEDULER_JOB_META 에 popular 3개 job 이 10:45/14:45/19:15 로 고정돼 있는지"""
    from routers.admin.scheduler import SCHEDULER_JOB_META

    for job_id, _hour, _minute, expected_name, expected_schedule in POPULAR_EXPECTED:
        assert job_id in SCHEDULER_JOB_META, f"{job_id} 가 메타에서 누락"
        meta = SCHEDULER_JOB_META[job_id]
        assert meta["name"] == expected_name
        assert meta["schedule"] == expected_schedule
        assert meta["env"] == "POPULAR_CRAWL_ENABLED"
        assert meta.get("env_default") == "true"


def test_popular_crawl_scheduler_source_matches_meta():
    """crawler/scheduler.py 의 cron 등록 튜플이 메타와 일치하는지 (소스 레벨 drift 방지)

    APScheduler 인스턴스를 실제로 띄우지 않고, 소스 파일에서 cron 등록에 쓰는
    (hour, minute, job_id) 튜플 리터럴을 읽어 검증. 세션 49 의 시프트가
    scheduler.py 와 admin/scheduler.py 양쪽에서 동시에 반영돼야 한다.
    """
    import inspect

    from crawler import scheduler as sched_mod

    source = inspect.getsource(sched_mod)
    for job_id, hour, minute, _name, _schedule in POPULAR_EXPECTED:
        # cron 등록 리스트 리터럴: (10, 45, "popular_1030") 형태
        needle = f'({hour}, {minute}, "{job_id}")'
        assert needle in source, (
            f"scheduler.py 에서 {needle} 를 찾을 수 없음 — 세션 49 시프트가 풀렸거나 "
            f"리터럴 포맷이 바뀜"
        )


@patch("crawler.scheduler.get_scheduler", return_value=None)
def test_scheduler_status_exposes_popular_15min_shift(mock_sched, client, db):
    """/api/admin/scheduler-status 응답의 popular job schedule 문자열이 UI 에 정확히 내려오는지"""
    _make_admin(db)
    res = client.get("/api/admin/scheduler-status", headers=_auth(_token("admin1")))
    assert res.status_code == 200
    jobs = {j["scheduler_job_id"]: j for j in res.json()["jobs"]}

    for job_id, _hour, _minute, expected_name, expected_schedule in POPULAR_EXPECTED:
        assert job_id in jobs, f"응답에 {job_id} 누락"
        assert jobs[job_id]["name"] == expected_name
        assert jobs[job_id]["schedule"] == expected_schedule
        assert jobs[job_id]["enabled"] is True  # POPULAR_CRAWL_ENABLED 기본 true
