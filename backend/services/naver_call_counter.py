"""Naver API 호출 계측 카운터.

목적: 어느 경로가 네이버 API를 얼마나 부르는지 슬라이딩 윈도우로 기록해
쿨다운 재발 시 병목을 숫자로 추적. 추측 리팩터 방지.

설계:
- 프로세스 in-memory, thread-safe (lock + deque)
- 윈도우: 최근 10분 / 1시간 / 24시간
- 엔드포인트 라벨은 호출측에서 문자열로 넘김
  (예: "search", "crawl_articles", "complex_prices", "article_detail", ...)
- HTTP 호출이 실제로 나간 경우에만 record_call 호출 (캐시 히트는 제외)
"""

import threading
import time
from collections import defaultdict, deque
from time import monotonic

_started_at = time.time()  # 모듈 로드 시각 (epoch)

_WINDOW_SECONDS = 24 * 3600  # 24시간 초과 레코드는 잘라냄
_MAX_RECORDS_PER_LABEL = 20000  # 라벨당 상한 (메모리 폭주 방지)

_lock = threading.Lock()
_records: dict[str, deque[float]] = defaultdict(deque)


def record_call(label: str) -> None:
    """네이버 API 호출 1회 기록.

    HTTP 요청이 실제 나간 경우에만 호출. 캐시 히트는 제외해야 의미 있는 수치가 됨.
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


def get_uptime_seconds() -> float:
    """프로세스(모듈 로드) 이후 경과 초."""
    return time.time() - _started_at


def get_stats() -> dict:
    """라벨별 10분/1시간/24시간 윈도우 카운트 + 총합 + 업타임 반환."""
    now = monotonic()
    buckets = {"10m": now - 600, "1h": now - 3600, "24h": now - _WINDOW_SECONDS}
    with _lock:
        per_label: dict[str, dict[str, int]] = {}
        for label, dq in _records.items():
            # 24h 초과 레코드 lazy GC (record_call 경로가 안 타는 라벨 대비)
            while dq and dq[0] < buckets["24h"]:
                dq.popleft()
            counts = {k: 0 for k in buckets}
            for ts in dq:
                for key, cutoff in buckets.items():
                    if ts >= cutoff:
                        counts[key] += 1
            per_label[label] = counts
        totals = {k: sum(pl[k] for pl in per_label.values()) for k in buckets}
    return {
        "labels": per_label,
        "totals": totals,
        "process_uptime_seconds": get_uptime_seconds(),
    }


def reset() -> None:
    """테스트 전용: 카운터 전체 초기화."""
    with _lock:
        _records.clear()
