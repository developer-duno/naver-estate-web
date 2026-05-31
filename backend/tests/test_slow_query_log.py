"""슬로우 쿼리 로깅 단위 테스트.

검증 대상: services/slow_query_log.py 가 임계값 초과 SQL 만 logger.warning 으로
남기고, 빠른 쿼리는 조용히 통과하는지. 실제 prod 엔진(Supabase)을 못 쓰므로
in-memory SQLite 엔진에 attach 해서 동작을 격리 검증한다.
"""

import logging

from sqlalchemy import create_engine, text

from services import slow_query_log


def _fresh_sqlite_engine():
    """리스너가 안 붙은 새 in-memory SQLite 엔진."""
    return create_engine("sqlite://")


def test_fast_query_not_logged(caplog, monkeypatch):
    """임계값보다 빠른 쿼리는 warning 을 남기지 않는다 (정상 케이스)."""
    monkeypatch.setattr(slow_query_log, "SLOW_QUERY_MS", 1000)
    engine = _fresh_sqlite_engine()
    slow_query_log.attach(engine)

    with caplog.at_level(logging.WARNING):
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))

    slow_msgs = [r for r in caplog.records if "slow query" in r.message]
    assert slow_msgs == [], f"빠른 쿼리인데 slow query 로깅됨: {slow_msgs}"


def test_slow_query_logged(caplog, monkeypatch):
    """임계값 0ms 로 낮추면 모든 쿼리가 slow 로 잡힌다 (경계 — 임계값 초과 경로).

    실제 느린 쿼리를 만들지 않고 임계값을 0 으로 내려 결정론적으로 검증.
    SLOW_QUERY_MS=0 이면 elapsed(>0) >= 0 이 항상 참 → warning 발생.
    """
    monkeypatch.setattr(slow_query_log, "SLOW_QUERY_MS", 0)
    engine = _fresh_sqlite_engine()
    slow_query_log.attach(engine)

    with caplog.at_level(logging.WARNING):
        with engine.connect() as conn:
            conn.execute(text("SELECT 42"))

    slow_msgs = [r for r in caplog.records if "slow query" in r.message]
    assert slow_msgs, "임계값 0ms 인데 slow query 로깅 안 됨"
    # elapsed ms 와 SQL 일부가 메시지에 포함되는지
    assert "SELECT 42" in slow_msgs[-1].message


def test_long_sql_truncated(caplog, monkeypatch):
    """매우 긴 SQL 은 잘려서(…) 로그된다 (로그 폭주 방지)."""
    monkeypatch.setattr(slow_query_log, "SLOW_QUERY_MS", 0)
    engine = _fresh_sqlite_engine()
    slow_query_log.attach(engine)

    # _SQL_LOG_MAXLEN(500) 초과하는 긴 IN 절 생성
    long_in = ", ".join(str(n) for n in range(300))
    with caplog.at_level(logging.WARNING):
        with engine.connect() as conn:
            conn.execute(text(f"SELECT 1 WHERE 1 IN ({long_in})"))

    slow_msgs = [r for r in caplog.records if "slow query" in r.message]
    assert slow_msgs, "긴 쿼리가 로깅 안 됨"
    assert "…" in slow_msgs[-1].message, "긴 SQL 이 잘리지 않음(… 없음)"


def test_attach_failure_is_silent(monkeypatch):
    """event.listen 이 실패해도 attach 는 예외를 전파하지 않는다 (best-effort)."""
    # 엔진을 먼저 만든 뒤 패치 — create_engine 내부의 event.listen 까지 막지 않도록.
    engine = _fresh_sqlite_engine()

    def _boom(*_args, **_kwargs):
        raise RuntimeError("listen 실패 시뮬레이션")

    monkeypatch.setattr(slow_query_log.event, "listen", _boom)
    # attach 내부 event.listen 이 터져도 예외 없이 조용히 넘어가야 함
    slow_query_log.attach(engine)
