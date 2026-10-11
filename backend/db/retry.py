"""DB 순간 끊김(8초 제한·연결 끊김) 재시도 — 일회성 스크립트·수집기 공용 (세션 459).

처음엔 단지 짝짓기(scripts/map_complex_sgis.py, #701)에만 있던 것을 동네 통계(crawler/service_sgis.py)도
같이 쓰도록 옮겼다. 동작은 그대로다.
"""

from __future__ import annotations

import logging
import time

logger = logging.getLogger(__name__)

DB_RETRY_WAITS = (5, 15, 45)  # DB 순간 끊김 재시도 대기(초) — 첫 시도 뒤 최대 3번 다시


def retry_db(db, work, sleep=time.sleep, what: str = "DB 작업"):
    """DB 쓰기(또는 읽기) 묶음 `work()` 를 실행한다. OperationalError(순간 끊김·8초 제한)만 롤백 →
    대기 → 같은 묶음 통째로 다시(최대 3번). 3번 다 실패하면 그 예외를 그대로 던진다(조용히 넘기지 않는다).
    다른 예외(IntegrityError 등)는 재시도 없이 바로 던진다. `what` 은 경고 로그에 붙는 우리말 이름."""
    from sqlalchemy.exc import OperationalError

    for k, wait in enumerate(DB_RETRY_WAITS, start=1):
        try:
            return work()
        except OperationalError as e:
            db.rollback()
            cause = (str(getattr(e, "orig", e)).strip().splitlines() or ["?"])[0][:120]
            logger.warning("%s 중 DB 가 잠깐 응답하지 않았어요(제한 시간 초과 또는 연결 끊김) — %d초 뒤 다시(재시도 %d/%d)"
                           " · 원인: %s", what, wait, k, len(DB_RETRY_WAITS), cause)
            sleep(wait)
    try:
        return work()
    except OperationalError:
        db.rollback()
        raise
