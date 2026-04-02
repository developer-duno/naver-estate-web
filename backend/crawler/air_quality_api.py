"""에어코리아 대기질 API — 근접 측정소 조회 + 실시간 대기오염 측정

API 문서:
- 근접측정소 목록: https://www.data.go.kr/data/15073877/openapi.do
- 실시간 측정정보: https://www.data.go.kr/data/15073861/openapi.do

주의: getNearbyMsrstnList는 TM 좌표(중부원점)를 요구한다.
WGS84(lat/lng) → TM 변환 근사 공식을 사용한다.
"""

import logging
import math

from crawler.public_data_base import BasePublicDataAPI

logger = logging.getLogger(__name__)

# 에어코리아 API 엔드포인트
NEARBY_STATION_URL = "https://apis.data.go.kr/B552584/MsrstnInfoInqireSvc/getNearbyMsrstnList"
REALTIME_AIR_URL = "https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty"


def wgs84_to_tm(lat: float, lng: float) -> tuple[float, float]:
    """WGS84 → TM(중부원점) 근사 변환

    Bessel 타원체 기반 간이 변환. 정밀도 ~10m 수준으로
    근접 측정소 매칭에는 충분하다.
    """
    # 중부원점 기준 (origin: 38N, 127E, false easting 200000)
    lat_rad = math.radians(lat)
    lng_rad = math.radians(lng)
    ref_lat = math.radians(38.0)
    ref_lng = math.radians(127.0)

    # 간이 변환 계수 (미터 단위)
    a = 6377397.155  # Bessel 장반경
    e2 = 0.006674372  # 이심률 제곱
    n = a / math.sqrt(1 - e2 * math.sin(lat_rad) ** 2)

    tm_x = 200000 + n * math.cos(lat_rad) * (lng_rad - ref_lng)
    tm_y = n * (lat_rad - ref_lat)

    return tm_x, tm_y


class AirQualityAPI(BasePublicDataAPI):
    """에어코리아 대기질 API"""

    _api_name = "air_quality"

    @classmethod
    def get_nearby_station(cls, lat: float, lng: float) -> dict | None:
        """WGS84 좌표 → 가장 가까운 측정소 정보 반환

        Returns:
            {"station_name": str, "addr": str, "tm": float} 또는 None
        """
        tm_x, tm_y = wgs84_to_tm(lat, lng)
        data = cls.call_api(NEARBY_STATION_URL, {
            "tmX": str(tm_x),
            "tmY": str(tm_y),
            "returnType": "json",
            "numOfRows": "1",
            "pageNo": "1",
            "ver": "1.1",
        })
        if not data:
            return None

        items = (data.get("response") or {}).get("body", {}).get("items", [])
        if not items:
            return None
        item = items[0] if isinstance(items, list) else items
        return {
            "station_name": item.get("stationName", ""),
            "addr": item.get("addr", ""),
            "tm": float(item.get("tm", 0)),
        }

    @classmethod
    def get_realtime_air(cls, station_name: str) -> dict | None:
        """측정소명 → 실시간 대기오염 수치 반환

        Returns:
            {"pm10": float, "pm25": float, "o3": float, "grade": str} 또는 None
        """
        data = cls.call_api(REALTIME_AIR_URL, {
            "stationName": station_name,
            "dataTerm": "DAILY",
            "returnType": "json",
            "numOfRows": "1",
            "pageNo": "1",
            "ver": "1.3",
        })
        if not data:
            return None

        items = (data.get("response") or {}).get("body", {}).get("items", [])
        if not items:
            return None
        item = items[0] if isinstance(items, list) else items

        # 등급 변환 (1=좋음, 2=보통, 3=나쁨, 4=매우나쁨)
        grade_map = {"1": "좋음", "2": "보통", "3": "나쁨", "4": "매우나쁨"}
        khaiGrade = str(item.get("khaiGrade", ""))

        return {
            "pm10": _safe_float(item.get("pm10Value")),
            "pm25": _safe_float(item.get("pm25Value")),
            "o3": _safe_float(item.get("o3Value")),
            "grade": grade_map.get(khaiGrade, ""),
        }


def _safe_float(val) -> float | None:
    """측정값을 float로 변환 — '-' 또는 비정상 값은 None"""
    if val is None or val == "-" or val == "":
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None
