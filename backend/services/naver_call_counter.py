"""Naver API 호출 계측 카운터.

목적: 어느 경로가 네이버 API를 얼마나 부르는지 슬라이딩 윈도우로 기록해
쿨다운 재발 시 병목을 숫자로 추적. 추측 리팩터 방지.

설계:
- 10분/1시간: 프로세스 in-memory (thread-safe lock + deque)
- 24시간: Supabase naver_api_call_counts 테이블 (시간 버킷 집계)
  → 프로세스 재시작에도 24h 통계 유지
- DB 장애 시 in-memory 폴백 (best-effort 영속화)
"""

import logging
import threading
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from time import monotonic

logger = logging.getLogger(__name__)

_started_at = time.time()  # 모듈 로드 시각 (epoch)

_WINDOW_SECONDS = 24 * 3600  # in-memory 24시간 초과 레코드 잘라냄
_MAX_RECORDS_PER_LABEL = 20000  # 라벨당 상한 (메모리 폭주 방지)

_lock = threading.Lock()
_records: dict[str, deque[float]] = defaultdict(deque)


def _persist_to_db(label: str) -> None:
    """DB 에 시간 버킷 +1 upsert. 실패 시 로그만 남기고 무시."""
    try:
        from db.database import SessionLocal

        now_utc = datetime.now(timezone.utc)
        bucket = now_utc.replace(minute=0, second=0, microsecond=0)

        db = SessionLocal()
        try:
            dialect = db.bind.dialect.name if db.bind else "postgresql"
            if dialect == "sqlite":
                from sqlalchemy.dialects.sqlite import insert as db_insert
            else:
                from sqlalchemy.dialects.postgresql import insert as db_insert

            from db.models import NaverApiCallCount

            stmt = db_insert(NaverApiCallCount).values(
                label=label,
                bucket_hour=bucket,
                call_count=1,
            )
            if dialect == "sqlite":
                stmt = stmt.on_conflict_do_update(
                    index_elements=["label", "bucket_hour"],
                    set_={"call_count": NaverApiCallCount.call_count + 1},
                )
            else:
                stmt = stmt.on_conflict_do_update(
                    constraint="uq_nacc_label_bucket",
                    set_={"call_count": NaverApiCallCount.call_count + 1},
                )
            db.execute(stmt)
            db.commit()
        finally:
            db.close()
    except Exception:
        logger.debug("naver_call_counter DB persist failed", exc_info=True)


def record_call(label: str) -> None:
    """네이버 API 호출 1회 기록.

    HTTP 요청이 실제 나간 경우에만 호출. 캐시 히트는 제외해야 의미 있는 수치가 됨.
    in-memory + DB 양쪽에 기록 (DB 실패 시 in-memory만).
    """
    now = monotonic()
    with _lock:
        dq = _records[label]
        dq.append(now)
        # 24시간 초과 앞쪽 레코드 정리
        cutoff = now - _WINDOW_SECONDS
        while dq and dq[0] < cutoff:
            dq.popleft()
        # 상한 초과 시 오래된 쪽부터 잘라냄 (극단적 호출 폭주 시 메모리 보호)
        while len(dq) > _MAX_RECORDS_PER_LABEL:
            dq.popleft()

    _persist_to_db(label)


def get_uptime_seconds() -> float:
    """프로세스(모듈 로드) 이후 경과 초."""
    return time.time() - _started_at


def _get_24h_from_db() -> dict[str, int]:
    """DB 에서 최근 24시간 라벨별 합계 조회. 실패 시 빈 dict."""
    try:
        from sqlalchemy import func

        from db.database import SessionLocal
        from db.models import NaverApiCallCount

        cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
        db = SessionLocal()
        try:
            rows = (
                db.query(
                    NaverApiCallCount.label,
                    func.sum(NaverApiCallCount.call_count).label("total"),
                )
                .filter(NaverApiCallCount.bucket_hour >= cutoff)
                .group_by(NaverApiCallCount.label)
                .all()
            )
            return {r.label: r.total for r in rows}
        finally:
            db.close()
    except Exception:
        logger.debug("naver_call_counter DB read failed", exc_info=True)
        return {}


def get_stats() -> dict:
    """라벨별 10분/1시간/24시간 윈도우 카운트 + 총합 + 업타임 반환.

    10m/1h: in-memory (실시간)
    24h: DB 우선, DB 실패 시 in-memory 폴백
    """
    now = monotonic()
    mem_buckets = {"10m": now - 600, "1h": now - 3600}

    # in-memory 에서 10m/1h 집계
    with _lock:
        per_label: dict[str, dict[str, int]] = {}
        for label, dq in _records.items():
            # 24h 초과 레코드 lazy GC
            cutoff_24h = now - _WINDOW_SECONDS
            while dq and dq[0] < cutoff_24h:
                dq.popleft()
            counts = {k: 0 for k in mem_buckets}
            for ts in dq:
                for key, cutoff in mem_buckets.items():
                    if ts >= cutoff:
                        counts[key] += 1
            per_label[label] = counts

    # 24h: DB 에서 조회
    db_24h = _get_24h_from_db()

    # DB 결과를 per_label 에 병합
    all_labels = set(per_label.keys()) | set(db_24h.keys())
    merged: dict[str, dict[str, int]] = {}
    for label in all_labels:
        mem = per_label.get(label, {"10m": 0, "1h": 0})
        merged[label] = {
            "10m": mem["10m"],
            "1h": mem["1h"],
            "24h": db_24h.get(label, 0),
        }

    totals = {
        "10m": sum(m["10m"] for m in merged.values()),
        "1h": sum(m["1h"] for m in merged.values()),
        "24h": sum(m["24h"] for m in merged.values()),
    }

    return {
        "labels": merged,
        "totals": totals,
        "process_uptime_seconds": get_uptime_seconds(),
    }


def reset() -> None:
    """테스트 전용: 카운터 전체 초기화."""
    with _lock:
        _records.clear()
