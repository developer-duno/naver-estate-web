"""슬로우 쿼리 로깅 — 임계값(기본 1초) 초과 SQL 을 logger.warning 으로 기록.

목적: micro Supabase 인스턴스에서 어느 쿼리가 느린지 숫자로 추적. 추측 진단 방지.
세션 254 micro RAM 스파이크 답습 — 폭주 쿼리가 연결을 오래 점유하면 인스턴스가
굶는다. statement_timeout(database.py) 은 8초에 죽이는 안전망이고, 본 모듈은 그
직전 구간(1~8초)을 가시화한다.

설계 (services/naver_call_counter.py 의 best-effort 패턴 미러):
- SQLAlchemy 엔진 이벤트(before/after_cursor_execute)로 실행 시각 측정.
- conn.info dict 에 시작 monotonic 스택을 저장 (SQLAlchemy 표준 패턴).
- 임계값 초과 시 logger.warning(elapsed + truncated SQL). 영속화·집계 없음 — 로그만.
- 부착 실패해도 앱은 정상 (best-effort). 테스트 엔진(SQLite)에는 부착 안 함.
"""

import logging
import os
from time import monotonic

from sqlalchemy import event
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)

# 임계값(ms) — env SLOW_QUERY_MS 로 조절, 기본 1000ms(1초).
SLOW_QUERY_MS = int(os.getenv("SLOW_QUERY_MS", "1000"))

# 로그에 남길 SQL 최대 길이 (긴 IN 절·대량 파라미터 SQL 잘라냄).
_SQL_LOG_MAXLEN = 500

# conn.info 에 시작 시각 스택을 담는 키.
_START_KEY = "_slow_query_start_stack"


def _before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    """쿼리 실행 직전 — 시작 시각을 스택에 push (중첩 실행 대비 list 사용)."""
    conn.info.setdefault(_START_KEY, []).append(monotonic())


def _after_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    """쿼리 실행 직후 — 경과 시간 계산, 임계값 초과 시 warning."""
    stack = conn.info.get(_START_KEY)
    if not stack:
        return
    elapsed_ms = (monotonic() - stack.pop()) * 1000.0
    if elapsed_ms >= SLOW_QUERY_MS:
        sql = " ".join(statement.split())  # 개행·연속 공백 정리
        if len(sql) > _SQL_LOG_MAXLEN:
            sql = sql[:_SQL_LOG_MAXLEN] + "…"
        logger.warning("slow query %.0fms: %s", elapsed_ms, sql)


def attach(engine: Engine) -> None:
    """엔진에 슬로우 쿼리 리스너 부착 (best-effort — 실패해도 앱 정상).

    prod 엔진(db.database.engine)에만 호출. 테스트는 conftest 가 SQLite 엔진을
    주입하므로 본 함수 미호출 → 테스트 영향 0.
    """
    try:
        event.listen(engine, "before_cursor_execute", _before_cursor_execute)
        event.listen(engine, "after_cursor_execute", _after_cursor_execute)
        logger.info("슬로우 쿼리 로깅 활성화: 임계값 %dms", SLOW_QUERY_MS)
    except Exception:
        logger.debug("slow_query_log attach failed", exc_info=True)
