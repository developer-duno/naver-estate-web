"""어린이집 API — 보육정보공개시스템(CPMS) 어린이집 목록 + 근접 필터

API 문서: https://www.data.go.kr/data/15004400/openapi.do
시군구별 어린이집 목록을 조회하여 단지별 가장 가까운 어린이집을 매칭한다.
"""

import json
import logging
from pathlib import Path

from crawler.emergency_api import haversine
from crawler.public_data_base import BasePublicDataAPI

logger = logging.getLogger(__name__)

# 보육정보공개시스템 어린이집 조회 API
CHILDCARE_LIST_URL = "https://apis.data.go.kr/B553260/CpmsService/getCpmsInfo"


class ChildcareAPI(BasePublicDataAPI):
    """어린이집 API — data.go.kr CPMS"""

    _api_name = "childcare"

    @classmethod
    def get_childcare_list(cls, sigungu_code: str) -> list[dict]:
        """시군구 코드별 어린이집 목록 조회

        Args:
            sigungu_code: 행정표준코드 5자리 (예: "11680" = 서울 강남구)

        Returns:
            [{"name", "lat", "lng", "capacity", "current", "type_name"}, ...]
        """
        all_items: list[dict] = []
        page = 1
        while True:
            params = {
                "sigunguCode": sigungu_code,
                "numOfRows": "100",
                "pageNo": str(page),
            }

            data = cls.call_api(CHILDCARE_LIST_URL, params)
            if not data:
                break

            body = (data.get("response") or {}).get("body") or {}
            if not isinstance(body, dict):
                break
            items_wrapper = body.get("items") or {}
            if not isinstance(items_wrapper, dict):
                break
            items = items_wrapper.get("item", [])
            if isinstance(items, dict):
                items = [items]
            if not items:
                break

            for item in items:
                lat = _safe_float(item.get("la"))
                lng = _safe_float(item.get("lo"))
                if lat is None or lng is None:
                    continue
                all_items.append({
                    "name": item.get("crname", ""),
                    "lat": lat,
                    "lng": lng,
                    "capacity": int(item.get("crcapat", 0) or 0),
                    "current": int(item.get("crcnfnt", 0) or 0),
                    "type_name": item.get("crtypename", ""),
                })

            total = int(body.get("totalCount", 0))
            if len(all_items) >= total:
                break
            page += 1

        return all_items

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
            }

        matches.sort(key=lambda x: x["dist"])
        nearest = matches[0]
        return {
            "count": len(matches),
            "nearest_dist": round(nearest["dist"], 1),
            "nearest_name": nearest["name"],
            "nearest_capacity": nearest["capacity"],
        }


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
