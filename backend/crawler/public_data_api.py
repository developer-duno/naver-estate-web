"""공공데이터포털 아파트 매매 실거래가 API 클라이언트

국토교통부 아파트매매 실거래자료 API를 호출하여 실거래가 데이터를 수집한다.
IP 차단 우려 없이 안정적으로 시세 데이터를 보완할 수 있다.

API 문서: https://www.data.go.kr/data/15057511/openapi.do
"""

import logging
import os
import threading
import time

from curl_cffi import requests as cffi_requests

logger = logging.getLogger(__name__)

# 공공데이터 API 기본 설정
BASE_URL = "https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade"
MAX_RETRIES = 3
RETRY_DELAYS = [2, 5, 10]
REQUEST_TIMEOUT = 15
MIN_REQUEST_INTERVAL = 0.3  # 초당 ~3건 (공공데이터 API TPS 제한 대응)


def _normalize_apt_name(name: str) -> str:
    """아파트명 정규화 — 공백/괄호/특수문자 제거 후 비교용 문자열 반환"""
    if not name:
        return ""
    import re
    # 괄호와 내용 제거: "현대아파트(1차)" → "현대아파트1차"
    normalized = re.sub(r"[(\[（]", "", name)
    normalized = re.sub(r"[)\]）]", "", normalized)
    # 공백, 하이픈, 점 제거
    normalized = re.sub(r"[\s\-·.]", "", normalized)
    # 소문자 통일 (영문 포함 단지명)
    normalized = normalized.lower()
    return normalized


class PublicDataAPI:
    """국토교통부 아파트매매 실거래자료 API

    - curl_cffi 사용 (impersonate 없이, 일반 HTTP 클라이언트로)
    - _type=json으로 JSON 응답 (XXE 방지)
    - 재시도 + 쓰로틀링 내장
    """

    _lock = threading.Lock()
    _last_request_time = 0.0
    _session: cffi_requests.Session | None = None
    _daily_call_count = 0
    _daily_call_date = ""

    @classmethod
    def _get_session(cls) -> cffi_requests.Session:
        with cls._lock:
            if cls._session is None:
                cls._session = cffi_requests.Session()
            return cls._session

    @classmethod
    def _throttle(cls):
        """요청 간 최소 간격 보장"""
        with cls._lock:
            now = time.monotonic()
            elapsed = now - cls._last_request_time
            sleep_time = max(0, MIN_REQUEST_INTERVAL - elapsed)
            cls._last_request_time = now + sleep_time
        if sleep_time > 0:
            time.sleep(sleep_time)

    @classmethod
    def _check_daily_limit(cls, max_calls: int = 9000) -> bool:
        """일일 호출 한도 체크 — DB 기반 (일일 10,000회, 안전 마진 10% 포함)"""
        from datetime import date

        from crawler.quota_db import increment_api_quota

        try:
            from db.database import SessionLocal
            result = increment_api_quota(SessionLocal, max_calls=max_calls)
            # in-memory 카운터도 동기화
            today = date.today().isoformat()
            with cls._lock:
                if cls._daily_call_date != today:
                    cls._daily_call_date = today
                    cls._daily_call_count = 0
                cls._daily_call_count += 1
            return result
        except Exception:
            # DB 실패 시 기존 in-memory 폴백
            today = date.today().isoformat()
            with cls._lock:
                if cls._daily_call_date != today:
                    cls._daily_call_date = today
                    cls._daily_call_count = 0
                if cls._daily_call_count >= max_calls:
                    return False
                cls._daily_call_count += 1
                return True

    @classmethod
    def _get_service_key(cls) -> str | None:
        return os.getenv("PUBLIC_DATA_API_KEY")

    @classmethod
    def get_apt_trades(
        cls,
        lawd_cd: str,
        deal_ymd: str,
        num_of_rows: int = 1000,
        page_no: int = 1,
    ) -> dict | None:
        """아파트 매매 실거래가 단일 페이지 조회

        Args:
            lawd_cd: 법정동코드 앞 5자리 (시군구코드)
            deal_ymd: 거래년월 (YYYYMM)
            num_of_rows: 페이지당 건수 (최대 1000)
            page_no: 페이지 번호

        Returns:
            JSON 응답 dict 또는 None (실패 시)
        """
        service_key = cls._get_service_key()
        if not service_key:
            logger.warning("PUBLIC_DATA_API_KEY 미설정 — 공공데이터 수집 건너뜀")
            return None

        if not cls._check_daily_limit():
            logger.warning("공공데이터 API 일일 호출 한도 도달 — 수집 중단")
            return None

        params = {
            "serviceKey": service_key,
            "LAWD_CD": lawd_cd,
            "DEAL_YMD": deal_ymd,
            "numOfRows": str(num_of_rows),
            "pageNo": str(page_no),
            "_type": "json",
        }
        headers = {
            "User-Agent": "Mozilla/5.0 NaverEstateWeb/1.0",
        }

        session = cls._get_session()

        for attempt in range(MAX_RETRIES):
            cls._throttle()
            try:
                response = session.get(
                    BASE_URL,
                    params=params,
                    headers=headers,
                    timeout=REQUEST_TIMEOUT,
                )

                if response.status_code == 200:
                    data = response.json()
                    # 공공데이터 API 에러 응답 체크
                    header = (data.get("response") or {}).get("header") or {}
                    result_code = str(header.get("resultCode", "")).lstrip("0") or "0"
                    if result_code != "0":
                        result_msg = header.get("resultMsg", "알 수 없는 오류")
                        logger.warning(
                            "공공데이터 API 오류: %s (%s) — LAWD=%s, YMD=%s",
                            result_code, result_msg, lawd_cd, deal_ymd,
                        )
                        return None
                    return data

                if response.status_code == 429:
                    delay = RETRY_DELAYS[min(attempt, len(RETRY_DELAYS) - 1)]
                    logger.info("공공데이터 API 429 — %d초 대기 후 재시도", delay)
                    time.sleep(delay)
                    continue

                logger.warning(
                    "공공데이터 API HTTP %d — LAWD=%s, YMD=%s (시도 %d/%d)",
                    response.status_code, lawd_cd, deal_ymd, attempt + 1, MAX_RETRIES,
                )

            except Exception as e:
                logger.warning(
                    "공공데이터 API 요청 실패: %s — LAWD=%s, YMD=%s (시도 %d/%d)",
                    type(e).__name__, lawd_cd, deal_ymd, attempt + 1, MAX_RETRIES,
                )

            if attempt < MAX_RETRIES - 1:
                time.sleep(RETRY_DELAYS[min(attempt, len(RETRY_DELAYS) - 1)])

        return None

    # 세션 359: 같은 (시군구, 월) 조합을 여러 단지가 반복 호출하는 낭비 발견
    # (backfill_price_batch 가 세대수 상위 단지 순회 시, 같은 구의 단지 N개가
    # 정확히 같은 API 응답을 매번 새로 받아옴 — data.go.kr 하루 10,000회 쿼터
    # 중 실제로는 4.8%만 쓰면서도 이 낭비 때문에 배치를 못 키우고 있었다).
    # 프로세스 내 메모리 캐시 — TTL 없음(과거 월 실거래는 사후 변경 없음, 당월만
    # 예외적으로 갱신될 수 있으나 이 캐시는 한 배치 실행(1회 프로세스) 동안만
    # 유효해 재시작 때마다 자연 초기화됨).
    _trade_cache: dict[tuple[str, str], list[dict]] = {}
    _trade_cache_lock = threading.Lock()

    @classmethod
    def get_all_apt_trades(cls, lawd_cd: str, deal_ymd: str) -> list[dict]:
        """아파트 매매 실거래가 전체 페이지 조회 (페이징 자동 처리, 캐싱).

        같은 (lawd_cd, deal_ymd) 조합은 프로세스 생존 동안 1회만 API 호출 —
        같은 시군구의 여러 단지가 소급 수집될 때 중복 호출을 없앤다.

        Returns:
            거래 건별 dict 리스트
        """
        cache_key = (lawd_cd, deal_ymd)
        with cls._trade_cache_lock:
            cached = cls._trade_cache.get(cache_key)
        if cached is not None:
            return cached

        all_items: list[dict] = []
        page_no = 1

        while True:
            data = cls.get_apt_trades(lawd_cd, deal_ymd, num_of_rows=1000, page_no=page_no)
            if not data:
                break

            body = (data.get("response") or {}).get("body") or {}
            total_count = int(body.get("totalCount", 0))
            items_wrapper = body.get("items") or {}

            # items가 없거나 빈 경우
            item_list = items_wrapper.get("item") or []
            if isinstance(item_list, dict):
                item_list = [item_list]  # 단일 건이면 dict → list

            all_items.extend(item_list)

            # 전체 수집 완료 체크
            if len(all_items) >= total_count or not item_list:
                break
            page_no += 1

        with cls._trade_cache_lock:
            cls._trade_cache[cache_key] = all_items
        return all_items

    @classmethod
    def reset(cls):
        """세션 초기화 (거래 캐시도 함께 초기화 — 테스트 간 오염 방지)"""
        with cls._lock:
            if cls._session:
                try:
                    cls._session.close()
                except (OSError, RuntimeError):
                    pass
            cls._session = None
            cls._daily_call_count = 0
        with cls._trade_cache_lock:
            cls._trade_cache.clear()
