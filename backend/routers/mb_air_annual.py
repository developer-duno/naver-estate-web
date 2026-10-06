"""측정소별 3년 평균 대기질 → 등급·설명 문구 (세션604 — 실시간 수집 폐지 뒤 상세·레이더의 '대기질')

표 `air_station_annual` 은 미분양(mibunyang) 소유라 2u 는 읽기만 한다.
등급 구간은 미분양 채점표를 그대로 옮긴다(판정은 `<=`, 경계값은 아래 칸에 속한다).

짝꿍 경로(경계·라벨을 바꾸면 같은 세션에 함께 고친다 — domain-mapping-ssot 룰 1):
  - 미분양 정본 F:/mibunyang/src/constants/scoringTiers.ts
      :266-270 PM2.5 경계(AIR_QUALITY_TIERS) · :959-963 PM10(AIR_PM10_TIERS)
      :985-989 O3(AIR_O3_TIERS) · :286 라벨(AIR_ANNUAL_LABELS) · :318-323 설명 문구(buildAnnualLegend)
  - 2u FE 레이더 등급→값 매핑 frontend/src/components/mb/MbCompareRadarChart.tsx:33
"""

import math

# 라벨 — 경계 튜플과 같은 순서(첫 경계 이하 = 좋음, 둘째 경계 이하 = 보통, 그 위 = 나쁨)
AIR_ANNUAL_LABELS: tuple[str, str, str] = ("좋음", "보통", "나쁨")

# 경계(μg/m³ · ppm). PM2.5 첫 경계 15 는 국가 대기환경기준(연평균)이다
AIR_PM25_CUTS: tuple[float, float] = (15, 19)
AIR_PM10_CUTS: tuple[float, float] = (30, 36)
AIR_O3_CUTS: tuple[float, float] = (0.03, 0.035)


def _band_of(value, cuts: tuple[float, float]) -> str | None:
    """값 → 등급 이름. 값이 없거나 숫자가 아니거나 음수면 None(지어내지 않는다)."""
    if value is None or isinstance(value, bool):
        return None
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(v) or v < 0:
        return None
    for label, cut in zip(AIR_ANNUAL_LABELS, cuts):
        if v <= cut:
            return label
    return AIR_ANNUAL_LABELS[-1]


def air_annual_band(pm25) -> str | None:
    """PM2.5 3년 평균 → "좋음"/"보통"/"나쁨" (값이 없거나 비정상이면 None)."""
    return _band_of(pm25, AIR_PM25_CUTS)


def _fmt(cut: float) -> str:
    # 15 → "15", 0.035 → "0.035" (불필요한 .0 을 붙이지 않는다)
    return f"{cut:g}"


def air_annual_legend(cuts: tuple[float, float] = AIR_PM25_CUTS) -> str:
    """경계에서 만든 설명 — "좋음 15 이하, 보통 19 이하, 나쁨 19 초과". 손으로 적지 않는다."""
    head = [f"{label} {_fmt(cut)} 이하" for label, cut in zip(AIR_ANNUAL_LABELS, cuts)]
    return ", ".join([*head, f"{AIR_ANNUAL_LABELS[-1]} {_fmt(cuts[-1])} 초과"])


def air_annual_to_dict(row) -> dict:
    """AirStationAnnual ORM → 상세 응답의 `infra.air_annual` 객체."""
    return {
        "pm25": row.pm25,
        "pm10": row.pm10,
        "o3": row.o3,
        "years": row.years,
        "band": air_annual_band(row.pm25),
        "legend": air_annual_legend(),
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }
