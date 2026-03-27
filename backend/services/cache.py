"""TTL 캐시 — Naver API 중복 요청 방지

live.py에서 추출한 인메모리 캐시.
키별 TTL 만료 + 최대 크기 제한으로 메모리 누수 방지.
시간대별 동적 TTL로 네이버 API 호출 최소화.
"""

import threading
import time
from datetime import datetime, timedelta, timezone

DEFAULT_TTL_SECONDS = 300  # 5분 (동적 TTL 미사용 시 기본값)
MAX_CACHE_SIZE = 2000

_KST = timezone(timedelta(hours=9))


def get_dynamic_ttl() -> int:
    """KST 시간대별 캐시 TTL 반환.

    중개사 활동 패턴 기반:
      새벽 0~9시:  2시간 (데이터 변동 거의 없음)
      오전 9~12시: 15분  (매물 등록 활발)
      오후 12~18시: 30분 (중간 활동)
      저녁 18~24시: 1시간 (활동 감소)
    """
    hour = datetime.now(_KST).hour
    if hour < 9:
        return 7200   # 2시간
    elif hour < 12:
        return 900    # 15분
    elif hour < 18:
        return 1800   # 30분
    else:
        return 3600   # 1시간


# 라우터별 캐시 레지스트리 — 순환 import 없이 캐시 무효화 가능
_registry: dict[str, "TTLCache"] = {}
_registry_lock = threading.Lock()


def get_cache(name: str, dynamic: bool = False) -> "TTLCache":
    """이름으로 TTLCache 조회. 없으면 생성 (스레드 안전)."""
    with _registry_lock:
        if name not in _registry:
            _registry[name] = TTLCache(dynamic=dynamic)
        return _registry[name]


class TTLCache:
    """스레드 안전 TTL 기반 인메모리 캐시"""

    def __init__(self, ttl: int = DEFAULT_TTL_SECONDS, max_size: int = MAX_CACHE_SIZE, dynamic: bool = False):
        self._ttl = ttl
        self._dynamic = dynamic
        self._max_size = max_size
        self._store: dict[str, tuple[float, object]] = {}
        self._lock = threading.Lock()

    @property
    def _effective_ttl(self) -> int:
        """동적 TTL 사용 시 시간대별 값, 아니면 고정값 반환."""
        return get_dynamic_ttl() if self._dynamic else self._ttl

    def get(self, key: str):
        """TTL 내 캐시 값 반환. 만료/미존재 시 None."""
        with self._lock:
            entry = self._store.get(key)
            if entry and (time.time() - entry[0]) < self._effective_ttl:
                return entry[1]
            return None

    def set(self, key: str, value: object):
        with self._lock:
            self._store[key] = (time.time(), value)
            self._evict_expired()

    def delete(self, key: str):
        with self._lock:
            self._store.pop(key, None)

    def delete_by_prefix(self, prefix: str):
        """prefix로 시작하는 모든 캐시 키 삭제."""
        with self._lock:
            keys = [k for k in self._store if k.startswith(prefix)]
            for k in keys:
                del self._store[k]

    def _evict_expired(self):
        """Lock은 호출자가 획득한 상태에서 실행"""
        if len(self._store) <= self._max_size:
            return
        now = time.time()
        ttl = self._effective_ttl
        expired = [k for k, (t, _) in self._store.items() if now - t >= ttl]
        for k in expired:
            del self._store[k]
        while len(self._store) > self._max_size:
            oldest_key = min(self._store, key=lambda k: self._store[k][0])
            del self._store[oldest_key]
