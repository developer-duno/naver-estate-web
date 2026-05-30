"""스케줄러 캘린더 API 테스트
실행: python -m pytest tests/test_scheduler_calendar.py -v

/api/admin/scheduler-calendar?year=&month=&mode= 의 행동:
- past: crawl_jobs 의 (scheduler_job_id NOT NULL, started_at ∈ 월) 반환
- upcoming: APScheduler trigger.get_next_fire_time 전개 (월 끝까지)
- both: 둘 다 합쳐서 반환
- 안전 상한 _CALENDAR_MAX_EVENTS 도달 시 truncated=True
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

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


def _path(year, month, mode="both"):
    return f"/api/admin/scheduler-calendar?year={year}&month={month}&mode={mode}"


# ── 인증 ──


def test_calendar_no_auth_401(client):
    """인증 없이 캘린더 조회 → 401"""
    assert client.get(_path(2026, 5)).status_code == 401


def test_calendar_regular_user_403(client, db):
    """일반 사용자 → 403"""
    p = UserProfile(user_id="u1", email="u1@test.com", role="user", status="approved")
    db.add(p)
    db.commit()
    res = client.get(_path(2026, 5), headers=_auth(_token("u1")))
    assert res.status_code == 403


# ── 빈 응답 ──


@patch("crawler.scheduler.get_scheduler", return_value=None)
def test_calendar_empty(mock_sched, client, db):
    """이력·미래 모두 없으면 events 빈 배열"""
    _make_admin(db)
    res = client.get(_path(2026, 5), headers=_auth(_token("admin1")))
    assert res.status_code == 200
    data = res.json()
    assert data["year"] == 2026
    assert data["month"] == 5
    assert data["mode"] == "both"
    assert data["events"] == []
    assert data["truncated"] is False


# ── 과거 모드 ──


@patch("crawler.scheduler.get_scheduler", return_value=None)
def test_calendar_past_mode_returns_crawl_jobs(mock_sched, client, db):
    """mode=past 면 crawl_jobs (scheduler_job_id NOT NULL) 만 반환."""
    _make_admin(db)
    # 2026-05-15 12:00 KST = 03:00 UTC
    started = datetime(2026, 5, 15, 3, 0, tzinfo=timezone.utc)
    db.add(CrawlJob(
        job_type="air_quality", scheduler_job_id="collect_air_quality",
        started_at=started, completed_at=started + timedelta(seconds=60),
        status="completed", total_items=100, processed_items=100,
    ))
    # scheduler_job_id NULL 은 응답에서 제외돼야
    db.add(CrawlJob(
        job_type="manual", scheduler_job_id=None,
        started_at=started, status="completed",
    ))
    db.commit()

    res = client.get(_path(2026, 5, "past"), headers=_auth(_token("admin1")))
    assert res.status_code == 200
    events = res.json()["events"]
    assert len(events) == 1
    assert events[0]["scheduler_job_id"] == "collect_air_quality"
    assert events[0]["name"] == "에어코리아 대기질"  # META 의 한국어 이름
    assert events[0]["status"] == "completed"
    assert events[0]["kind"] == "past"
    # KST iso 출력 확인 (12:00 KST = 03:00 UTC + 9h)
    assert "2026-05-15T12:00:00" in events[0]["start"]


@patch("crawler.scheduler.get_scheduler", return_value=None)
def test_calendar_past_excludes_other_months(mock_sched, client, db):
    """월 범위 밖의 crawl_jobs 는 응답에서 제외."""
    _make_admin(db)
    # 2026-04-30 23:00 KST = 14:00 UTC — 4월
    db.add(CrawlJob(
        job_type="x", scheduler_job_id="collect_air_quality",
        started_at=datetime(2026, 4, 30, 14, 0, tzinfo=timezone.utc),
        status="completed",
    ))
    # 2026-06-01 00:00 KST = 2026-05-31 15:00 UTC — 6월
    db.add(CrawlJob(
        job_type="x", scheduler_job_id="collect_air_quality",
        started_at=datetime(2026, 5, 31, 15, 0, tzinfo=timezone.utc),
        status="completed",
    ))
    db.commit()

    res = client.get(_path(2026, 5, "past"), headers=_auth(_token("admin1")))
    assert res.status_code == 200
    assert res.json()["events"] == []


# ── 미래 모드 ──


def _mock_scheduler_with_one_job(job_id: str, name: str, fires: list[datetime]):
    """trigger.get_next_fire_time 이 지정된 시각 반환하도록 mock scheduler 생성."""
    job = MagicMock()
    job.id = job_id
    job.name = name
    iter_fires = iter(fires + [None])

    def _next(prev, now):
        return next(iter_fires, None)

    job.trigger.get_next_fire_time = _next
    sched = MagicMock()
    sched.get_jobs.return_value = [job]
    return sched


def test_calendar_upcoming_mode_expands_trigger(client, db):
    """mode=upcoming 이면 trigger 전개로 향후 발화 시각 반환."""
    _make_admin(db)
    # 2026-05-25 14:00 KST = 05:00 UTC, 2026-05-26 14:00 KST = 05:00 UTC
    fires = [
        datetime(2026, 5, 25, 5, 0, tzinfo=timezone.utc),
        datetime(2026, 5, 26, 5, 0, tzinfo=timezone.utc),
    ]
    mock_sched = _mock_scheduler_with_one_job("collect_metrics", "단지 가치지표 수집", fires)
    with patch("crawler.scheduler.get_scheduler", return_value=mock_sched):
        res = client.get(_path(2026, 5, "upcoming"), headers=_auth(_token("admin1")))

    assert res.status_code == 200
    events = res.json()["events"]
    assert len(events) == 2
    assert all(e["kind"] == "upcoming" for e in events)
    assert all(e["status"] == "upcoming" for e in events)
    assert all(e["scheduler_job_id"] == "collect_metrics" for e in events)


# ── 잘못된 입력 ──


def test_calendar_rejects_bad_mode(client, db):
    """mode 가 past/upcoming/both 아니면 422."""
    _make_admin(db)
    res = client.get(_path(2026, 5, "invalid"), headers=_auth(_token("admin1")))
    assert res.status_code == 422


def test_calendar_rejects_bad_month(client, db):
    """month 가 1~12 범위 밖이면 422."""
    _make_admin(db)
    res = client.get(_path(2026, 13), headers=_auth(_token("admin1")))
    assert res.status_code == 422
