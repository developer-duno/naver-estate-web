"""TTL 캐시 — Naver API 중복 요청 방지

live.py에서 추출한 인메모리 캐시.
키별 TTL 만료 + 최대 크기 제한으로 메모리 누수 방지.
"""

import threading
import time

DEFAULT_TTL_SECONDS = 300  # 5분
MAX_CACHE_SIZE = 500

# 라우터별 캐시 레지스트리 — 순환 import 없이 캐시 무효화 가능
_registry: dict[str, "TTLCache"] = {}
_registry_lock = threading.Lock()


def get_cache(name: str) -> "TTLCache":
    """이름으로 TTLCache 조회. 없으면 생성 (스레드 안전)."""
    with _registry_lock:
        if name not in _registry:
            _registry[name] = TTLCache()
        return _registry[name]


class TTLCache:
    """스레드 안전 TTL 기반 인메모리 캐시"""

    def __init__(self, ttl: int = DEFAULT_TTL_SECONDS, max_size: int = MAX_CACHE_SIZE):
        self._ttl = ttl
        self._max_size = max_size
        self._store: dict[str, tuple[float, object]] = {}
        self._lock = threading.Lock()

    def get(self, key: str):
        """TTL 내 캐시 값 반환. 만료/미존재 시 None."""
        with self._lock:
            entry = self._store.get(key)
            if entry and (time.time() - entry[0]) < self._ttl:
                return entry[1]
            return None

    def set(self, key: str, value: object):
        with self._lock:
            self._store[key] = (time.time(), value)
            self._evict_expired()

    def delete(self, key: str):
        with self._lock:
            self._store.pop(key, None)

    def _evict_expired(self):
        """Lock은 호출자가 획득한 상태에서 실행"""
        if len(self._store) <= self._max_size:
            return
        now = time.time()
        expired = [k for k, (t, _) in self._store.items() if now - t >= self._ttl]
        for k in expired:
            del self._store[k]
        while len(self._store) > self._max_size:
            oldest_key = min(self._store, key=lambda k: self._store[k][0])
            del self._store[oldest_key]
