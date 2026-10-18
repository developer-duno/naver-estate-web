"""동네 공식 통계(region_stats, V072) 조회 — 단지 상세·비교·매물 상세 직렬화가 쓴다 (세션 473).

캐시를 두지 않는다 — 요청당 1~2쿼리(기본키 앞부분 + 인덱스)이고 목록 직렬화에는 붙이지 않는다.
(캐시를 붙이게 되면 키에 region_code·stat_code 둘 다 넣는다 — silent-cache 규칙.)
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from crawler.region_match import (
    SIDO_CODES,
    SIDO_NAME_OF_CODE,
    SINGLE_SIGUNGU_SIDO,
    sido_name_of_region,
    sigungu_name_of_region,
)
from db.models import RegionStats


def region_code_of_complex(c) -> str | None:
    """단지 → 지역 코드 5자리 = cortar_no 앞 5자리(숫자 5자리가 아니면 None)."""
    cortar = getattr(c, "cortar_no", None)
    if not cortar or len(cortar) < 5 or not cortar[:5].isdigit():
        return None
    return cortar[:5]


def sido_code(region_code: str | None) -> str | None:
    """지역 코드 → 시도 코드. 이름(region_codes.json 의 sido)으로 찾는다 — 우리 코드 앞자리 12(전남광주)는
    전남·광주를 가르지 못하기 때문. 표에 없는 새 코드는 앞 2자리 + "000" 이 시도 표에 있을 때만."""
    if not region_code:
        return None
    name = sido_name_of_region(region_code)
    if name:
        return SIDO_CODES.get(name)
    guess = region_code[:2] + "000"
    return guess if guess in SIDO_NAME_OF_CODE else None


def region_display_name(region_code: str | None) -> str | None:
    """지역 코드 → 화면 이름(시군구 이름만 — "천안시 동남구"). 세종처럼 시군구 이름이 없으면 "세종시"."""
    name = sigungu_name_of_region(region_code)
    if name:
        return name
    sido = sido_name_of_region(region_code)
    return f"{sido}시" if sido in SINGLE_SIGUNGU_SIDO else None


def get_latest_region_stat(db: Session, region_code: str | None, stat_code: str) -> tuple[float, str] | None:
    """그 지역·그 통계의 가장 최근 기준 달 한 행 → (값, "YYYYMM"). 없거나 값이 NULL 이면 None."""
    if not region_code:
        return None
    row = db.execute(
        select(RegionStats.value, RegionStats.period)
        .where(
            RegionStats.region_code == region_code,
            RegionStats.stat_code == stat_code,
            RegionStats.value.isnot(None),
        )
        .order_by(RegionStats.period.desc())
        .limit(1)
    ).first()
    if row is None:
        return None
    return float(row[0]), str(row[1])


def get_latest_sigungu_stat(db: Session, region_code: str | None, stat_code: str) -> tuple[float, str] | None:
    """시군구 값 — 세종처럼 시도가 곧 시군구인 곳은 시도 코드 행도 본다(부동산원이 "세종" 한 줄로 준다)."""
    hit = get_latest_region_stat(db, region_code, stat_code)
    if hit is not None:
        return hit
    if sido_name_of_region(region_code) in SINGLE_SIGUNGU_SIDO:
        return get_latest_region_stat(db, sido_code(region_code), stat_code)
    return None


def format_period(period: str | None) -> str | None:
    """"202601" → "2026.01"."""
    if not period or len(period) != 6 or not period.isdigit():
        return None
    return f"{period[:4]}.{period[4:]}"
