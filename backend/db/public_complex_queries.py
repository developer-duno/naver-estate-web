"""소비자 단지 화면(세션 482 PR 1b)의 공개 조회 두 가지 — 네이버 재료 칸 0, 인증 없이 부른다.

- public_price_history: 면적 하나의 최근 24개월 정부 실거래 최저~최고(달마다 직거래 제외 — 그래프 정부 줄과 같은
  gov_month_range) + 2년 전체 범위.
- region_trend: 그 단지 시군구의 부동산원 중위 매매가·중위 전세가율 최근 24개월.

이 단지 값의 중위(price_median)는 실어 주기만 하고 화면은 쓰지 않는다(사장님 결정 — 집값을 중위 하나로 보이지 않음).
지역 통계의 중위 매매가는 예외(부동산원 공식 지역 통계).
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.exc import OperationalError, ProgrammingError
from sqlalchemy.orm import Session

from crawler.metrics_helpers import _cutoff_month
from db.area_price_queries import gov_month_range
from db.models import ComplexAreaTradeStat, RegionStats
from db.price_queries import BASELINE_MONTHS


def public_price_basis(area_m2: int | None) -> str | None:
    """B1 응답 basis 글자 — 무엇을 보여 주는 숫자인가."""
    if not area_m2:
        return None
    return f"최근 2년 전용 {area_m2}㎡ 대 정부 실거래 최저~최고(달마다 직거래 제외) · 국토교통부 실거래"


def public_price_history(db: Session, complex_no: str, area_m2: int | None) -> dict:
    """{area_m2, months:[{month, trade_count, price_min, price_max, price_median}], two_year, basis}.

    area_m2 가 None 이면 months [] · two_year None. 중개거래가 0건인 달(직거래만 있던 달)은 months 에서 뺀다.
    """
    if area_m2 is None:
        return {"area_m2": None, "months": [], "two_year": None, "basis": None}
    since = _cutoff_month(BASELINE_MONTHS)
    rows = (
        db.query(
            ComplexAreaTradeStat.base_month,
            ComplexAreaTradeStat.trade_count,
            ComplexAreaTradeStat.price_median,
            ComplexAreaTradeStat.price_min,
            ComplexAreaTradeStat.price_max,
            ComplexAreaTradeStat.trades,
        )
        .filter(
            ComplexAreaTradeStat.complex_no == complex_no,
            ComplexAreaTradeStat.area_m2 == area_m2,
            ComplexAreaTradeStat.base_month >= since,
        )
        .order_by(ComplexAreaTradeStat.base_month)
        .all()
    )
    months = []
    for month, count, median, low, high, trades in rows:
        lower, upper, n = gov_month_range(low, high, trades, count)
        if lower is None or upper is None:
            continue
        months.append({"month": month, "trade_count": n, "price_min": lower, "price_max": upper,
                       "price_median": median})
    two_year = None
    if months:
        two_year = {
            "min": min(m["price_min"] for m in months),
            "max": max(m["price_max"] for m in months),
            "count": sum(m["trade_count"] or 0 for m in months),
        }
    return {"area_m2": area_m2, "months": months, "two_year": two_year, "basis": public_price_basis(area_m2)}


def _trend_rows(db: Session, region_code: str, stat_codes: tuple[str, ...], since: str):
    return db.execute(
        select(RegionStats.period, RegionStats.stat_code, RegionStats.value)
        .where(
            RegionStats.region_code == region_code,
            RegionStats.stat_code.in_(stat_codes),
            RegionStats.period >= since,
            RegionStats.value.isnot(None),
        )
        .order_by(RegionStats.period)
    ).all()


def is_missing_schema_error(e: Exception) -> bool:
    """표·칸이 아예 없는 DB 의 오류인가(PG = ProgrammingError, 시험 SQLite = "no such table/column").

    그 밖의 OperationalError(연결 끊김·8초 시간 초과)는 일시 오류라 빈 결과로 바꿔 캐시에 굳히면 안 된다(세션 483 보완 F5).
    """
    if isinstance(e, ProgrammingError):
        return True
    msg = str(getattr(e, "orig", e)).lower()
    return isinstance(e, OperationalError) and ("no such table" in msg or "no such column" in msg)


def region_trend(db: Session, c, raise_errors: bool = False) -> dict:
    """{region_code, region_name, source, items:[{period, jeonse_ratio, sale_price_median}]} — 연결 안 되면 items [].

    raise_errors=True(허브 — 1일 캐시) 면 표가 없는 경우만 빈 결과, 연결 오류·시간 초과는 그대로 올린다.
    기존 /{no}/region-trend 라우트는 기본값(삼킴) 그대로.
    """
    from crawler.region_match import SINGLE_SIGUNGU_SIDO, sido_name_of_region
    from crawler.service_region_stats import SOURCE_OF, STAT_APT_SALE_MEDIAN, STAT_JEONSE_RATIO
    from db.region_stats_queries import region_code_of_complex, region_display_name, sido_code

    code = region_code_of_complex(c)
    name = region_display_name(code)
    # 두 통계의 출처 글자 공통 머리("한국부동산원 전국주택가격동향조사") — 문구 정본은 수집기 SOURCE_OF
    source = SOURCE_OF[STAT_APT_SALE_MEDIAN].split(" — ")[0]
    empty = {"region_code": code, "region_name": name, "source": source, "items": []}
    if not code or not name:
        return empty
    stats = (STAT_JEONSE_RATIO, STAT_APT_SALE_MEDIAN)
    since = _cutoff_month(BASELINE_MONTHS)
    try:
        with db.begin_nested():
            rows = _trend_rows(db, code, stats, since)
            # 세종처럼 시도가 곧 시군구인 곳은 부동산원이 시도 한 줄로 준다(get_latest_sigungu_stat 과 같은 규칙)
            if not rows and sido_name_of_region(code) in SINGLE_SIGUNGU_SIDO:
                sido = sido_code(code)
                rows = _trend_rows(db, sido, stats, since) if sido else []
    except (ProgrammingError, OperationalError) as e:
        if raise_errors and not is_missing_schema_error(e):
            raise
        return empty
    by_period: dict[str, dict] = {}
    for period, stat, value in rows:
        item = by_period.setdefault(str(period), {"period": str(period), "jeonse_ratio": None,
                                                  "sale_price_median": None})
        if stat == STAT_JEONSE_RATIO:
            item["jeonse_ratio"] = float(value)
        else:
            item["sale_price_median"] = int(round(float(value)))
    return {**empty, "items": [by_period[p] for p in sorted(by_period)]}
