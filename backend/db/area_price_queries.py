"""면적별 정부 실거래 조회 — 단지 상세·비교·매물 상세 전세가율·엑셀이 같이 쓴다 (세션 474 B27).

표 = complex_area_trade_stats(V073). 한 요청당 이 표 조회 1번(그 단지 최근 6개월 줄 전부) — 목록·검색 직렬화에는
쓰지 않는다(단지마다 조회가 늘기 때문). 6개월 기준 달은 가치지표 잡(crawler/service_metrics.py)과 같은 계산을 쓴다.
세션 479 B29: 시세는 최저~최고(중개거래 기준) 범위 + 거래 하나하나 목록(trades, V074)으로 보여 준다.
"""

import re

from crawler.metrics_helpers import _cutoff_month
from crawler.stats import compute_median_price

AREA_PRICE_MONTHS = 6
DIRECT_DEAL = "직거래"  # 정부 응답 dealingGbn 원문 — 범위·전세가율 분모에서 뺀다(사장님 결정 ㄱ, 세션 479)

_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def area_price_source(rep_area_m2: int | None, include_jeonse: bool = True) -> str | None:
    """화면 출처 줄 '이 단지:' 뒤 글자 — 정본(프런트는 이 글자를 그대로 쓴다, derived-display-ssot).

    옛 화면(중위 한 값·중위 분모 전세가율)용 글자 — 옛 화면이 운영 중이라 그대로 둔다(세션 480).
    범위 화면용 글자는 area_price_range_source.
    include_jeonse=False = 비로그인 응답용 — 전세가율(네이버 재료)을 숨기므로 그 설명 꼬리도 안 붙인다(세션 481).
    """
    if not rep_area_m2:
        return None
    head = f"정부 실거래 최근 {AREA_PRICE_MONTHS}개월, 전용 {rep_area_m2}㎡ 대는 소수점을 버린 같은 크기끼리"
    if not include_jeonse:
        return head
    return head + " · 전세가율 = 네이버 전세 시세(같은 면적) ÷ 정부 실거래 중위"


def area_price_range_source(rep_area_m2: int | None, include_jeonse: bool = True) -> str | None:
    """범위 화면(price_min/max·jeonse_rate_min/max)의 출처 글자 — 응답 칸 area_price_range_source (세션 479 B29·480).

    include_jeonse=False = 비로그인 응답용(세션 481) — area_price_source 와 같다.
    """
    if not rep_area_m2:
        return None
    head = (
        f"정부 실거래 최근 {AREA_PRICE_MONTHS}개월 최저~최고(중개거래 기준), 전용 {rep_area_m2}㎡ 대는 소수점을 버린 같은 크기끼리"
    )
    if not include_jeonse:
        return head
    return head + " · 전세가율 = 네이버 전세 시세(같은 면적, 최신 주) ÷ 정부 실거래 최저~최고"


def _as_list(value) -> list:
    """저장된 JSON 칸(prices·trades)이 목록이 아니면(dict·글자·숫자) 빈 목록 — 모양이 깨진 줄로 500 이 나지 않게."""
    return value if isinstance(value, list) else []


def _api_date(value) -> str | None:
    """저장된 거래일("YYYY-MM-DD") → 그대로 · 꼴이 다르거나 달 01~12·일 01~31 밖이면 None."""
    if not isinstance(value, str) or not _DATE.match(value):
        return None
    month, day = int(value[5:7]), int(value[8:10])
    return value if 1 <= month <= 12 and 1 <= day <= 31 else None


def _api_floor(value) -> int | None:
    if isinstance(value, bool):
        return None
    try:
        return int(value)
    except (TypeError, ValueError, OverflowError):
        return None


def api_trade(raw) -> dict | None:
    """저장 꼴 {"p","d","f","g"} → API 꼴 {"price","date","floor","direct"}. 가격을 못 읽으면 None(그 거래 버림)."""
    if not isinstance(raw, dict):
        return None
    p = raw.get("p")
    if isinstance(p, bool) or not isinstance(p, (int, float)):
        return None
    try:
        price = int(p)
    except (ValueError, OverflowError):
        return None
    if price <= 0:
        return None
    g = raw.get("g")
    g = g.strip() if isinstance(g, str) else None
    return {"price": price, "date": _api_date(raw.get("d")), "floor": _api_floor(raw.get("f")), "direct": g == DIRECT_DEAL}


def sort_api_trades(trades: list[dict]) -> list[dict]:
    """거래일 내림차순(날짜 없는 거래는 뒤) → 같은 날은 가격 내림차순."""
    return sorted(trades, key=lambda t: (t["date"] is not None, t["date"] or "", t["price"]), reverse=True)


def api_trades(raw_list) -> list[dict]:
    """저장된 trades 목록 → API 꼴 목록(못 읽는 거래는 버림, 정렬 = sort_api_trades)."""
    return sort_api_trades([t for t in (api_trade(r) for r in _as_list(raw_list)) if t is not None])


def _row_prices(prices) -> list[int]:
    return [int(p) for p in _as_list(prices) if p]


def brokered_prices(raw_trades) -> list[int] | None:
    """한 줄(한 달) trades 의 중개거래 가격 — 읽을 수 있는 거래가 하나도 없으면 None(그 줄은 prices 로 폴백)."""
    trades = [t for t in (api_trade(r) for r in _as_list(raw_trades)) if t is not None]
    if not trades:
        return None
    return [t["price"] for t in trades if not t["direct"]]


def gov_month_range(low, high, raw_trades, trade_count=None) -> tuple[int | None, int | None, int | None]:
    """정부 실거래 한 달 줄의 (최저, 최고, 거래 수) — 그래프 정부 줄과 공개 범위 API 가 같이 부른다(세션 480·482).

    trades 가 있으면 직거래를 뺀 중개거래로 셈(중개거래 0건이면 (None, None, 0)), 비면 저장된 price_min·price_max·trade_count.
    """
    brokered = brokered_prices(raw_trades)
    if brokered is None:
        return low, high, trade_count
    if not brokered:
        return None, None, 0
    return min(brokered), max(brokered), len(brokered)


def row_range_material(prices, raw_trades) -> list[int]:
    """한 줄(한 달)의 범위 재료 — trades 가 있으면 그 줄의 중개거래 가격, 비면 그 줄 prices (세션 480 — 달 단위)."""
    brokered = brokered_prices(raw_trades)
    return brokered if brokered is not None else _row_prices(prices)


def area_ranges(rows) -> dict[int, tuple[int, int] | None]:
    """{묶음: (최저, 최고)} — rows = (area_m2, prices, trades) 저장 꼴 줄들. 재료는 줄마다 row_range_material 로 고르고
    묶음 범위 = 고른 재료 전체의 최저·최고(재료 0 이면 None). 단지 상세·매물 상세·엑셀이 모두 이 함수(세션 479 B29·480)."""
    material: dict[int, list[int]] = {}
    for area_m2, prices, trades in rows:
        material.setdefault(int(area_m2), []).extend(row_range_material(prices, trades))
    return {area: (min(m), max(m)) if m else None for area, m in material.items()}


def _recent_area_material(db, complex_no: str, cutoff: str | None = None):
    """그 단지 최근 6개월 줄을 한 번 읽어 ({묶음: 가격 목록}, {묶음: API 꼴 거래 목록}, {묶음: 범위}) 셋 다 만든다."""
    from db.models import ComplexAreaTradeStat

    cutoff = cutoff or _cutoff_month(AREA_PRICE_MONTHS)
    rows = (
        db.query(ComplexAreaTradeStat.area_m2, ComplexAreaTradeStat.prices, ComplexAreaTradeStat.trades)
        .filter(ComplexAreaTradeStat.complex_no == complex_no, ComplexAreaTradeStat.base_month >= cutoff)
        .all()
    )
    prices_out: dict[int, list[int]] = {}
    trades_out: dict[int, list[dict]] = {}
    for area_m2, prices, trades in rows:
        prices_out.setdefault(int(area_m2), []).extend(_row_prices(prices))
        trades_out.setdefault(int(area_m2), []).extend(
            t for t in (api_trade(r) for r in _as_list(trades)) if t is not None
        )
    return (
        {area: prices for area, prices in prices_out.items() if prices},
        {area: sort_api_trades(trades) for area, trades in trades_out.items() if trades},
        area_ranges(rows),
    )


def recent_area_prices(db, complex_no: str, cutoff: str | None = None) -> dict[int, list[int]]:
    """그 단지 최근 6개월 면적 묶음별 거래 가격 목록(만원) — 달마다 나뉜 prices 를 합친다."""
    return _recent_area_material(db, complex_no, cutoff)[0]


def recent_area_trades(db, complex_no: str, cutoff: str | None = None) -> dict[int, list[dict]]:
    """그 단지 최근 6개월 면적 묶음별 거래 하나하나(API 꼴, 거래일 내림차순) — 달마다 나뉜 trades 를 합친다."""
    return _recent_area_material(db, complex_no, cutoff)[1]


def recent_area_prices_and_ranges(db, complex_no: str, cutoff: str | None = None):
    """(가격 목록, 범위) — 매물 상세·엑셀용, 표 조회 1번."""
    prices, _trades, ranges = _recent_area_material(db, complex_no, cutoff)
    return prices, ranges


def summarize_area_prices(
    by_area: dict[int, list[int]],
    households: dict[int, int] | None = None,
    rep_area_m2: int | None = None,
    by_area_trades: dict[int, list[dict]] | None = None,
    ranges: dict[int, tuple[int, int] | None] | None = None,
) -> list[dict]:
    """[{area_m2, households, price_median, trade_count, price_min, price_max, trades}] — 평형표의 모든 묶음 +
    새 표에만 있는 묶음 (보완 ①).

    거래 없는 묶음은 price_median·trade_count·price_min·price_max None, trades [](화면 "42㎡ —").
    price_min/max = ranges(area_ranges — 달마다 직거래 제외 · 빈 달은 prices 폴백) · price_median 은 옛 화면 호환용.
    ranges 를 안 넘기면 prices 만으로 범위를 낸다.
    households = 평형표 세대수 합(평형표에 없으면 None).
    순서 = 대표 면적 먼저, 나머지는 거래 수 많은 순(같으면 작은 면적 먼저). 평형표가 없으면 새 표 묶음만.
    """
    households = households or {}
    by_area_trades = by_area_trades or {}
    if ranges is None:
        ranges = area_ranges((area, prices, None) for area, prices in by_area.items())
    rows = []
    for area in set(households) | set(by_area):
        prices = by_area.get(area) or []
        rng = ranges.get(area)
        rows.append({
            "area_m2": area,
            "households": households.get(area),
            "price_median": compute_median_price(prices) if prices else None,
            "trade_count": len(prices) if prices else None,
            "price_min": rng[0] if rng else None,
            "price_max": rng[1] if rng else None,
            "trades": by_area_trades.get(area) or [],
        })
    rows.sort(key=lambda r: (r["area_m2"] != rep_area_m2, -(r["trade_count"] or 0), r["area_m2"]))
    return rows


def area_medians(by_area: dict[int, list[int]]) -> dict[int, int]:
    """{면적 묶음: 6개월 중위} — 매물 전세가율 분모."""
    return {area: compute_median_price(prices) for area, prices in by_area.items() if prices}


def jeonse_range(jeonse: int | None, rng: tuple[int, int] | None) -> tuple[float, float] | None:
    """(전세÷최고 %, 전세÷최저 %) — 전세(또는 보증금)가 최저 이상이면 None(범위 전체가 100% 미만일 때만).

    실제 비율이 100% 미만이므로 반올림이 100.0 을 만들면 99.9 로 낮춘다(세션 480).
    """
    if not jeonse or jeonse <= 0 or not rng:
        return None
    low, high = rng
    if not low or low <= 0 or jeonse >= low:
        return None
    return min(round(jeonse / high * 100, 1), 99.9), min(round(jeonse / low * 100, 1), 99.9)


def _latest_rep_jeonse(db, complex_no: str, table, rep: int, cutoff: str) -> int | None:
    """대표 묶음 평형들의 네이버 전세(B1 8자리 주간) 가장 최신 주 한 값 (세션 479 B29 설계 §2-3 · 검사관 🔴1).

    그 주에 평형이 여럿이면 세대수 최다 평형(동률이면 작은 평형번호) · 세대수를 하나도 모르면 평균(반올림).
    같은 주·같은 평형의 A1 줄과 같은 값이면 버린다(네이버 B1=A1 동일값 결함) — 다 버려지면 None.
    """
    from sqlalchemy import func

    from db.models import ComplexPriceHistory

    hh_by_pno = {str(pno): hh for pno, area, hh in table if area == rep}
    if not hh_by_pno:
        return None
    rows = (
        db.query(
            ComplexPriceHistory.trade_type, ComplexPriceHistory.area_no,
            ComplexPriceHistory.base_month, ComplexPriceHistory.price_avg,
        )
        .filter(
            ComplexPriceHistory.complex_no == complex_no,
            ComplexPriceHistory.trade_type.in_(("A1", "B1")),
            ComplexPriceHistory.area_no.in_(sorted(hh_by_pno)),
            func.length(ComplexPriceHistory.base_month) == 8,
            func.substr(ComplexPriceHistory.base_month, 1, 6) >= cutoff,
            ComplexPriceHistory.price_avg.isnot(None),
        )
        .all()
    )
    b1_weeks = [m for t, _no, m, _p in rows if t == "B1"]
    if not b1_weeks:
        return None
    week = max(b1_weeks)
    a1 = {(no, p) for t, no, m, p in rows if t == "A1" and m == week}
    picks = {no: p for t, no, m, p in rows if t == "B1" and m == week and (no, p) not in a1}
    if not picks:
        return None
    if all(hh_by_pno.get(no, 0) <= 0 for no in picks):
        return round(sum(picks.values()) / len(picks))
    best = min(picks, key=lambda no: (-hh_by_pno.get(no, 0), int(no)))
    return picks[best]


def _legacy_range(db, complex_no: str) -> dict | None:
    """옛 값 단지 — 마지막 정부 섞인 줄(cph A1 · area_no ''/NULL · 6자리) {lower, upper, month} (사장님 결정 ㄱ, 세션 479).

    lower·upper 가 둘 다 비면 그 줄은 건너뛰고 그 앞 달로. 없으면 None.
    """
    from sqlalchemy import func, or_

    from db.models import ComplexPriceHistory

    rows = (
        db.query(ComplexPriceHistory.price_lower, ComplexPriceHistory.price_upper, ComplexPriceHistory.base_month)
        .filter(
            ComplexPriceHistory.complex_no == complex_no,
            ComplexPriceHistory.trade_type == "A1",
            or_(ComplexPriceHistory.area_no == "", ComplexPriceHistory.area_no.is_(None)),
            func.length(ComplexPriceHistory.base_month) == 6,
        )
        .order_by(ComplexPriceHistory.base_month.desc())
        .all()
    )
    for lower, upper, month in rows:
        if lower is not None or upper is not None:
            return {"lower": lower, "upper": upper, "month": month}
    return None


def complex_area_fields(db, c) -> dict:
    """단지 상세·비교 응답에 덧붙이는 면적별 시세 — area_prices · area_price_source(옛 화면) · area_price_range_source
    · jeonse_rate_min/max · legacy_range.

    rep_area_m2 는 complexes 칸이라 complex_to_dict 가 싣는다. 조회 = 이 표 1번 + 평형표 1번
    + 대표 면적 범위가 있으면 네이버 전세 최신 주 1번 · 옛 값 단지면 옛 정부 줄 1번.
    평형표·거래가 다 없으면 area_prices = [] · 대표 면적이 없으면 source = None.
    """
    from crawler.area_group import load_pyeong_tables

    rep = getattr(c, "rep_area_m2", None)
    table = load_pyeong_tables(db, [c.complex_no]).get(c.complex_no, [])
    households: dict[int, int] = {}
    for _pno, area, hh in table:
        if area is not None:
            households[area] = households.get(area, 0) + hh
    cutoff = _cutoff_month(AREA_PRICE_MONTHS)
    by_area, by_area_trades, ranges = _recent_area_material(db, c.complex_no, cutoff)

    jeonse_min = jeonse_max = None
    rep_range = ranges.get(rep) if rep is not None else None
    if rep_range:
        rate = jeonse_range(_latest_rep_jeonse(db, c.complex_no, table, rep, cutoff), rep_range)
        if rate:
            jeonse_min, jeonse_max = rate

    legacy = None
    if rep is None and getattr(c, "nearby_median_price", None) is not None:
        legacy = _legacy_range(db, c.complex_no)

    return {
        "area_prices": summarize_area_prices(by_area, households, rep, by_area_trades, ranges),
        "area_price_source": area_price_source(rep),
        "area_price_range_source": area_price_range_source(rep),
        "jeonse_rate_min": jeonse_min,
        "jeonse_rate_max": jeonse_max,
        "legacy_range": legacy,
    }
