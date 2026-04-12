"""어린이집 API — 보육정보공개포털(api.childcare.go.kr) 어린이집별 기본정보 조회

API: http://api.childcare.go.kr/mediate/rest/cpmsapi030/cpmsapi030/request
포털: https://info.childcare.go.kr
인증: CHILDCARE_DETAIL_API_KEY 환경변수 (포털 활용신청 후 발급, cpmsapi030 전용)

cpmsapi021은 좌표(la/lo) 미제공 → cpmsapi030으로 전환 (좌표+교직원+아동수 포함).
"""

import json
import logging
import os
import threading
import time
import xml.etree.ElementTree as ET
from pathlib import Path

import requests as std_requests

from crawler.emergency_api import haversine

logger = logging.getLogger(__name__)

# 보육정보공개포털 어린이집별 기본정보 조회 API (cpmsapi030, 좌표+상세 포함)
CHILDCARE_LIST_URL = (
    "http://api.childcare.go.kr/mediate/rest/cpmsapi030/cpmsapi030/request"
)

MAX_RETRIES = 3
RETRY_DELAYS = [2, 5, 10]
REQUEST_TIMEOUT = 30
MIN_REQUEST_INTERVAL = 0.3


class ChildcareAPI:
    """어린이집 API — api.childcare.go.kr (cpmsapi030)"""

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
    def _call_api(cls, params: dict) -> list[dict] | None:
        """API 호출 + XML 파싱 → [{tag: text}, ...]"""
        api_key = os.getenv("CHILDCARE_DETAIL_API_KEY") or os.getenv("CHILDCARE_API_KEY")
        if not api_key:
            logger.warning("[childcare] CHILDCARE_DETAIL_API_KEY 미설정 — 건너뜀")
            return None

        params = {**params, "key": api_key}
        headers = {"User-Agent": "Mozilla/5.0 NaverEstateWeb/1.0"}
        session = cls._get_session()

        for attempt in range(MAX_RETRIES):
            cls._throttle()
            try:
                resp = session.get(
                    CHILDCARE_LIST_URL,
                    params=params,
                    headers=headers,
                    timeout=REQUEST_TIMEOUT,
                )
                if resp.status_code == 200:
                    if "<errcode>" in resp.text:
                        logger.info(
                            "[childcare] API 에러 응답 (시도 %d/%d): %s",
                            attempt + 1,
                            MAX_RETRIES,
                            resp.text[:200],
                        )
                    else:
                        return cls._parse_xml(resp.text)
                if resp.status_code == 429:
                    delay = RETRY_DELAYS[min(attempt, len(RETRY_DELAYS) - 1)]
                    logger.info("[childcare] 429 — %d초 대기 후 재시도", delay)
                    time.sleep(delay)
                    continue
                logger.warning(
                    "[childcare] HTTP %d (시도 %d/%d)",
                    resp.status_code,
                    attempt + 1,
                    MAX_RETRIES,
                )
            except Exception as e:
                logger.warning(
                    "[childcare] 요청 실패: %s (시도 %d/%d)",
                    type(e).__name__,
                    attempt + 1,
                    MAX_RETRIES,
                )

            if attempt < MAX_RETRIES - 1:
                time.sleep(RETRY_DELAYS[min(attempt, len(RETRY_DELAYS) - 1)])

        return None

    @classmethod
    def _parse_xml(cls, xml_text: str) -> list[dict]:
        """XML 응답 → item 딕셔너리 리스트

        표준 공공데이터 XML 구조:
        <response><body><items><item><crname>...</crname>...</item></items></body></response>
        """
        try:
            root = ET.fromstring(xml_text)
        except ET.ParseError:
            logger.warning("[childcare] XML 파싱 실패")
            return []

        items = []
        for item_el in root.iter("item"):
            item: dict[str, str] = {}
            for child in item_el:
                item[child.tag] = (child.text or "").strip()
            if item:
                items.append(item)
        return items

    @classmethod
    def get_childcare_list(cls, sigungu_code: str) -> list[dict]:
        """시군구 코드별 어린이집 목록 조회 (cpmsapi030 — 좌표+상세 포함)

        Args:
            sigungu_code: 행정표준코드 5자리 (예: "11680" = 서울 강남구)

        Returns:
            [{"name", "lat", "lng", "capacity", "current", "type_name",
              "teachers", "status"}, ...]
        """
        params = {
            "arcode": sigungu_code,
            "stcode": "",
        }

        raw_items = cls._call_api(params)
        if not raw_items:
            return []

        result: list[dict] = []
        for item in raw_items:
            lat = _safe_float(item.get("la"))
            lng = _safe_float(item.get("lo"))
            if lat is None or lng is None:
                continue
            # 정상 운영 중인 시설만 포함
            status = item.get("crstatusname", "")
            if status and status not in ("정상", ""):
                continue
            result.append({
                "name": item.get("crname", ""),
                "lat": lat,
                "lng": lng,
                "capacity": int(item.get("crcapat", 0) or 0),
                "current": int(item.get("crchcnt", 0) or 0),
                "type_name": item.get("crtypename", ""),
                "teachers": int(item.get("EM_CNT_A2", 0) or 0),
                "status": status,
            })

        return result

    @classmethod
    def find_nearest(
        cls, lat: float, lng: float, facilities: list[dict], radius_m: float = 1000
    ) -> dict:
        """단지 좌표 기준 반경 내 어린이집 집계

        Returns:
            {"count": int, "nearest_dist": float|None,
             "nearest_name": str, "nearest_capacity": int}
        """
        matches = []
        for f in facilities:
            dist = haversine(lat, lng, f["lat"], f["lng"])
            if dist <= radius_m:
                matches.append({**f, "dist": dist})

        if not matches:
            return {
                "count": 0,
                "nearest_dist": None,
                "nearest_name": "",
                "nearest_capacity": 0,
                "nearest_type": "",
                "nearest_teachers": 0,
            }

        matches.sort(key=lambda x: x["dist"])
        nearest = matches[0]
        return {
            "count": len(matches),
            "nearest_dist": round(nearest["dist"], 1),
            "nearest_name": nearest["name"],
            "nearest_capacity": nearest["capacity"],
            "nearest_type": nearest.get("type_name", ""),
            "nearest_teachers": nearest.get("teachers", 0),
        }

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


def _safe_float(val) -> float | None:
    """안전한 float 변환"""
    if val is None or val == "" or val == "-":
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


# --- 행정표준코드 매핑 ---

_SIGUNGU_MAP: dict[str, dict[str, str]] | None = None


def _load_sigungu_map() -> dict[str, dict[str, str]]:
    """data/sigungu_codes.json 로드 (싱글턴)"""
    global _SIGUNGU_MAP  # noqa: PLW0603
    if _SIGUNGU_MAP is None:
        p = Path(__file__).resolve().parent.parent / "data" / "sigungu_codes.json"
        with open(p, encoding="utf-8") as f:
            _SIGUNGU_MAP = json.load(f)
    return _SIGUNGU_MAP


def resolve_sigungu_code(region: str, gu: str | None) -> str | None:
    """DB region(축약명) + gu → 행정표준코드 5자리 변환

    예: resolve_sigungu_code("서울", "강남구") → "11680"
        resolve_sigungu_code("경기", "수원시 영통구") → "41110" (상위 시 폴백)
    """
    if not gu:
        return None
    m = _load_sigungu_map().get(region)
    if not m:
        return None
    code = m.get(gu)
    if code:
        return code
    # "수원시 영통구" → "수원시" 폴백
    if " " in gu:
        return m.get(gu.split(" ")[0])
    return None
