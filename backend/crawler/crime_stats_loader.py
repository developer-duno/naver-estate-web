"""범죄통계 CSV 로더 — 경찰청 범죄 발생 지역별 통계 파싱

data.go.kr CSV 파일을 파싱하여 시군구별 범죄 안전 점수(0-100)를 산출한다.
API 호출 없음 — 연 1회 수동 CSV 교체.
"""

import csv
import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)

# 등급 기준 (점수 범위 → 등급)
GRADE_THRESHOLDS = [
    (80, "A"),   # 80점 이상: 매우 안전
    (60, "B"),   # 60-79: 안전
    (40, "C"),   # 40-59: 보통
    (0, "D"),    # 0-39: 주의
]

# 기본 CSV 경로
DEFAULT_CSV_PATH = os.path.join(Path(__file__).parent.parent, "data", "crime_stats.csv")


class CrimeStatsLoader:
    """범죄통계 CSV → 시군구별 안전 점수 로더"""

    @classmethod
    def load_from_csv(cls, csv_path: str | None = None) -> dict[str, dict]:
        """CSV 파싱 → {시군구키: {"total", "violent", "theft", "crime_rate", ...}}

        CSV 컬럼 기대값: 시도, 시군구, 범죄건수합계, 폭력, 절도, 인구수
        구분자: 콤마 (표준 CSV)

        Returns:
            {"서울특별시_강남구": {"total": 5000, "violent": 300, ...}, ...}
        """
        path = csv_path or DEFAULT_CSV_PATH
        if not os.path.exists(path):
            logger.warning("[crime] CSV 파일 없음: %s", path)
            return {}

        result: dict[str, dict] = {}
        try:
            with open(path, encoding="utf-8-sig") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    region = (row.get("시도") or "").strip()
                    gu = (row.get("시군구") or "").strip()
                    if not region or not gu:
                        continue

                    total = _safe_int(row.get("범죄건수합계") or row.get("total"))
                    violent = _safe_int(row.get("폭력") or row.get("violent"))
                    theft = _safe_int(row.get("절도") or row.get("theft"))
                    population = _safe_int(row.get("인구수") or row.get("population"))

                    key = f"{region}_{gu}"
                    crime_rate = (total / population * 10000) if population and total else None

                    result[key] = {
                        "region": region,
                        "gu": gu,
                        "total": total or 0,
                        "violent": violent or 0,
                        "theft": theft or 0,
                        "population": population or 0,
                        "crime_rate": round(crime_rate, 2) if crime_rate else None,
                    }
        except Exception:
            logger.exception("[crime] CSV 파싱 실패: %s", path)
            return {}

        logger.info("[crime] CSV 로드 완료: %d개 시군구", len(result))
        return result

    @classmethod
    def compute_scores(cls, stats: dict[str, dict]) -> dict[str, dict]:
        """범죄율 기반 안전 점수 산출 (0-100, 높을수록 안전)

        범죄율이 가장 낮은 시군구 = 100점, 가장 높은 = 0점 (역정규화)
        """
        entries = [(k, v) for k, v in stats.items() if v.get("crime_rate") is not None]
        if not entries:
            return {}

        rates = [v["crime_rate"] for _, v in entries]
        min_rate, max_rate = min(rates), max(rates)
        spread = max_rate - min_rate if max_rate > min_rate else 1.0

        result: dict[str, dict] = {}
        for key, v in entries:
            # 역정규화: 범죄율 낮을수록 점수 높음
            score = round((1 - (v["crime_rate"] - min_rate) / spread) * 100)
            grade = _score_to_grade(score)
            result[key] = {**v, "crime_score": score, "crime_grade": grade}

        return result

    @classmethod
    def get_crime_score(cls, region: str, gu: str, scored_stats: dict[str, dict]) -> dict | None:
        """시군구별 범죄 안전 점수 조회

        Returns:
            {"crime_score": int, "crime_grade": str} or None
        """
        key = f"{region}_{gu}"
        entry = scored_stats.get(key)
        if not entry:
            return None
        return {
            "crime_score": entry["crime_score"],
            "crime_grade": entry["crime_grade"],
        }


def _safe_int(val) -> int | None:
    """안전한 int 변환 (콤마 제거 포함)"""
    if val is None or val == "" or val == "-":
        return None
    try:
        return int(str(val).replace(",", "").strip())
    except (ValueError, TypeError):
        return None


def _score_to_grade(score: int) -> str:
    """점수 → 등급 변환"""
    for threshold, grade in GRADE_THRESHOLDS:
        if score >= threshold:
            return grade
    return "D"
