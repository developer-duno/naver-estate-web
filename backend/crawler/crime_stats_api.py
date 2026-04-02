"""범죄통계 API — 경찰청 범죄 발생 지역별 통계 (odcloud)

API 문서: https://www.data.go.kr/data/3074462/fileData.do
전국 시군구별 범죄 발생 건수를 조회하여 안전 점수(0-100)를 산출한다.
odcloud REST API를 사용하며, 응답이 pivoted 형태(행=범죄분류, 열=지역)이므로
시군구별로 전치·합산한다.
"""

import logging

from crawler.public_data_base import BasePublicDataAPI

logger = logging.getLogger(__name__)

# 경찰청 범죄통계 2024년 (odcloud)
CRIME_STATS_URL = (
    "https://api.odcloud.kr/api/3074462/v1/"
    "uddi:ae109087-8690-4cb5-bda9-a7876a92f3b8"
)

# API 지역 약칭 → DB region 정규명 매핑
_REGION_ALIAS: dict[str, str] = {
    "서울": "서울특별시",
    "부산": "부산광역시",
    "대구": "대구광역시",
    "인천": "인천광역시",
    "광주": "광주광역시",
    "대전": "대전광역시",
    "울산": "울산광역시",
    "세종시": "세종특별자치시",
    "경기도": "경기도",
    "강원도": "강원특별자치도",
    "충북": "충청북도",
    "충남": "충청남도",
    "전북": "전북특별자치도",
    "전남": "전라남도",
    "경북": "경상북도",
    "경남": "경상남도",
    "제주": "제주특별자치도",
}

# 등급 기준 (점수 범위 → 등급)
_GRADE_THRESHOLDS = [
    (80, "A"),  # 80점 이상: 매우 안전
    (60, "B"),  # 60-79: 안전
    (40, "C"),  # 40-59: 보통
    (0, "D"),   # 0-39: 주의
]

# API 응답에서 제외할 메타 키
_META_KEYS = {"범죄대분류", "범죄중분류"}


class CrimeStatsAPI(BasePublicDataAPI):
    """경찰청 범죄통계 API — odcloud 기반"""

    _api_name = "crime_stats"

    @classmethod
    def fetch_all(cls) -> list[dict] | None:
        """경찰청 범죄통계 전체 조회 (38개 범죄 분류)

        Returns:
            원본 레코드 리스트 또는 None (실패 시)
        """
        data = cls.call_api(CRIME_STATS_URL, {"page": "1", "perPage": "50"})
        if not data or "data" not in data:
            logger.warning("[crime_stats] API 응답 없음")
            return None
        rows = data["data"]
        if not rows:
            logger.warning("[crime_stats] API 데이터 비어있음")
            return None
        logger.info("[crime_stats] %d개 범죄 분류 조회 완료", len(rows))
        return rows

    @classmethod
    def aggregate_by_region(cls, rows: list[dict]) -> dict[str, dict]:
        """범죄 분류별 데이터를 시군구별로 전치·합산

        Args:
            rows: fetch_all() 반환값

        Returns:
            {"서울특별시_강남구": {"total": N, "violent": N, "theft": N}, ...}
        """
        result: dict[str, dict] = {}

        for row in rows:
            big = row.get("범죄대분류", "")
            is_violent = big == "폭력범죄"
            is_theft = big == "절도범죄"

            for key, val in row.items():
                if key in _META_KEYS or key.startswith("외국"):
                    continue

                count = _safe_int(val)
                if count is None:
                    continue

                # 지역명 파싱: "서울 강남구" → ("서울특별시", "강남구")
                region, gu = _parse_region_key(key)
                if not region:
                    continue

                db_key = f"{region}_{gu}" if gu else region
                if db_key not in result:
                    result[db_key] = {
                        "region": region, "gu": gu,
                        "total": 0, "violent": 0, "theft": 0,
                    }

                result[db_key]["total"] += count
                if is_violent:
                    result[db_key]["violent"] += count
                if is_theft:
                    result[db_key]["theft"] += count

        logger.info("[crime_stats] %d개 시군구 집계 완료", len(result))
        return result

    @classmethod
    def compute_scores(
        cls, stats: dict[str, dict], population_map: dict[str, int],
    ) -> dict[str, dict]:
        """인구 대비 범죄율 기반 안전 점수 산출 (0-100, 높을수록 안전)

        Args:
            stats: aggregate_by_region() 반환값
            population_map: {"서울특별시_강남구": 550000, ...}

        Returns:
            {"서울특별시_강남구": {"crime_score": int, "crime_grade": str}, ...}
        """
        # 범죄율 계산 (인구 만 명당)
        entries: list[tuple[str, float]] = []
        for key, v in stats.items():
            pop = population_map.get(key)
            if not pop or not v["total"]:
                continue
            crime_rate = v["total"] / pop * 10000
            entries.append((key, crime_rate))

        if not entries:
            logger.warning("[crime_stats] 범죄율 계산 가능 항목 없음")
            return {}

        rates = [r for _, r in entries]
        min_rate, max_rate = min(rates), max(rates)
        spread = max_rate - min_rate if max_rate > min_rate else 1.0

        result: dict[str, dict] = {}
        for key, rate in entries:
            # 역정규화: 범죄율 낮을수록 점수 높음
            score = round((1 - (rate - min_rate) / spread) * 100)
            grade = _score_to_grade(score)
            result[key] = {"crime_score": score, "crime_grade": grade}

        logger.info("[crime_stats] %d개 시군구 점수 산출 완료", len(result))
        return result


def _parse_region_key(api_key: str) -> tuple[str, str]:
    """API 지역 키 → (DB region 정규명, gu) 변환

    "서울 강남구" → ("서울특별시", "강남구")
    "경기도 수원시" → ("경기도", "수원시")
    "세종시" → ("세종특별자치시", "")
    """
    # 세종시 특수 처리 (gu 없음)
    if api_key == "세종시":
        return "세종특별자치시", ""

    parts = api_key.split(" ", 1)
    if len(parts) != 2:
        return "", ""

    raw_region, gu = parts
    region = _REGION_ALIAS.get(raw_region, "")
    if not region:
        logger.debug("[crime_stats] 매핑 실패: %s", api_key)
        return "", ""

    return region, gu


def _safe_int(val) -> int | None:
    """안전한 int 변환"""
    if val is None or val == "" or val == "-":
        return None
    try:
        return int(val)
    except (ValueError, TypeError):
        return None


def _score_to_grade(score: int) -> str:
    """점수 → 등급 변환"""
    for threshold, grade in _GRADE_THRESHOLDS:
        if score >= threshold:
            return grade
    return "D"
