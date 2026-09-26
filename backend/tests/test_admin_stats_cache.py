"""관리자 상세 통계(/api/admin/stats/detailed) 5분 캐시 + 재계산 때만 시간 제한 30초.

운영 부하 시간대에 count 들이 8초 statement_timeout 을 넘겨 500 이 나던 것(2026-09-26)을
막는 장치의 회귀 가드. 캐시 적중은 "호출 수"가 아니라 **결과**로 판별한다 — 두 호출 사이에
DB 행을 추가해도 숫자가 그대로면 보관본을 준 것이다.
관리자 전용 전역 집계라 보는 사람과 무관한 값이다(한 벌 보관이 안전한 이유).
실행: python -m pytest tests/test_admin_stats_cache.py -v
"""
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import patch

import jwt
import pytest

from db.models import CrawlJob, UserProfile

JWT_SECRET = "test-secret-key-for-testing-only"


def _admin_headers(db, uid="sc1"):
    """관리자 프로필을 만들고 인증 헤더를 돌려준다."""
    db.add(UserProfile(user_id=uid, email=f"{uid}@test.com", role="admin", status="approved"))
    db.commit()
    token = jwt.encode(
        {"sub": uid, "aud": "authenticated", "email": f"{uid}@test.com"},
        JWT_SECRET, algorithm="HS256",
    )
    return {"Authorization": f"Bearer {token}"}


def _add_job_now(db):
    """오늘 만든 크롤 작업 1건 — today_crawl_count 를 1 올리는 행."""
    db.add(CrawlJob(job_type="complex_articles", status="completed",
                    created_at=datetime.now(timezone.utc)))
    db.commit()


def test_cache_hit_within_5min_returns_same_numbers(client, db):
    """ⓐ 5분 안의 두 번째 요청은 그 사이 행이 늘어도 첫 결과 그대로(DB 재조회 안 함)."""
    headers = _admin_headers(db)
    first = client.get("/api/admin/stats/detailed", headers=headers)
    assert first.status_code == 200, first.text
    assert first.json()["today_crawl_count"] == 0

    _add_job_now(db)  # 새로 계산했다면 1 이 된다

    second = client.get("/api/admin/stats/detailed", headers=headers)
    assert second.status_code == 200, second.text
    assert second.json() == first.json()


def test_recompute_after_5min_with_injected_clock(db):
    """ⓑ 시각을 밖에서 넣어 5분 경계 확인 — 299.9초는 보관본, 300초부터 새로 계산."""
    from routers.admin.jobs import _cached_detailed_stats

    t0 = 1000.0
    assert _cached_detailed_stats(db, now=t0)["today_crawl_count"] == 0
    _add_job_now(db)
    assert _cached_detailed_stats(db, now=t0 + 299.9)["today_crawl_count"] == 0
    assert _cached_detailed_stats(db, now=t0 + 300)["today_crawl_count"] == 1


def test_sqlite_does_not_run_set_local(client, db):
    """ⓒ SQLite(CI)에서는 SET LOCAL 을 실행하지 않는다 — 실행하면 문법 오류로 500."""
    from routers.admin.jobs import _raise_statement_timeout_for_stats

    assert db.bind.dialect.name == "sqlite"
    assert _raise_statement_timeout_for_stats(db) is False
    res = client.get("/api/admin/stats/detailed", headers=_admin_headers(db))
    assert res.status_code == 200, res.text


def _fake_pg_db():
    """PostgreSQL 인 척하는 세션 — 실행한 SQL 문장만 기록한다."""
    executed: list[str] = []
    fake = SimpleNamespace(
        bind=SimpleNamespace(dialect=SimpleNamespace(name="postgresql")),
        execute=lambda stmt: executed.append(str(stmt)),
    )
    return fake, executed


def test_postgres_raises_timeout_only_when_recomputing():
    """ⓒ PostgreSQL 에서는 재계산 때만 SET LOCAL 30초, 보관본을 줄 때는 아무 SQL 도 안 보낸다."""
    from routers.admin import jobs

    fake, executed = _fake_pg_db()
    with patch.object(jobs, "_compute_detailed_stats", return_value={"complex_count": 7}):
        assert jobs._cached_detailed_stats(fake, now=0.0) == {"complex_count": 7}
        assert executed == ["SET LOCAL statement_timeout = 30000"]
        assert jobs._cached_detailed_stats(fake, now=10.0) == {"complex_count": 7}
        assert executed == ["SET LOCAL statement_timeout = 30000"]  # 보관본 — 추가 SQL 0


def test_recompute_failure_is_not_hidden_by_old_value(db):
    """④ 5분이 지나 다시 계산하다 실패하면 옛 값으로 대신하지 않고 예외 그대로."""
    from routers.admin import jobs

    assert jobs._cached_detailed_stats(db, now=0.0)["today_crawl_count"] == 0
    with patch.object(jobs, "_compute_detailed_stats", side_effect=RuntimeError("계산 실패")):
        with pytest.raises(RuntimeError, match="계산 실패"):
            jobs._cached_detailed_stats(db, now=301.0)
    # 실패는 보관본을 갱신하지 않는다 — 다음 요청은 다시 계산한다
    _add_job_now(db)
    assert jobs._cached_detailed_stats(db, now=302.0)["today_crawl_count"] == 1
