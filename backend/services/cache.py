"""TTL 캐시 — Naver API 중복 요청 방지

live.py에서 추출한 인메모리 캐시.
키별 TTL 만료 + 최대 크기 제한으로 메모리 누수 방지.
"""

import time

DEFAULT_TTL_SECONDS = 300  # 5분
MAX_CACHE_SIZE = 500


class TTLCache:
    """단순 TTL 기반 인메모리 캐시"""

    def __init__(self, ttl: int = DEFAULT_TTL_SECONDS, max_size: int = MAX_CACHE_SIZE):
        self._ttl = ttl
        self._max_size = max_size
        self._store: dict[str, tuple[float, object]] = {}

    def get(self, key: str):
        """TTL 내 캐시 값 반환. 만료/미존재 시 None."""
        entry = self._store.get(key)
        if entry and (time.time() - entry[0]) < self._ttl:
            return entry[1]
        return None

    def set(self, key: str, value: object):
        self._store[key] = (time.time(), value)
        self._evict_expired()

    def delete(self, key: str):
        self._store.pop(key, None)

    def _evict_expired(self):
        if len(self._store) <= self._max_size:
            return
        now = time.time()
        expired = [k for k, (t, _) in self._store.items() if now - t >= self._ttl]
        for k in expired:
            del self._store[k]
        # 만료 삭제 후에도 초과 시 가장 오래된 항목 강제 삭제
        while len(self._store) > self._max_size:
            oldest_key = min(self._store, key=lambda k: self._store[k][0])
            del self._store[oldest_key]
