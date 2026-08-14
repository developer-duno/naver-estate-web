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
    # 엔드포인트가 range_start=max(now, 월초)로 과거를 거르므로, 발화 시각은
    # "현재 이후 + 요청한 달 안"이어야 한다. 하드코딩 날짜는 그 달이 지나면
    # 과거가 되어 0건으로 깨진다(시한폭탄) → 다음 달을 동적 계산해 영구 해소.
    now = datetime.now(timezone.utc)
    nyear, nmonth = (now.year, now.month + 1) if now.month < 12 else (now.year + 1, 1)
    fires = [
        datetime(nyear, nmonth, 10, 5, 0, tzinfo=timezone.utc),
        datetime(nyear, nmonth, 11, 5, 0, tzinfo=timezone.utc),
    ]
    mock_sched = _mock_scheduler_with_one_job("collect_metrics", "단지 가치지표 수집", fires)
    with patch("crawler.scheduler.get_scheduler", return_value=mock_sched):
        res = client.get(_path(nyear, nmonth, "upcoming"), headers=_auth(_token("admin1")))

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


# ── 이름표 3단 폴백 (META → MANUAL_JOB_NAMES → 원문, R2) ──


def _add_past_job(db, job_id: str):
    """2026-05-15 12:00 KST 에 완료된 과거 CrawlJob 1건 추가."""
    db.add(CrawlJob(
        job_type="x", scheduler_job_id=job_id,
        started_at=datetime(2026, 5, 15, 3, 0, tzinfo=timezone.utc),
        status="completed",
    ))
    db.commit()


@patch("crawler.scheduler.get_scheduler", return_value=None)
def test_calendar_manual_job_ids_use_korean_names(mock_sched, client, db):
    """META 미등록 '수동 실행' 5종은 MANUAL_JOB_NAMES 한국어 이름표로 표시된다.

    이 5개는 관리자 버튼(recrawl)·수동 스크립트(backfill_*·공시가격 첫 적재)가 남기는
    job id 라 정기 잡 META 엔 없다. 이름표 없으면 화면에 raw id 가 그대로 노출됐다
    (R2 수정, R3 에서 collect_official_prices 추가).
    """
    from routers.admin.scheduler import MANUAL_JOB_NAMES

    _make_admin(db)
    for job_id in MANUAL_JOB_NAMES:
        _add_past_job(db, job_id)

    res = client.get(_path(2026, 5, "past"), headers=_auth(_token("admin1")))
    assert res.status_code == 200
    names = {e["scheduler_job_id"]: e["name"] for e in res.json()["events"]}
    assert names == dict(MANUAL_JOB_NAMES), names
    # raw id 가 이름으로 새어나오지 않는다
    assert all(name != job_id for job_id, name in names.items())


@patch("crawler.scheduler.get_scheduler", return_value=None)
def test_calendar_official_price_manual_job_has_korean_name(mock_sched, client, db):
    """R3 — 공시가격 수동 첫 적재(collect_official_prices) 도 한국어 이름표로 표시된다.

    세션 355~356 수동 적재 흔적이 캘린더에 raw id 로 남아 있었다.
    """
    _make_admin(db)
    _add_past_job(db, "collect_official_prices")

    res = client.get(_path(2026, 5, "past"), headers=_auth(_token("admin1")))
    assert res.status_code == 200
    events = res.json()["events"]
    assert len(events) == 1
    assert events[0]["name"] == "공동주택 공시가격 수집 (수동)"


@patch("crawler.scheduler.get_scheduler", return_value=None)
def test_calendar_debug_leftover_job_ids_stay_raw(mock_sched, client, db):
    """디버그 잔재(*_TEST·manual_session359)는 일부러 원문 유지 — 이름표 추가 금지 가드.

    "테스트로 돌린 흔적"이라는 정보 자체가 관리자에게 필요해서, 한국어로 포장하면
    정기 작업처럼 보여 오히려 오해를 부른다.
    """
    from routers.admin.scheduler import MANUAL_JOB_NAMES

    for leftover in ("collect_official_prices_TEST", "manual_session359"):
        assert leftover not in MANUAL_JOB_NAMES


@patch("crawler.scheduler.get_scheduler", return_value=None)
def test_calendar_unknown_job_id_falls_back_to_raw(mock_sched, client, db):
    """META·MANUAL 어디에도 없는 id 는 원문 그대로 (정보 소실 방지)."""
    _make_admin(db)
    _add_past_job(db, "some_unregistered_job")

    res = client.get(_path(2026, 5, "past"), headers=_auth(_token("admin1")))
    assert res.status_code == 200
    events = res.json()["events"]
    assert len(events) == 1
    assert events[0]["name"] == "some_unregistered_job"


@patch("crawler.scheduler.get_scheduler", return_value=None)
def test_scheduler_status_does_not_list_manual_jobs(mock_sched, client, db):
    """유령 행 방지 가드 — MANUAL_JOB_NAMES 5종은 scheduler-status 표에 없다.

    이 이름표를 SCHEDULER_JOB_META 에 넣으면 정기 잡이 아닌데도 상태표를 순회해
    "예정 없음" 유령 행이 생긴다. 별도 dict 로 분리한 이유를 고정한다.
    """
    from routers.admin.scheduler import MANUAL_JOB_NAMES

    _make_admin(db)
    res = client.get("/api/admin/scheduler-status", headers=_auth(_token("admin1")))
    assert res.status_code == 200
    listed = {j["scheduler_job_id"] for j in res.json()["jobs"]}
    assert listed.isdisjoint(MANUAL_JOB_NAMES), listed & set(MANUAL_JOB_NAMES)
