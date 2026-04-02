"""응급의료기관 API — 중앙응급의료센터(NEMC) 기관 목록 + 근접 필터

API 문서: https://www.data.go.kr/data/15000563/openapi.do
전국 응급의료기관(~400건)을 조회하여 단지별 가장 가까운 기관을 매칭한다.
"""

import logging
import math

from crawler.public_data_base import BasePublicDataAPI

logger = logging.getLogger(__name__)

# 응급의료기관 정보 조회 API
EMERGENCY_LIST_URL = "https://apis.data.go.kr/B552657/ErmctInfoInqireService/getEgytListInfoInqire"

# 기관 분류 코드 → 등급명
DUTY_LEVEL_MAP = {
    "1": "권역응급의료센터",
    "2": "지역응급의료센터",
    "3": "지역응급의료기관",
}


def haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """두 WGS84 좌표 간 거리 (미터)"""
    R = 6371000  # 지구 반지름(m)
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


class EmergencyAPI(BasePublicDataAPI):
    """응급의료기관 API"""

    _api_name = "emergency"

    @classmethod
    def get_emergency_list(cls, stage1: str = "", stage2: str = "") -> list[dict]:
        """응급의료기관 목록 조회

        Args:
            stage1: 시도명 (예: "서울특별시", 빈 문자열이면 전국)
            stage2: 시군구명 (예: "강남구")

        Returns:
            [{"name", "lat", "lng", "beds", "level", "addr"}, ...]
        """
        all_items: list[dict] = []
        page = 1
        while True:
            params = {"numOfRows": "100", "pageNo": str(page)}
            if stage1:
                params["Q0"] = stage1
            if stage2:
                params["Q1"] = stage2

            data = cls.call_api(EMERGENCY_LIST_URL, params)
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
                lat = _safe_float(item.get("wgs84Lat"))
                lng = _safe_float(item.get("wgs84Lon"))
                if lat is None or lng is None:
                    continue
                all_items.append({
                    "name": item.get("dutyName", ""),
                    "lat": lat,
                    "lng": lng,
                    "beds": int(item.get("hvec", 0) or 0),
                    "level": DUTY_LEVEL_MAP.get(str(item.get("dutyLevel", "")), ""),
                    "addr": item.get("dutyAddr", ""),
                })

            total = int(body.get("totalCount", 0))
            if len(all_items) >= total:
                break
            page += 1

        return all_items

    @classmethod
    def find_nearest(
        cls, lat: float, lng: float, facilities: list[dict], radius_m: float = 3000
    ) -> dict:
        """단지 좌표 기준 반경 내 응급의료기관 집계

        Returns:
            {"count": int, "nearest_dist": float|None, "nearest_beds": int, "nearest_level": str}
        """
        matches = []
        for f in facilities:
            dist = haversine(lat, lng, f["lat"], f["lng"])
            if dist <= radius_m:
                matches.append({**f, "dist": dist})

        if not matches:
            return {"count": 0, "nearest_dist": None, "nearest_beds": 0, "nearest_level": ""}

        matches.sort(key=lambda x: x["dist"])
        nearest = matches[0]
        return {
            "count": len(matches),
            "nearest_dist": round(nearest["dist"], 1),
            "nearest_beds": nearest["beds"],
            "nearest_level": nearest["level"],
        }


def _safe_float(val) -> float | None:
    """안전한 float 변환"""
    if val is None or val == "" or val == "-":
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None
