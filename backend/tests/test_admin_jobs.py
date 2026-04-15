"""관리자 크롤 잡 pause/resume + 에러율 통계 테스트.
실행: python -m pytest tests/test_admin_jobs.py -v
"""
from datetime import datetime, timezone

from jose import jwt

from db.models import CrawlJob, UserProfile

JWT_SECRET = "test-secret-key-for-testing-only"


def _token(sub):
    return jwt.encode(
        {"sub": sub, "aud": "authenticated", "email": f"{sub}@test.com"},
        JWT_SECRET,
        algorithm="HS256",
    )


def _make_admin(db, uid):
    p = UserProfile(user_id=uid, email=f"{uid}@test.com", role="admin", status="approved")
    db.add(p)
    db.commit()
    return p


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _make_job(db, status="running", job_type="complex_articles"):
    job = CrawlJob(
        job_type=job_type,
        target_id="12345",
        status=status,
        started_at=datetime.now(timezone.utc),
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


# ── pause ──


def test_pause_running_job(client, db):
    """running → paused 정상"""
    _make_admin(db, "pa1")
    job = _make_job(db, status="running")
    res = client.post(
        f"/api/admin/crawl-jobs/{job.id}/pause",
        headers=_auth(_token("pa1")),
    )
    assert res.status_code == 200
    assert res.json()["status"] == "paused"
    db.refresh(job)
    assert job.status == "paused"


def test_pause_already_completed_409(client, db):
    """completed 상태는 pause 불가 → 409"""
    _make_admin(db, "pa2")
    job = _make_job(db, status="completed")
    res = client.post(
        f"/api/admin/crawl-jobs/{job.id}/pause",
        headers=_auth(_token("pa2")),
    )
    assert res.status_code == 409


def test_pause_not_found_404(client, db):
    """존재하지 않는 job → 404"""
    _make_admin(db, "pa3")
    res = client.post(
        "/api/admin/crawl-jobs/999999/pause",
        headers=_auth(_token("pa3")),
    )
    assert res.status_code == 404


# ── resume ──


def test_resume_paused_job(client, db):
    """paused → pending 정상"""
    _make_admin(db, "re1")
    job = _make_job(db, status="paused")
    res = client.post(
        f"/api/admin/crawl-jobs/{job.id}/resume",
        headers=_auth(_token("re1")),
    )
    assert res.status_code == 200
    assert res.json()["status"] == "pending"
    db.refresh(job)
    assert job.status == "pending"


def test_resume_running_job_409(client, db):
    """running 은 resume 대상 아님 → 409"""
    _make_admin(db, "re2")
    job = _make_job(db, status="running")
    res = client.post(
        f"/api/admin/crawl-jobs/{job.id}/resume",
        headers=_auth(_token("re2")),
    )
    assert res.status_code == 409


# ── 에러율 통계 ──


def test_error_stats_default_14_days(client, db):
    """기본 days=14 응답에 rows 15개 (0~14일) + 각 row 에 status 카운트"""
    _make_admin(db, "es1")
    # 여러 status job 생성
    db.add(CrawlJob(job_type="complex_articles", status="completed",
                    created_at=datetime.now(timezone.utc)))
    db.add(CrawlJob(job_type="complex_articles", status="failed",
                    created_at=datetime.now(timezone.utc)))
    db.commit()

    res = client.get("/api/admin/error-stats", headers=_auth(_token("es1")))
    assert res.status_code == 200
    body = res.json()
    assert body["days"] == 14
    assert len(body["rows"]) == 15  # 0~14일 포함
    # 오늘 row 에 completed/failed >=1 확인
    today_row = body["rows"][-1]
    assert today_row["completed"] >= 1
    assert today_row["failed"] >= 1
    assert "paused" in today_row


def test_error_stats_invalid_days_422(client, db):
    """Literal 외 값 → FastAPI 검증 실패 422"""
    _make_admin(db, "es2")
    res = client.get(
        "/api/admin/error-stats?days=100",
        headers=_auth(_token("es2")),
    )
    assert res.status_code == 422


def test_error_stats_7_days(client, db):
    """days=7 → rows 8개"""
    _make_admin(db, "es3")
    res = client.get(
        "/api/admin/error-stats?days=7",
        headers=_auth(_token("es3")),
    )
    assert res.status_code == 200, res.text
    assert res.json()["days"] == 7
    assert len(res.json()["rows"]) == 8
