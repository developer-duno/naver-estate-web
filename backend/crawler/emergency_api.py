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
# 응급실 실시간 가용병상 API — 병상 수는 이 op 에서만 전국 1콜로 받을 수 있다
EMERGENCY_BEDS_URL = (
    "https://apis.data.go.kr/B552657/ErmctInfoInqireService/getEmrrmRltmUsefulSckbdInfoInqire"
)

# ⚠ 필드 근거 (세션 417 실응답 확인 — 2026-09-24, 원문은 PR 본문)
# - 목록 op(getEgytListInfoInqire) 응답 항목은 11개뿐이다:
#   dutyAddr·dutyEmcls·dutyEmclsName·dutyName·dutyTel1·dutyTel3·hpid·phpid·rnum·wgs84Lat·wgs84Lon.
#   옛 코드가 읽던 `hvec`(병상)·`dutyLevel`(등급)은 **이 op 에 없다** → 병상은 늘 0,
#   등급은 늘 빈값으로 저장됐다(운영 DB 2,938행 전부 emergency_beds=0).
# - 등급 = 목록의 `dutyEmclsName`(예: "지역응급의료기관", "응급실운영신고기관").
# - 병상 = 실시간 op 의 `hvs01`(응급실 **일반** 병상 기준값 — 고정 수용량).
#   같은 op 의 `hvec` 는 "지금 남은 병상"(음수도 옴)이라 월 1회 스냅샷에 안 맞아 쓰지 않는다.
#   hvs01 은 기관 기본정보의 `hperyn`(응급실 병상 전체)보다 작을 수 있다
#   (울산대병원 실측: hperyn 31 · hvs01 21) → 화면 라벨은 "응급실 일반병상".
#   실시간 op 에는 전국 528기관 중 416기관만 있다 → 나머지는 None(모름, 화면 "-").
_BEDS_NUM_OF_ROWS = "1000"  # 전국 416기관이 1페이지에 다 온다(실측) — 회차당 1콜


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
            beds·level 은 모르면 None (0·빈값으로 채우지 않는다 — 화면이 "0" 과 "모름"을 구분).
        """
        all_items: list[dict] = []
        # 병상 맵은 목록과 별개 op 라 실패해도 목록 수집은 계속한다(병상만 None).
        bed_map = cls.get_er_bed_map()
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
                parsed = _parse_list_item(item, bed_map)
                if parsed is not None:
                    all_items.append(parsed)

            total = int(body.get("totalCount", 0))
            if len(all_items) >= total:
                break
            page += 1

        return all_items

    @classmethod
    def get_er_bed_map(cls) -> dict[str, int | None]:
        """기관 ID(hpid) → 응급실 일반병상 수(hvs01). 전국 1콜.

        실패·빈 응답이면 빈 dict(= 모든 기관 병상 None). 병상은 부가 정보라 이 실패로
        수집 잡 전체를 실패시키지 않는다 — 대신 경고 로그를 남긴다.
        """
        data = cls.call_api(EMERGENCY_BEDS_URL, {"numOfRows": _BEDS_NUM_OF_ROWS, "pageNo": "1"})
        body = ((data or {}).get("response") or {}).get("body") or {}
        items_wrapper = body.get("items") if isinstance(body, dict) else None
        items = items_wrapper.get("item", []) if isinstance(items_wrapper, dict) else []
        if isinstance(items, dict):
            items = [items]
        bed_map = _parse_bed_items(items)
        if not bed_map:
            logger.warning("[emergency] 응급실 병상 조회 실패 또는 빈 응답 — 병상은 모두 '모름'으로 저장")
        total_count = _safe_nonneg_int(body.get("totalCount")) if isinstance(body, dict) else None
        num_of_rows = int(_BEDS_NUM_OF_ROWS)
        if total_count is not None and total_count > num_of_rows:
            logger.warning(
                "[emergency] 실시간 병상 응답이 한 페이지를 넘음 — totalCount=%s > numOfRows=%s, 뒷 페이지 누락",
                total_count,
                num_of_rows,
            )
        return bed_map

    @classmethod
    def find_nearest(
        cls, lat: float, lng: float, facilities: list[dict], radius_m: float = 3000
    ) -> dict:
        """단지 좌표 기준 반경 내 응급의료기관 집계

        Returns:
            {"count": int, "nearest_dist": float|None,
             "nearest_beds": int|None, "nearest_level": str|None}
        """
        matches = []
        for f in facilities:
            dist = haversine(lat, lng, f["lat"], f["lng"])
            if dist <= radius_m:
                matches.append({**f, "dist": dist})

        if not matches:
            # 반경 안에 기관이 없으면 병상·등급은 "해당 없음" — 0·빈값이 아니라 None
            return {"count": 0, "nearest_dist": None, "nearest_beds": None, "nearest_level": None}

        matches.sort(key=lambda x: x["dist"])
        nearest = matches[0]
        return {
            "count": len(matches),
            "nearest_dist": round(nearest["dist"], 1),
            "nearest_beds": nearest["beds"],
            "nearest_level": nearest["level"],
        }


def _parse_list_item(item: dict, bed_map: dict[str, int | None]) -> dict | None:
    """목록 op 항목 1건 → 기관 dict. 좌표가 없으면 None(매칭 불가라 버린다)."""
    lat = _safe_float(item.get("wgs84Lat"))
    lng = _safe_float(item.get("wgs84Lon"))
    if lat is None or lng is None:
        return None
    return {
        "name": item.get("dutyName", ""),
        "lat": lat,
        "lng": lng,
        # 병상은 실시간 op 에만 있다 — 그 op 에 없는 기관은 None(모름)
        "beds": bed_map.get(str(item.get("hpid") or "")),
        "level": item.get("dutyEmclsName") or None,
        "addr": item.get("dutyAddr", ""),
    }


def _parse_bed_items(items: list) -> dict[str, int | None]:
    """실시간 op 항목들 → {hpid: hvs01}. hvs01 이 없거나 숫자가 아니거나 음수면 None."""
    bed_map: dict[str, int | None] = {}
    for it in items:
        if not isinstance(it, dict):
            continue
        hpid = it.get("hpid")
        if not hpid:
            continue
        bed_map[str(hpid)] = _safe_nonneg_int(it.get("hvs01"))
    return bed_map


def _safe_nonneg_int(val) -> int | None:
    """0 이상 정수로 변환, 실패·음수는 None (0 은 0 으로 보존 — '없음'과 구분)"""
    if val is None or val == "" or val == "-":
        return None
    try:
        n = int(val)
    except (ValueError, TypeError):
        return None
    return n if n >= 0 else None


def _safe_float(val) -> float | None:
    """안전한 float 변환"""
    if val is None or val == "" or val == "-":
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None
