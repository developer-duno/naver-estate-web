"""관리자 상세 통계(/api/admin/stats/detailed) 5분 캐시 + 재계산 때만 시간 제한 30초.

운영 부하 시간대에 count 들이 8초 statement_timeout 을 넘겨 500 이 나던 것(2026-09-26)을
막는 장치의 회귀 가드. 캐시 적중은 "호출 수"가 아니라 **결과**로 판별한다 — 두 호출 사이에
DB 행을 추가해도 숫자가 그대로면 보관본을 준 것이다.
관리자 전용 전역 집계라 보는 사람과 무관한 값이다(한 벌 보관이 안전한 이유).
실행: python -m pytest tests/test_admin_stats_cache.py -v
"""
import threading
import time
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import patch

import jwt
import pytest
from fastapi import HTTPException

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

    def _fake_compute(db):
        # 가짜 계산도 같은 실행 기록에 한 줄 남긴다 — "시간 제한을 먼저 올리고 계산" 순서를 보려고.
        # SQLite(CI)에서는 시간 제한을 관찰할 수 없어 이 순서 단언이 유일한 방어선이다.
        executed.append("COMPUTE")
        return {"complex_count": 7}

    with patch.object(jobs, "_compute_detailed_stats", side_effect=_fake_compute):
        assert jobs._cached_detailed_stats(fake, now=0.0) == {"complex_count": 7}
        assert executed == ["SET LOCAL statement_timeout = 30000", "COMPUTE"]
        assert jobs._cached_detailed_stats(fake, now=10.0) == {"complex_count": 7}
        # 보관본 — 추가 SQL·추가 계산 0
        assert executed == ["SET LOCAL statement_timeout = 30000", "COMPUTE"]


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


class _CountingLock:
    """진짜 Lock 을 감싸 acquire 시도 횟수만 센다 — "모두 잠금 앞에 도착했다"를 sleep 없이 알려고."""

    def __init__(self):
        self._lock = threading.Lock()
        self._count_guard = threading.Lock()
        self.attempts = 0

    def acquire(self, blocking=True, timeout=-1):
        with self._count_guard:
            self.attempts += 1
        return self._lock.acquire(blocking, timeout)

    def release(self):
        self._lock.release()

    def locked(self):
        return self._lock.locked()

    def __enter__(self):  # conftest 의 _reset_stats_cache 가 with 로 쓴다
        self.acquire()
        return self

    def __exit__(self, *exc):
        self.release()


def _wait_until(cond, deadline_sec=5.0):
    """조건이 참이 될 때까지 짧게 돌며 기다린다(시간을 맞추려는 sleep 이 아니라 조건 대기)."""
    end = time.monotonic() + deadline_sec
    while time.monotonic() < end:
        if cond():
            return True
        time.sleep(0.005)
    return cond()


def test_concurrent_requests_compute_only_once(monkeypatch):
    """⑤ 동시에 5개가 와도 계산은 1번 — 나머지는 잠금에서 기다렸다가 보관본을 받는다."""
    from routers.admin import jobs

    lock = _CountingLock()
    monkeypatch.setattr(jobs, "_stats_lock", lock)
    fake, _executed = _fake_pg_db()
    first_entered = threading.Event()
    let_go = threading.Event()
    calls = {"n": 0}
    calls_guard = threading.Lock()

    def _slow_compute(db):
        with calls_guard:
            calls["n"] += 1
        first_entered.set()
        assert let_go.wait(5), "시험이 계산을 풀어 주지 않았다"
        return {"complex_count": 42}

    results: list = []
    errors: list = []

    def _call():
        try:
            results.append(jobs._cached_detailed_stats(fake, now=0.0))
        except Exception as e:  # noqa: BLE001 — 스레드 안 예외를 시험 본문에서 드러내려고
            errors.append(e)

    with patch.object(jobs, "_compute_detailed_stats", side_effect=_slow_compute):
        threads = [threading.Thread(target=_call) for _ in range(5)]
        threads[0].start()
        assert first_entered.wait(5), "첫 요청이 계산에 들어가지 않았다"
        for t in threads[1:]:
            t.start()
        # 나머지 4개가 잠금 앞에 도착(시도 5회)하거나, 잠금이 없어 계산에 들어갈 때까지 기다린다
        _wait_until(lambda: lock.attempts >= 5 or calls["n"] > 1)
        let_go.set()
        for t in threads:
            t.join(5)
        assert not any(t.is_alive() for t in threads)

    assert errors == []
    assert calls["n"] == 1
    assert results == [{"complex_count": 42}] * 5
    assert not lock.locked()  # 끝나면 잠금이 풀려 있다


def test_lock_wait_limit_returns_503_and_does_not_hold_lock():
    """⑥ 다른 요청이 계산 중이라 잠금을 제한 시간 안에 못 얻으면 503 — 무한정 기다리지 않는다."""
    from routers.admin import jobs

    fake, executed = _fake_pg_db()
    outcome: list = []

    def _call():
        try:
            outcome.append(jobs._cached_detailed_stats(fake, now=0.0, lock_wait_sec=0.05))
        except HTTPException as e:
            outcome.append(e)

    with patch.object(jobs, "_compute_detailed_stats", return_value={"complex_count": 1}):
        assert jobs._stats_lock.acquire(timeout=1)  # 다른 요청이 계산 중인 상태를 흉내
        try:
            t = threading.Thread(target=_call)
            t.start()
            t.join(3)
            finished_while_held = not t.is_alive()
        finally:
            jobs._stats_lock.release()
            t.join(5)

    assert finished_while_held, "잠금을 쥔 동안 제한 시간이 지나도 돌아오지 않았다(대기 상한 없음)"
    assert len(outcome) == 1 and isinstance(outcome[0], HTTPException)
    assert outcome[0].status_code == 503
    assert outcome[0].detail == "상세 통계를 계산하는 중이에요. 잠시 뒤 다시 열어 주세요."
    assert executed == []  # 계산도 시간 제한도 건드리지 않았다
    # 503 을 낸 요청은 잠금을 쥐지 않았다 — 바로 다음 요청은 정상 계산
    with patch.object(jobs, "_compute_detailed_stats", return_value={"complex_count": 1}):
        assert jobs._cached_detailed_stats(fake, now=0.0) == {"complex_count": 1}
    assert not jobs._stats_lock.locked()


def test_lock_released_when_compute_raises():
    """⑦ 계산이 예외로 끝나도 잠금은 풀린다(finally) — 다음 요청이 기다리지 않고 바로 들어간다."""
    from routers.admin import jobs

    fake, _executed = _fake_pg_db()
    with patch.object(jobs, "_compute_detailed_stats", side_effect=RuntimeError("계산 실패")):
        with pytest.raises(RuntimeError):
            jobs._cached_detailed_stats(fake, now=0.0)
    assert not jobs._stats_lock.locked()
