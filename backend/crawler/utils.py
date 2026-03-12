"""크롤러 유틸리티 — naver-apt JS 엔진에서 포팅

LRU 캐시, 적응형 쓰로틀링, Haversine 거리, 한국어 가격 파서,
크롤러 체크포인트 매니저.
"""

import logging
import math
import re
import time
import threading
from typing import Any

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


# ── LRU 캐시 (Map 기반 TTL) ──

class LRUCache:
    """TTL 기반 LRU 캐시 (naver-api.mjs 포팅).

    - MAX_SIZE 초과 시 가장 오래된 항목 제거 (FIFO)
    - TTL 초과 항목은 get 시 자동 만료
    - 스레드 안전
    """

    def __init__(self, max_size: int = 5000, ttl_seconds: int = 3600):
        self._cache: dict[str, dict] = {}
        self._max_size = max_size
        self._ttl = ttl_seconds
        self._lock = threading.Lock()

    def get(self, key: str) -> Any | None:
        with self._lock:
            entry = self._cache.get(key)
            if entry is None:
                return None
            if time.monotonic() - entry["time"] > self._ttl:
                del self._cache[key]
                return None
            return entry["data"]

    def set(self, key: str, data: Any) -> None:
        with self._lock:
            if len(self._cache) >= self._max_size:
                oldest_key = next(iter(self._cache))
                del self._cache[oldest_key]
            self._cache[key] = {"time": time.monotonic(), "data": data}

    def clear(self) -> None:
        with self._lock:
            self._cache.clear()

    def __len__(self) -> int:
        with self._lock:
            return len(self._cache)


# ── 적응형 쓰로틀링 ──

class AdaptiveThrottle:
    """적응형 요청 간격 조절 (naver-api.mjs 포팅).

    - 429 응답 → interval ×1.5 (최대 5초)
    - 10회 연속 성공 → interval ×0.8 (최소 min_interval)
    - 스레드 안전
    """

    def __init__(self, min_interval: float = 1.0, max_interval: float = 5.0):
        self._min_interval = min_interval
        self._max_interval = max_interval
        self._dynamic_interval = min_interval
        self._consecutive_success = 0
        self._last_request_time = 0.0
        self._lock = threading.Lock()

    def wait(self, extra_delay: float = 0.0) -> None:
        """다음 요청 전 필요한 만큼 대기"""
        with self._lock:
            elapsed = time.monotonic() - self._last_request_time
            wait_time = max(0, self._dynamic_interval + extra_delay - elapsed)

        if wait_time > 0:
            time.sleep(wait_time)

        with self._lock:
            self._last_request_time = time.monotonic()

    def on_rate_limit(self) -> None:
        """429 응답 시 호출 — 간격 1.5배 증가"""
        with self._lock:
            self._dynamic_interval = min(
                self._dynamic_interval * 1.5, self._max_interval
            )
            self._consecutive_success = 0
            logger.warning(
                "429 Rate Limit — 쓰로틀 증가: %.0fms", self._dynamic_interval * 1000
            )

    def on_success(self) -> None:
        """성공 응답 시 호출 — 10회 연속 성공 시 간격 축소"""
        with self._lock:
            self._consecutive_success += 1
            if (
                self._consecutive_success >= 10
                and self._dynamic_interval > self._min_interval
            ):
                self._dynamic_interval = max(
                    self._dynamic_interval * 0.8, self._min_interval
                )
                self._consecutive_success = 0

    @property
    def current_interval(self) -> float:
        with self._lock:
            return self._dynamic_interval


# ── Haversine 거리 계산 ──

def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """두 좌표 사이의 거리 (km) — Haversine 공식.

    crawl.mjs 포팅: 6371km × 2 × atan2
    """
    R = 6371  # 지구 반지름 (km)
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(d_lng / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def bounding_box(lat: float, lng: float, radius_km: float = 3.0):
    """Haversine 프리필터용 bounding box 좌표 반환.

    PostGIS 없이 SQL WHERE로 후보를 축소한 뒤 Python에서 정밀 필터링.
    위도 1도 ≈ 111km, 경도 1도 ≈ 88km (한국 위도 기준)
    """
    lat_delta = radius_km / 111.0
    lng_delta = radius_km / (111.0 * math.cos(math.radians(lat)))
    return {
        "lat_min": lat - lat_delta,
        "lat_max": lat + lat_delta,
        "lng_min": lng - lng_delta,
        "lng_max": lng + lng_delta,
    }


# ── 한국어 가격 파서 ──

def parse_naver_price(price_str: str | None) -> int:
    """네이버 부동산 가격 문자열 → 만원 단위 정수.

    naver-api.mjs parseNaverPrice() 포팅.
    예: "3억2천500" → 32500, "1억" → 10000, "3천500" → 3500, "8500" → 8500
    """
    if not price_str:
        return 0
    s = re.sub(r"[,\s만원]", "", str(price_str))

    parts = s.split("억")
    if len(parts) == 2:
        eok = (int(parts[0]) if parts[0] else 0) * 10000
        rest = parts[1]
        return eok + _parse_sub_eok(rest)

    return _parse_sub_eok(s)


def _parse_sub_eok(s: str) -> int:
    """억 단위 아래 파싱: 천, 백, 순수 숫자"""
    if not s:
        return 0

    if "천" in s:
        m = re.search(r"(\d+)\s*천", s)
        cheon = (int(m.group(1)) if m else 0) * 1000
        after = re.sub(r"\d+\s*천", "", s)
        m2 = re.search(r"(\d+)\s*백", after)
        if m2:
            return cheon + int(m2.group(1)) * 100
        rest = re.sub(r"[^\d]", "", after)
        return cheon + (int(rest) if rest else 0)

    if "백" in s:
        m = re.search(r"(\d+)\s*백", s)
        baek = (int(m.group(1)) if m else 0) * 100
        after = re.sub(r"\d+\s*백", "", s)
        rest = re.sub(r"[^\d]", "", after)
        return baek + (int(rest) if rest else 0)

    digits = re.sub(r"[^\d]", "", s)
    return int(digits) if digits else 0


# ── 체크포인트 매니저 ──

class CheckpointManager:
    """크롤러 체크포인트 관리 — DB 기반 (crawl.mjs 포팅).

    JS 원본: .tmp 파일 + atomic rename
    Python 포팅: crawler_checkpoints 테이블에 state_json 저장
    """

    def __init__(self, checkpoint_interval: int = 5):
        self._interval = checkpoint_interval

    def should_save(self, processed_count: int) -> bool:
        """N건 처리마다 저장 여부 판단"""
        return processed_count > 0 and processed_count % self._interval == 0

    @staticmethod
    def save(db: Session, job_id: int, state: dict) -> None:
        """체크포인트 저장 (upsert)"""
        from db.models import CrawlerCheckpoint

        existing = db.get(CrawlerCheckpoint, job_id)
        if existing:
            existing.state_json = state
        else:
            db.add(CrawlerCheckpoint(job_id=job_id, state_json=state))
        db.commit()
        logger.debug("체크포인트 저장: job %d", job_id)

    @staticmethod
    def load(db: Session, job_id: int) -> dict | None:
        """체크포인트 로드"""
        from db.models import CrawlerCheckpoint

        cp = db.get(CrawlerCheckpoint, job_id)
        return cp.state_json if cp else None

    @staticmethod
    def delete(db: Session, job_id: int) -> None:
        """체크포인트 삭제 (완료 시)"""
        from db.models import CrawlerCheckpoint

        cp = db.get(CrawlerCheckpoint, job_id)
        if cp:
            db.delete(cp)
            db.commit()
