"""공공데이터 API 공통 기반 클래스

data.go.kr 통합 키를 사용하는 모든 공공데이터 API의 공통 로직:
- 전역 일일 호출 카운터 (모든 API 합산 9,000회 제한)
- 요청 간 쓰로틀링 (0.3초)
- 429 재시도 (3회, 점진적 대기)
- requests 세션 관리
"""

import logging
import os
import threading
import time

import requests as std_requests

logger = logging.getLogger(__name__)

# ── 전역 일일 호출 한도 (모든 API 합산) ──
GLOBAL_DAILY_LIMIT = 9000
_global_lock = threading.Lock()
_global_daily_count = 0
_global_daily_date = ""

MAX_RETRIES = 3
RETRY_DELAYS = [2, 5, 10]
REQUEST_TIMEOUT = 15
MIN_REQUEST_INTERVAL = 0.3


def check_global_daily_limit() -> bool:
    """전역 일일 호출 한도 체크 — DB 기반 (모든 공공데이터 API 합산)"""
    global _global_daily_count, _global_daily_date
    from datetime import date

    from crawler.quota_db import increment_api_quota

    try:
        from db.database import SessionLocal
        result = increment_api_quota(SessionLocal, max_calls=GLOBAL_DAILY_LIMIT)
        # in-memory 카운터도 동기화 (로깅/모니터링용)
        today = date.today().isoformat()
        with _global_lock:
            if _global_daily_date != today:
                _global_daily_date = today
                _global_daily_count = 0
            _global_daily_count += 1
        return result
    except Exception:
        # DB 실패 시 기존 in-memory 폴백
        today = date.today().isoformat()
        with _global_lock:
            if _global_daily_date != today:
                _global_daily_date = today
                _global_daily_count = 0
            if _global_daily_count >= GLOBAL_DAILY_LIMIT:
                return False
            _global_daily_count += 1
            return True


# ── 버킷별 일일 한도 (별도 활용신청 API 전용) ──
# data.go.kr 의 실제 한도는 **활용신청(API)별**로 부여된다 — 전역 합산(GLOBAL_DAILY_LIMIT)
# 은 같은 신청 건을 나눠 쓰는 API 들에만 맞는 모델이다. 운영계정으로 별도 한도를 받은
# API(예: K-apt 목록·기본정보 일 10만)까지 9,000 한 바구니에 묶으면, 그 API 가 자기
# 한도의 10%도 못 쓰고 잘리는 데다 다른 수집기의 쿼터까지 잠식한다.
# → 자기 한도를 가진 API 는 서브클래스에서 _quota_name 을 선언해 독립 버킷을 쓴다.
_bucket_lock = threading.Lock()
# {bucket_name: [count, date_iso]} — DB 실패 시 in-memory 폴백 (전역 폴백 패턴 답습)
_bucket_daily: dict[str, list] = {}


def check_api_daily_limit(api_name: str, max_calls: int) -> bool:
    """버킷별 일일 호출 한도 체크 — DB 기반 (전역 버킷과 완전 분리).

    `quota_db.increment_api_quota` 의 api_name 파라미터로 `quota:{api_name}:{날짜}`
    키를 따로 쓴다. 전역 버킷(quota:data_go_kr:...) 카운트에는 영향을 주지 않는다.
    """
    from datetime import date

    from crawler.quota_db import increment_api_quota

    try:
        from db.database import SessionLocal
        result = increment_api_quota(SessionLocal, api_name=api_name, max_calls=max_calls)
        # in-memory 카운터도 동기화 (로깅/모니터링용)
        today = date.today().isoformat()
        with _bucket_lock:
            entry = _bucket_daily.get(api_name)
            if entry is None or entry[1] != today:
                entry = [0, today]
                _bucket_daily[api_name] = entry
            entry[0] += 1
        return result
    except Exception:
        # DB 실패 시 in-memory 폴백 (check_global_daily_limit 패턴 답습)
        today = date.today().isoformat()
        with _bucket_lock:
            entry = _bucket_daily.get(api_name)
            if entry is None or entry[1] != today:
                entry = [0, today]
                _bucket_daily[api_name] = entry
            if entry[0] >= max_calls:
                return False
            entry[0] += 1
            return True


def get_api_daily_count(api_name: str) -> int:
    """현재 버킷 일일 호출 수 조회 (로깅/모니터링용)"""
    with _bucket_lock:
        entry = _bucket_daily.get(api_name)
        return entry[0] if entry else 0


def get_global_daily_count() -> int:
    """현재 전역 일일 호출 수 조회 (로깅/모니터링용)"""
    return _global_daily_count


class BasePublicDataAPI:
    """공공데이터 API 공통 기반 — 서브클래스에서 _api_name 정의

    사용법:
        class AirQualityAPI(BasePublicDataAPI):
            _api_name = "air_quality"
    """

    _api_name = "base"
    # 독립 쿼터 버킷 이름. None 이면 기존 전역 버킷(quota:data_go_kr)을 그대로 쓴다 —
    # 기존 서브클래스(air_quality·emergency·childcare·crime_stats·applyhome…) 동작 무변경.
    # data.go.kr 한도는 활용신청별이므로, 자기 한도를 따로 받은 API 만 자기 버킷을 선언한다.
    _quota_name: str | None = None
    _quota_daily_limit: int = GLOBAL_DAILY_LIMIT
    _lock = threading.Lock()
    _last_request_time = 0.0
    _session: std_requests.Session | None = None

    @classmethod
    def _get_session(cls) -> std_requests.Session:
        with cls._lock:
            if cls._session is None:
                cls._session = std_requests.Session()
            return cls._session

    @classmethod
    def _throttle(cls):
        """요청 간 최소 간격 보장 (0.3초)"""
        with cls._lock:
            now = time.monotonic()
            elapsed = now - cls._last_request_time
            sleep_time = max(0, MIN_REQUEST_INTERVAL - elapsed)
            cls._last_request_time = now + sleep_time
        if sleep_time > 0:
            time.sleep(sleep_time)

    @classmethod
    def _get_service_key(cls) -> str | None:
        return os.getenv("PUBLIC_DATA_API_KEY")

    @classmethod
    def call_api(cls, url: str, params: dict) -> dict | None:
        """공통 API 호출 — throttle + 전역 limit + 429 재시도"""
        service_key = cls._get_service_key()
        if not service_key:
            logger.warning("[%s] PUBLIC_DATA_API_KEY 미설정 — 건너뜀", cls._api_name)
            return None

        # 독립 버킷 선언 시 그 버킷으로, 아니면 기존 전역 버킷으로 (기존 동작 보존)
        if cls._quota_name:
            if not check_api_daily_limit(cls._quota_name, cls._quota_daily_limit):
                logger.warning(
                    "[%s] '%s' 버킷 일일 호출 한도(%d) 도달",
                    cls._api_name, cls._quota_name, cls._quota_daily_limit,
                )
                return None
        elif not check_global_daily_limit():
            logger.warning(
                "[%s] 전역 버킷(data_go_kr) 일일 호출 한도(%d) 도달",
                cls._api_name, GLOBAL_DAILY_LIMIT,
            )
            return None

        params = {**params, "serviceKey": service_key, "_type": "json"}
        headers = {"User-Agent": "Mozilla/5.0 NaverEstateWeb/1.0"}
        session = cls._get_session()

        for attempt in range(MAX_RETRIES):
            cls._throttle()
            try:
                resp = session.get(url, params=params, headers=headers, timeout=REQUEST_TIMEOUT)
                if resp.status_code == 200:
                    return resp.json()
                if resp.status_code == 429:
                    delay = RETRY_DELAYS[min(attempt, len(RETRY_DELAYS) - 1)]
                    logger.info("[%s] 429 — %d초 대기 후 재시도", cls._api_name, delay)
                    time.sleep(delay)
                    continue
                logger.warning("[%s] HTTP %d (시도 %d/%d)", cls._api_name, resp.status_code, attempt + 1, MAX_RETRIES)
            except Exception as e:
                logger.warning("[%s] 요청 실패: %s (시도 %d/%d)", cls._api_name, type(e).__name__, attempt + 1, MAX_RETRIES)

            if attempt < MAX_RETRIES - 1:
                time.sleep(RETRY_DELAYS[min(attempt, len(RETRY_DELAYS) - 1)])

        return None

    @classmethod
    def reset(cls):
        """세션 초기화"""
        with cls._lock:
            if cls._session:
                try:
                    cls._session.close()
                except (OSError, RuntimeError):
                    pass
            cls._session = None
