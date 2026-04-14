"""어린이집 API — 보육정보공개포털 cpmsapi030

세션 40에서 재작성. 실측 발견:
- cpmsapi030은 `arcode`만 보내면 해당 시군구 전체 어린이집 목록+좌표+상세를
  한 번에 반환한다 (서비스명은 "어린이집별"이지만 실제로는 목록 API로도 동작).
- 세션 38~39의 4개월 silent failure 원인은 params에 `"stcode": ""` 빈 문자열을
  넣어 보낸 것 단 하나 — stcode 키 자체를 제거하면 정상.
- 응답 태그는 혼재: 소문자(la/lo/crname/crtypename/crstatusname)와 대문자
  (EM_CNT_A2, CHILD_CNT_TOT 등). 파싱 시 양쪽 모두 체크.

인증: CHILDCARE_DETAIL_API_KEY (info.childcare.go.kr cpmsapi030 운영키)
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

CHILDCARE_LIST_URL = (
    "http://api.childcare.go.kr/mediate/rest/cpmsapi030/cpmsapi030/request"
)

MAX_RETRIES = 3
RETRY_DELAYS = [2, 5, 10]
REQUEST_TIMEOUT = 30
MIN_REQUEST_INTERVAL = 0.3

# 쿼터/만료/인증키 계열 errcode — 상위로 전파해 배치 중단 유도
_FATAL_ERRCODES = ("INFO-300", "INFO-400", "INFO-100")


class ChildcareAPIError(RuntimeError):
    """CPMS API 치명적 에러 (쿼터 초과/만료/유효하지 않은 키)"""


class ChildcareAPI:
    """어린이집 API — cpmsapi030 (시군구 단위 목록 조회)"""

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
    def _call_api(cls, params: dict) -> list[dict]:
        """API 호출 + XML 파싱 → [{tag: text}, ...]

        200+<errcode> 처리:
          - INFO-200 (검색결과 없음) → 빈 리스트 반환 (재시도 없음)
          - INFO-300/400/100 (쿼터/만료/인증키) → ChildcareAPIError 예외
          - 기타 → 빈 리스트 (로깅만)
        HTTP 429 / 네트워크 에러 → RETRY_DELAYS로 재시도
        """
        api_key = os.getenv("CHILDCARE_DETAIL_API_KEY") or os.getenv("CHILDCARE_API_KEY")
        if not api_key:
            logger.warning("[childcare] CHILDCARE_DETAIL_API_KEY 미설정 — 건너뜀")
            return []

        # CPMS API는 쿼리 파라미터 순서에 민감 — key를 반드시 먼저 보내야 함
        # (arcode 먼저 + key 나중이면 ERROR-100 "필수값 누락" 반환)
        params = {"key": api_key, **params}
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
                    errcode = _extract_errcode(resp.text)
                    if errcode:
                        if errcode in _FATAL_ERRCODES:
                            raise ChildcareAPIError(
                                f"CPMS API {errcode}: {resp.text[:200]}"
                            )
                        logger.info(
                            "[childcare] empty response: %s", errcode
                        )
                        return []
                    return cls._parse_xml(resp.text)
                if resp.status_code == 429:
                    delay = RETRY_DELAYS[min(attempt, len(RETRY_DELAYS) - 1)]
                    logger.info("[childcare] 429 — %d초 대기 후 재시도", delay)
                    time.sleep(delay)
                    continue
                logger.warning(
                    "[childcare] HTTP %d (시도 %d/%d)",
                    resp.status_code, attempt + 1, MAX_RETRIES,
                )
            except ChildcareAPIError:
                raise
            except Exception as e:
                logger.warning(
                    "[childcare] 요청 실패: %s (시도 %d/%d)",
                    type(e).__name__, attempt + 1, MAX_RETRIES,
                )

            if attempt < MAX_RETRIES - 1:
                time.sleep(RETRY_DELAYS[min(attempt, len(RETRY_DELAYS) - 1)])

        return []

    @classmethod
    def _parse_xml(cls, xml_text: str) -> list[dict]:
        """XML 응답 → item 딕셔너리 리스트"""
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
        """시군구별 어린이집 목록 조회 — cpmsapi030 (좌표+상세 포함)

        **중요**: params에 `stcode` 키를 넣으면 안 됨(빈 문자열이어도 ERROR-100).
        arcode만 보내면 해당 시군구 전체가 반환된다.

        Args:
            sigungu_code: 행정표준코드 5자리 (예: "11680" = 서울 강남구)

        Returns:
            [{"name", "lat", "lng", "capacity", "current", "type_name",
              "teachers", "status"}, ...]
        """
        raw_items = cls._call_api({"arcode": sigungu_code})
        if not raw_items:
            return []

        result: list[dict] = []
        for item in raw_items:
            lat = _safe_float(item.get("la"))
            lng = _safe_float(item.get("lo"))
            if lat is None or lng is None:
                continue
            status = item.get("crstatusname", "")
            if status and status != "정상":
                continue
            result.append({
                "name": item.get("crname", ""),
                "lat": lat,
                "lng": lng,
                "capacity": _safe_int(item.get("crcapat")),
                "current": _safe_int(item.get("crchcnt")),
                "type_name": item.get("crtypename", ""),
                # 응답이 소문자/대문자 혼재 — 양쪽 모두 체크
                "teachers": _safe_int(
                    item.get("em_cnt_a2") or item.get("EM_CNT_A2")
                ),
                "status": status,
            })
        return result

    @classmethod
    def find_nearest(
        cls, lat: float, lng: float, facilities: list[dict], radius_m: float = 1000
    ) -> dict:
        """단지 좌표 기준 반경 내 어린이집 집계"""
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
            "nearest_capacity": nearest.get("capacity", 0),
            "nearest_type": nearest.get("type_name", ""),
            "nearest_teachers": nearest.get("teachers", 0),
        }

    @classmethod
    def reset(cls):
        with cls._lock:
            if cls._session:
                try:
                    cls._session.close()
                except (OSError, RuntimeError):
                    pass
            cls._session = None


def _extract_errcode(xml_text: str) -> str | None:
    """XML 응답에서 <errcode>XXX</errcode> 추출"""
    start = xml_text.find("<errcode>")
    if start == -1:
        return None
    end = xml_text.find("</errcode>", start)
    if end == -1:
        return None
    return xml_text[start + len("<errcode>"):end].strip()


def _safe_float(val) -> float | None:
    if val is None or val == "" or val == "-":
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def _safe_int(val) -> int:
    if val is None or val == "" or val == "-":
        return 0
    try:
        return int(float(val))
    except (ValueError, TypeError):
        return 0


# --- 행정표준코드 매핑 ---

_SIGUNGU_MAP: dict[str, dict[str, str]] | None = None


def _load_sigungu_map() -> dict[str, dict[str, str]]:
    global _SIGUNGU_MAP  # noqa: PLW0603
    if _SIGUNGU_MAP is None:
        p = Path(__file__).resolve().parent.parent / "data" / "sigungu_codes.json"
        with open(p, encoding="utf-8") as f:
            _SIGUNGU_MAP = json.load(f)
    return _SIGUNGU_MAP


def resolve_sigungu_code(region: str, gu: str | None) -> str | None:
    """DB region(축약명) + gu → 행정표준코드 5자리 변환

    예: resolve_sigungu_code("서울", "강남구") → "11680"
    """
    if not gu:
        return None
    m = _load_sigungu_map().get(region)
    if not m:
        return None
    code = m.get(gu)
    if code:
        return code
    if " " in gu:
        return m.get(gu.split(" ")[0])
    return None
