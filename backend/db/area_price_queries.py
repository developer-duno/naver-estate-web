"""면적별 정부 실거래 조회 — 단지 상세·비교·매물 상세 전세가율·엑셀이 같이 쓴다 (세션 474 B27).

표 = complex_area_trade_stats(V073). 한 요청당 이 표 조회 1번(그 단지 최근 6개월 줄 전부) — 목록·검색 직렬화에는
쓰지 않는다(단지마다 조회가 늘기 때문). 6개월 기준 달은 가치지표 잡(crawler/service_metrics.py)과 같은 계산을 쓴다.
"""

from crawler.metrics_helpers import _cutoff_month
from crawler.stats import compute_median_price

AREA_PRICE_MONTHS = 6


def area_price_source(rep_area_m2: int | None) -> str | None:
    """화면 출처 줄 '이 단지:' 뒤 글자 — 정본(프런트는 이 글자를 그대로 쓴다, derived-display-ssot)."""
    if not rep_area_m2:
        return None
    return (
        f"정부 실거래 최근 {AREA_PRICE_MONTHS}개월, 전용 {rep_area_m2}㎡ 대는 소수점을 버린 같은 크기끼리"
        " · 전세가율 = 네이버 전세 시세(같은 면적) ÷ 정부 실거래 중위"
    )


def recent_area_prices(db, complex_no: str, cutoff: str | None = None) -> dict[int, list[int]]:
    """그 단지 최근 6개월 면적 묶음별 거래 가격 목록(만원) — 달마다 나뉜 prices 를 합친다."""
    from db.models import ComplexAreaTradeStat

    cutoff = cutoff or _cutoff_month(AREA_PRICE_MONTHS)
    out: dict[int, list[int]] = {}
    for area_m2, prices in (
        db.query(ComplexAreaTradeStat.area_m2, ComplexAreaTradeStat.prices)
        .filter(ComplexAreaTradeStat.complex_no == complex_no, ComplexAreaTradeStat.base_month >= cutoff)
        .all()
    ):
        out.setdefault(int(area_m2), []).extend(int(p) for p in (prices or []) if p)
    return {area: prices for area, prices in out.items() if prices}


def summarize_area_prices(
    by_area: dict[int, list[int]],
    households: dict[int, int] | None = None,
    rep_area_m2: int | None = None,
) -> list[dict]:
    """[{area_m2, households, price_median, trade_count}] — 평형표의 모든 묶음 + 새 표에만 있는 묶음 (보완 ①).

    거래 없는 묶음은 price_median·trade_count None(화면 "42㎡ —"). households = 평형표 세대수 합(평형표에 없으면 None).
    순서 = 대표 면적 먼저, 나머지는 거래 수 많은 순(같으면 작은 면적 먼저). 평형표가 없으면 새 표 묶음만.
    """
    households = households or {}
    rows = []
    for area in set(households) | set(by_area):
        prices = by_area.get(area) or []
        rows.append({
            "area_m2": area,
            "households": households.get(area),
            "price_median": compute_median_price(prices) if prices else None,
            "trade_count": len(prices) if prices else None,
        })
    rows.sort(key=lambda r: (r["area_m2"] != rep_area_m2, -(r["trade_count"] or 0), r["area_m2"]))
    return rows


def area_medians(by_area: dict[int, list[int]]) -> dict[int, int]:
    """{면적 묶음: 6개월 중위} — 매물 전세가율 분모."""
    return {area: compute_median_price(prices) for area, prices in by_area.items() if prices}


def complex_area_fields(db, c) -> dict:
    """단지 상세·비교 응답에 덧붙이는 면적별 시세 — area_prices · area_price_source (이 표 조회 1번).

    rep_area_m2 는 complexes 칸이라 complex_to_dict 가 싣는다. 조회 = 이 표 1번 + 평형표 1번.
    평형표·거래가 다 없으면 area_prices = [] · 대표 면적이 없으면 source = None.
    """
    from crawler.area_group import load_pyeong_tables

    rep = getattr(c, "rep_area_m2", None)
    households: dict[int, int] = {}
    for _pno, area, hh in load_pyeong_tables(db, [c.complex_no]).get(c.complex_no, []):
        if area is not None:
            households[area] = households.get(area, 0) + hh
    return {
        "area_prices": summarize_area_prices(recent_area_prices(db, c.complex_no), households, rep),
        "area_price_source": area_price_source(rep),
    }
