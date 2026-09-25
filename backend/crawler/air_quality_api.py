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


# 에어코리아 `getNearbyMsrstnList` 가 요구하는 좌표계 = **EPSG:5181**(TM 중부원점, y_0=500,000)
#   +proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=500000 +ellps=GRS80
#
# ⚠️ 공식 문서(data.go.kr 15073877)는 "TM 좌표" 라고만 적고 **원점을 명시하지 않는다.**
#    2026-09-22 에 서울시청(37.5666,126.9784)으로 후보 5종을 실측해 확정했다:
#
#        y_0=500,000 (5181) → "중구" 0.5km    ✅ 정답
#        y_0=600,000 (5186) → "철원(DMZ)" 26.2km
#        y_0=0       (옛 코드) → "남원읍" 35.2km  (제주!)
#        서부 5185          → "금호동" 46.6km
#        동부 5187          → "백령도" 64.9km
#
#    즉 y_0 가 100,000 만 달라도 26km 엉뚱한 곳이 나온다. **바꾸기 전에 반드시 위 실측을 다시 하라.**
TM_ORIGIN_LAT = 38.0
TM_ORIGIN_LNG = 127.0
TM_FALSE_EASTING = 200000.0
TM_FALSE_NORTHING = 500000.0


def wgs84_to_tm(lat: float, lng: float) -> tuple[float, float]:
    """WGS84 → 한국 TM 중부원점(**EPSG:5181**) 변환. 에어코리아 API 전용.

    ## ⚠️ 2026-09-22 정정 — 옛 구현은 결함이 **둘**이었다

    옛 구현은 Bessel 타원체 기반 간이식이었고 주석은 "정밀도 ~10m" 라고 적었지만 실제로는:

    1. **`tm_y` 에 false northing 이 통째로 빠져** 한국 전역이 **음수**로 나왔다
       (실측: 서울시청 tmY=-48,300 · 수원 -82,067 · 제주 -525,896).
       그 좌표로 부르면 **제주 "남원읍"(35km)** 이 돌아온다 — 서울시청인데.
    2. false northing 을 더해도 **Bessel 타원체·1차 근사**라 Y 오차가 컸다
       — 서울 -196m · 수원 -334m · **부산 -3,271m**. 관측소 선택이 바뀌는 크기다.

    ⚠️ **피해 규모 정정(2026-09-22 같은 날 재측정).** 처음엔 "전국 3,068단지에 8종류만
    붙었다(제주 남원읍 한 곳에 2,007곳)" 고 적었는데 **그 측정이 틀렸다.** 전수 재측정 =
    `infra.air_station_name` **392종 · 3,068행 전부 채움 · 거리 중앙값 1,585m** 로 정상이었다
    (서울 강남구→"강남대로" 1,957m · 부산 해운대구→"좌동" 1,232m · 제주 제주시→"연동" 1,064m).

    오측 원인: `infra.updated_at` 을 대기질 수집 시각으로 읽었다. 그 표는 **두 레포가 컬럼을
    나눠 쓰는 공동 소유**라 그 컬럼은 mibunyang 의 kakao 수집기가 찍는다 — 대기질의 시각은
    `air_updated_at`·`air_attempted_at` 이다. 실제 수집은 **하루 100단지 순환**(단지당 API
    1콜이라 쿼터 보호, 전 단지 한 바퀴 ≈ 30일)으로 정상 작동 중이었다.

    그러므로 **이 함수의 수정 근거는 "현재 피해" 가 아니라 "공식이 틀렸다는 것 자체"** 다 —
    옛 구현에 false northing 이 없는 것은 코드로 확인되는 사실이고, 그 좌표를 쓰면 엉뚱한
    관측소가 나온다(아래 원점 실측표). 회귀 가드는 `tests/test_air_quality_tm.py`.

    `air_quality_stations` 캐시 표가 오래 **8행(제주·거제·가거도 계열)** 에 머문 것도 같은
    뿌리였다 — 전국이 제주 관측소로 몰리니 `_upsert_station` 이 그 이름들만 받았다. 이 수정
    (PR #556, 2026-09-22 적용) 뒤로는 매일 100단지 순환이 닿는 관측소가 그대로 쌓인다
    (세션 418 실측 2026-09-25: 177행 — 09-22 47·09-23 50·09-24 73. `infra.air_station_name`
    394종 중 220종이 아직 없고, 한 바퀴 ≈30일이라 10월 하순쯤 수렴). `lat`/`lng` 칸은
    `_upsert_station` 이 쓰지 않고 읽는 코드도 양쪽 레포에 0건이라 **전부 NULL 인 것이 정상**
    (무해한 빈 칸 — 세는 명령: `SELECT count(*), count(lat) FROM air_quality_stations`).

    ## 지금 구현

    EPSG:5181 사양 그대로의 Transverse Mercator 전개식(원점은 위 상수 주석의 실측 근거 참조):

        +proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=500000 +ellps=GRS80

    검증(2026-09-22 라이브): 서울시청 → **"중구" 0.5km** · 수원시청 → 수원 관측소 · 부산시청 → 부산 관측소.
    전개식 자체는 정확한 TM 공식과 X·Y 오차 **0m**(Bessel 근사를 GRS80 정식으로 교체).
    """
    lat_rad = math.radians(lat)
    lng_rad = math.radians(lng)
    lat0 = math.radians(TM_ORIGIN_LAT)
    lon0 = math.radians(TM_ORIGIN_LNG)

    # GRS80 타원체 (EPSG:5186)
    a = 6378137.0
    f = 1 / 298.257222101
    e2 = f * (2 - f)
    ep2 = e2 / (1 - e2)

    n = a / math.sqrt(1 - e2 * math.sin(lat_rad) ** 2)
    t = math.tan(lat_rad) ** 2
    c = ep2 * math.cos(lat_rad) ** 2
    A = (lng_rad - lon0) * math.cos(lat_rad)

    e4 = e2 * e2
    e6 = e4 * e2

    def meridian_arc(phi: float) -> float:
        """적도에서 위도 phi 까지의 자오선 호장."""
        return a * (
            (1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * phi
            - (3 * e2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * math.sin(2 * phi)
            + (15 * e4 / 256 + 45 * e6 / 1024) * math.sin(4 * phi)
            - (35 * e6 / 3072) * math.sin(6 * phi)
        )

    tm_x = TM_FALSE_EASTING + n * (
        A + (1 - t + c) * A**3 / 6 + (5 - 18 * t + t * t + 72 * c - 58 * ep2) * A**5 / 120
    )
    tm_y = TM_FALSE_NORTHING + (
        meridian_arc(lat_rad)
        - meridian_arc(lat0)
        + n
        * math.tan(lat_rad)
        * (
            A * A / 2
            + (5 - t + 9 * c + 4 * c * c) * A**4 / 24
            + (61 - 58 * t + t * t + 600 * c - 330 * ep2) * A**6 / 720
        )
    )

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
