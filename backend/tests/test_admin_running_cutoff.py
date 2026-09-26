"""'지금 돌아가는 작업' 컷오프가 잡 유형별 임계를 따르는지 (세션 419).

옛 규칙은 "시작 1시간 이내"로 고정이라, 정상적으로 1시간 넘게 도는 관리비 수집(3h)·
공시가격(16h) 같은 작업이 **돌고 있는데도** 관리자 화면 세 곳에서 사라졌다.
지금은 모니터가 멈춤으로 판정하는 임계(`crawler/monitor.py _STALE_HOURS_BY_TYPE`)를
그대로 쓴다 — 헬퍼 = `routers/admin/_running.py running_not_stale_clause`.

실행: python -m pytest tests/test_admin_running_cutoff.py -v
"""
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import jwt
from sqlalchemy import select
from sqlalchemy.dialects import postgresql

from db.models import CrawlJob, UserProfile
from routers.admin import recrawl as recrawl_mod
from routers.admin._running import running_not_stale_clause

JWT_SECRET = "test-secret-key-for-testing-only"


def _auth(uid):
    token = jwt.encode(
        {"sub": uid, "aud": "authenticated", "email": f"{uid}@test.com"},
        JWT_SECRET,
        algorithm="HS256",
    )
    return {"Authorization": f"Bearer {token}"}


def _admin(db, uid):
    db.add(UserProfile(user_id=uid, email=f"{uid}@test.com", role="admin", status="approved"))
    db.commit()


def _running(db, job_type, hours_ago):
    """hours_ago 시간 전에 시작해 아직 running 인 잡 한 건."""
    job = CrawlJob(
        job_type=job_type,
        status="running",
        started_at=datetime.now(timezone.utc) - timedelta(hours=hours_ago),
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def test_clause_compiles_for_postgresql_with_per_type_cutoffs():
    """운영 DB(PostgreSQL) 방언으로 만든 SQL 을 직접 본다 — CI(SQLite)가 방언 오류를 가리므로.

    유형별 (job_type = … AND started_at >= …) 묶음이 OR 로 이어지고,
    나머지 유형은 NOT IN 기본 임계로 받아야 한다.
    """
    now = datetime(2026, 9, 26, 0, 0, tzinfo=timezone.utc)
    stmt = select(CrawlJob.id).where(CrawlJob.status == "running", running_not_stale_clause(now))
    compiled = stmt.compile(
        dialect=postgresql.dialect(), compile_kwargs={"render_postcompile": True}
    )
    sql = str(compiled)
    assert " OR " in sql
    assert "crawl_jobs.job_type NOT IN (" in sql
    assert "crawl_jobs.started_at >= %(" in sql
    params = compiled.params
    # 관리비(3h)·공시가격(16h)·기본(1h) 컷오프가 각각 파라미터로 들어간다
    assert "kapt_costs" in params.values()
    assert "official_price" in params.values()
    assert now - timedelta(hours=3) in params.values()
    assert now - timedelta(hours=16) in params.values()
    assert now - timedelta(hours=1) in params.values()


def test_crawl_jobs_running_keeps_long_jobs_within_their_threshold(client, db):
    """06:20 시작한 관리비 수집이 07:30 에도 '지금 돌아가는 작업'에 보인다."""
    _admin(db, "rc1")
    kapt = _running(db, "kapt_costs", 2)  # 임계 3h — 보여야
    official = _running(db, "official_price", 10)  # 임계 16h — 보여야
    _running(db, "complex_articles", 2)  # 임계 기본 1h — 유령
    _running(db, "official_price", 17)  # 임계 16h 초과 — 유령
    fresh = _running(db, "complex_articles", 0.25)  # 15분 — 보여야

    res = client.get("/api/admin/crawl-jobs?status=running", headers=_auth("rc1"))
    assert res.status_code == 200
    body = res.json()
    ids = {item["id"] for item in body["items"]}
    assert ids == {kapt.id, official.id, fresh.id}
    assert body["total"] == 3


def test_recrawl_status_counts_long_job_within_threshold(client, db):
    """재수집 안전도 조회도 같은 기준 — 도는 관리비 수집은 세고, 2시간 된 매물 수집은 뺀다."""
    _admin(db, "rc2")
    kapt = _running(db, "kapt_costs", 2)
    _running(db, "complex_articles", 2)

    res = client.get("/api/admin/recrawl/status", headers=_auth("rc2"))
    assert res.status_code == 200
    body = res.json()
    assert body["running_jobs_count"] == 1
    assert [j["id"] for j in body["running_jobs"]] == [kapt.id]


def test_recrawl_run_recheck_uses_same_threshold(client, db):
    """일괄 재수집 시작 직전 재확인(두 번째 자리)도 같은 기준으로 센다."""
    _admin(db, "rc3")
    with recrawl_mod._recrawl_lock:
        recrawl_mod._recrawl_running = False
    _running(db, "kapt_costs", 2)  # 세야 함
    _running(db, "complex_articles", 2)  # 빼야 함

    seen: list[int] = []

    def _fake_classify(hour, count):
        seen.append(count)
        return "danger", "시험용 거부"

    with patch.object(recrawl_mod, "_classify_safety", _fake_classify):
        res = client.post(
            "/api/admin/recrawl/articles", headers=_auth("rc3"), json={"batch_size": 100}
        )
    assert res.status_code == 409
    assert seen == [1]
    with recrawl_mod._recrawl_lock:
        assert recrawl_mod._recrawl_running is False


def test_clause_reads_monitor_thresholds_live(monkeypatch):
    """임계는 모니터의 표를 **그 자리에서** 읽어야 한다 — 값만 같은 복사본이면 두 판정이 어긋난다.

    모니터 표를 가짜 유형·임계로 바꿔 끼우면 컷오프 절이 그대로 따라와야 한다.
    (복사본·import 시점 별칭으로 바꾸면 옛 값이 남아 이 시험이 실패한다.)
    """
    from crawler import monitor

    monkeypatch.setattr(monitor, "_STALE_HOURS_BY_TYPE", {"fake_long_job": 7})
    monkeypatch.setattr(monitor, "_STALE_HOURS", 2)
    now = datetime(2026, 9, 26, 0, 0, tzinfo=timezone.utc)
    compiled = (
        select(CrawlJob.id)
        .where(running_not_stale_clause(now))
        .compile(dialect=postgresql.dialect(), compile_kwargs={"render_postcompile": True})
    )
    values = list(compiled.params.values())
    assert "fake_long_job" in values
    assert now - timedelta(hours=7) in values
    assert now - timedelta(hours=2) in values  # 기본 임계도 모니터 값을 따른다
    # 바꿔 끼우기 전의 실제 표 값은 하나도 남지 않는다
    assert "kapt_costs" not in values
    assert now - timedelta(hours=3) not in values
    assert now - timedelta(hours=16) not in values
