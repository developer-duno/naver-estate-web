"""관리자 크롤 잡 pause/resume + 에러율 통계 테스트.
실행: python -m pytest tests/test_admin_jobs.py -v
"""
from datetime import datetime, timedelta, timezone

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


# ── /crawl-failures 유형별 실패 분포 ──


def test_crawl_failures_groups_by_job_type(client, db):
    """24시간 내 실패 잡들이 job_type 으로 그룹화되어 count 포함 반환"""
    _make_admin(db, "cf1")
    now = datetime.now(timezone.utc)
    # complex_articles 실패 3건
    for _ in range(3):
        db.add(CrawlJob(
            job_type="complex_articles", status="failed",
            error_message="네이버 API 차단", created_at=now, completed_at=now,
        ))
    # price_history 실패 1건
    db.add(CrawlJob(
        job_type="price_history", status="failed",
        error_message="DB 락 타임아웃", created_at=now, completed_at=now,
    ))
    # 실패가 아닌 잡 — 카운트되면 안 됨
    db.add(CrawlJob(job_type="complex_articles", status="completed",
                    created_at=now, completed_at=now))
    db.commit()

    res = client.get("/api/admin/crawl-failures", headers=_auth(_token("cf1")))
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["window_hours"] == 24
    assert body["total"] == 4
    items = {it["job_type"]: it for it in body["items"]}
    assert items["complex_articles"]["count"] == 3
    assert items["price_history"]["count"] == 1
    # 가장 많은 유형이 먼저
    assert body["items"][0]["job_type"] == "complex_articles"
    # last_error 가 잘려서 들어옴
    assert items["complex_articles"]["last_error"] == "네이버 API 차단"


def test_crawl_failures_excludes_outside_window(client, db):
    """창 밖(48시간 전) 실패는 제외, hours=24 기본"""
    _make_admin(db, "cf2")
    now = datetime.now(timezone.utc)
    old = now - timedelta(hours=48)
    db.add(CrawlJob(job_type="complex_articles", status="failed",
                    created_at=old, completed_at=old))
    db.add(CrawlJob(job_type="price_history", status="failed",
                    created_at=now, completed_at=now))
    db.commit()

    res = client.get("/api/admin/crawl-failures", headers=_auth(_token("cf2")))
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 1
    assert body["items"][0]["job_type"] == "price_history"


def test_crawl_failures_empty(client, db):
    """실패 0건이면 items=[] total=0"""
    _make_admin(db, "cf3")
    res = client.get("/api/admin/crawl-failures", headers=_auth(_token("cf3")))
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 0
    assert body["items"] == []


def test_crawl_failures_custom_hours(client, db):
    """hours=72 가 정상 적용되어 48시간 전 실패도 포함"""
    _make_admin(db, "cf4")
    now = datetime.now(timezone.utc)
    old = now - timedelta(hours=48)
    db.add(CrawlJob(job_type="complex_articles", status="failed",
                    created_at=old, completed_at=old))
    db.commit()

    res = client.get(
        "/api/admin/crawl-failures?hours=72", headers=_auth(_token("cf4"))
    )
    assert res.status_code == 200
    body = res.json()
    assert body["window_hours"] == 72
    assert body["total"] == 1


def test_crawl_failures_unauthenticated_401(client, db):
    """인증 없이 접근 → 401"""
    res = client.get("/api/admin/crawl-failures")
    assert res.status_code in (401, 403)
