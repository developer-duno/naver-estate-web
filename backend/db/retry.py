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
    """DB 쓰기(또는 읽기) 묶음 `work()` 를 실행한다. OperationalError(순간 끊김·8초 제한)와
    InterfaceError(이미 끊긴 연결, 세션 460)만 롤백 →
    대기 → 같은 묶음 통째로 다시(최대 3번). 3번 다 실패하면 그 예외를 그대로 던진다(조용히 넘기지 않는다).
    다른 예외(IntegrityError 등)는 재시도 없이 바로 던진다. `what` 은 경고 로그에 붙는 우리말 이름.

    ⚠ 쓰는 쪽이 지킬 것 세 가지:
    - `work` 안에 외부 호출(API·문자·알림)을 넣지 않는다 — 재시도 때 그것까지 최대 4번 반복된다.
    - `work` 안에서 커밋을 여러 번 하면 앞쪽 커밋은 이미 반영돼 있다 — 묶음은 다시 해도 같은 결과(멱등)여야 한다
      (예: DELETE 뒤 ON CONFLICT 덮어쓰기).
    - 묶음 밖의 카운터·버퍼는 `work()` 가 성공해 돌아온 뒤에만 고친다(재시도로 두 번 세거나 비운 채 다시 하지 않게)."""
    from sqlalchemy.exc import InterfaceError, OperationalError

    transient = (OperationalError, InterfaceError)

    for k, wait in enumerate(DB_RETRY_WAITS, start=1):
        try:
            return work()
        except transient as e:
            db.rollback()
            cause = (str(getattr(e, "orig", e)).strip().splitlines() or ["?"])[0][:120]
            logger.warning("%s 중 DB 가 잠깐 응답하지 않았어요(제한 시간 초과 또는 연결 끊김) — %d초 뒤 다시(재시도 %d/%d)"
                           " · 원인: %s", what, wait, k, len(DB_RETRY_WAITS), cause)
            sleep(wait)
    try:
        return work()
    except transient:
        db.rollback()
        raise
