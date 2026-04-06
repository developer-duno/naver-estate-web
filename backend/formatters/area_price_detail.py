"""면적별 상세 시세 포맷 (네이버 스타일 탭 구조용)"""

from formatters.price_core import format_price_value
from utils import _format_date_yyyymmdd


def _format_price_summary_cards(low, high, trade_type, lease_area_info=None, base_date=""):
    """시세 요약 카드 (하한가 | 상한가 | 전세가율) — 네이버 스타일 카드 레이아웃"""
    cards = []
    if low:
        cards.append(("하한가", format_price_value(int(low))))
    if high:
        cards.append(("상한가", format_price_value(int(high))))

    # 매매일 때 전세가율 표시
    if trade_type == "매매" and lease_area_info:
        lease_mp = lease_area_info.get("data", {})
        if isinstance(lease_mp, dict):
            lease_mp = lease_mp.get("marketPrices", [])
        if lease_mp and isinstance(lease_mp, list):
            lease_avg = lease_mp[0].get("leaseAveragePrice")
            if lease_avg and high:
                try:
                    ratio = int(lease_avg) / int(high) * 100
                    cards.append(("매매가 대비 전세가", f"{ratio:.0f}~100%"))
                except (ValueError, ZeroDivisionError):
                    pass

    if not cards:
        return ""

    # 카드 렌더링
    col_width = f"{100 // len(cards)}%"
    html = "<table style='width:100%; margin:10px 0; border:none;'><tr>"
    for label, value in cards:
        html += (
            f"<td style='text-align:center; padding:8px 6px; "
            f"border:1px solid #e8f5e9; border-radius:6px; "
            f"background:#f1f8e9; width:{col_width};'>"
            f"<div style='font-size:13px; font-weight:bold; color:#2e7d32;'>{value}</div>"
            f"<div style='font-size:10px; color:#888; margin-top:2px;'>{label}</div>"
            f"</td>"
        )
    html += "</tr></table>"

    if base_date:
        html += f"<p style='text-align:right; color:#aaa; font-size:11px; margin:2px 0;'>제공처: 한국부동산원 / 기준일: {base_date}</p>"

    return html


def _format_real_price_table(real_prices, trade_type):
    """실거래가 테이블 HTML"""
    if not real_prices:
        return ""

    is_monthly = (trade_type == "월세")
    if trade_type == "매매":
        price_key = "dealPrice"
        alt_keys = ["tradePrice", "dealAmount"]
        col_name = "매매가"
    elif trade_type == "전세":
        price_key = "leasePrice"
        alt_keys = ["deposit", "leaseAmount"]
        col_name = "전세가"
    else:  # 월세
        price_key = "rentPrice"
        alt_keys = ["monthlyRent", "rentAmount"]
        col_name = "보증금/월세"

    html = "<p style='text-align:right; color:#aaa; font-size:10px;'>국토교통부 기준</p>"
    html += "<table border='1' cellpadding='5' cellspacing='0' style='border-collapse:collapse; width:100%; font-size:12px;'>"
    html += f"<tr style='background-color:#e3f2fd;'><th>계약월</th><th>{col_name}</th></tr>"

    count = 0
    for rp in real_prices:
        if not isinstance(rp, dict):
            continue
        ymd = rp.get("formattedTradeYearMonth") or rp.get("tradeYearMonth") or rp.get("contractDate") or ""
        if not ymd:
            year = rp.get("tradeYear") or rp.get("dealYear") or rp.get("year") or ""
            month = rp.get("tradeMonth") or rp.get("dealMonth") or rp.get("month") or ""
            date = rp.get("tradeDate") or ""
            if year and month:
                ymd = f"{year}.{str(month).zfill(2)}"
                if date:
                    ymd += f".{str(date).zfill(2)}"

        # 가격
        if is_monthly:
            deposit = rp.get("leasePrice") or rp.get("deposit") or rp.get("warrantyAmount") or 0
            monthly = rp.get("rentPrice") or rp.get("monthlyRent") or rp.get("rentAmount") or 0
            if not monthly and not deposit:
                formatted = rp.get("formattedPrice")
                if formatted:
                    price_str = str(formatted)
                else:
                    continue
            else:
                try:
                    dep_str = format_price_value(int(deposit)) if deposit else "0"
                    mon_str = format_price_value(int(monthly)) if monthly else "0"
                    price_str = f"{dep_str} / {mon_str}"
                except (ValueError, TypeError):
                    price_str = f"{deposit} / {monthly}"
        else:
            price = rp.get(price_key)
            if not price:
                for ak in alt_keys:
                    price = rp.get(ak)
                    if price:
                        break
            if not price:
                formatted = rp.get("formattedPrice")
                if formatted:
                    price_str = str(formatted)
                else:
                    continue
            else:
                try:
                    price_str = format_price_value(int(price))
                except (ValueError, TypeError):
                    price_str = str(price)

        # 부가 정보 (층, 동)
        floor_info = rp.get("floor") or rp.get("dealFloor", "")
        building = rp.get("buildingName", "")
        extra = ""
        if floor_info or building:
            parts = []
            if building:
                parts.append(f"{building}")
            if floor_info:
                parts.append(f"{floor_info}층")
            extra = f"({','.join(parts)})"

        html += f"<tr><td>{ymd}</td><td>{price_str}{extra}</td></tr>"
        count += 1

    html += "</table>"
    return html if count > 0 else ""


def _format_market_price_table(market_prices, trade_type):
    """시세 시계열 테이블 HTML"""
    if not market_prices:
        return ""

    html = "<table border='1' cellpadding='5' cellspacing='0' style='border-collapse:collapse; width:100%; font-size:12px;'>"
    html += "<tr style='background-color:#e3f2fd;'><th>시준일</th><th>하한</th><th>상한</th><th>평균</th><th>기준일</th></tr>"

    if trade_type == "매매":
        avg_key, low_key, high_key = "dealAveragePrice", "dealLowPriceLimit", "dealUpperPriceLimit"
    elif trade_type == "전세":
        avg_key, low_key, high_key = "leaseAveragePrice", "leaseLowPriceLimit", "leaseUpperPriceLimit"
    else:  # 월세
        avg_key, low_key, high_key = "rentAveragePrice", "rentLowPriceLimit", "rentUpperPriceLimit"

    count = 0
    for mp in market_prices:
        if not isinstance(mp, dict):
            continue
        avg = mp.get(avg_key)
        low = mp.get(low_key)
        high = mp.get(high_key)
        base_date = _format_date_yyyymmdd(mp.get("baseYearMonthDay", ""))
        formation_date = _format_date_yyyymmdd(mp.get("formationYearMonthDay", mp.get("baseYearMonthDay", "")))

        if not avg and not low and not high:
            continue

        avg_str = format_price_value(int(avg)) if avg else "-"
        low_str = format_price_value(int(low)) if low else "-"
        high_str = format_price_value(int(high)) if high else "-"

        html += f"<tr><td>{formation_date}</td><td>{low_str}</td><td>{high_str}</td><td><b>{avg_str}</b></td><td>{base_date}</td></tr>"
        count += 1

    html += "</table>"
    return html if count > 0 else ""


def format_area_price_detail(area_info, trade_type, lease_area_info=None):
    """면적별 시세 상세 정보 HTML (네이버 스타일)

    Args:
        area_info: {"areaLabel", "pyeongNo", "data": {"marketPrices": [...]}}
        trade_type: "매매", "전세", or "월세"
        lease_area_info: 매매 탭일 때 전세 데이터 (전세가율 표시용)
    """
    price_data = area_info.get("data", {})
    if not isinstance(price_data, dict):
        price_data = {}

    market_prices = price_data.get("marketPrices", [])
    if not isinstance(market_prices, list):
        market_prices = []

    real_prices = price_data.get("realPriceList", [])
    if not real_prices:
        real_prices = price_data.get("realPriceDataList", [])
    if not real_prices:
        real_prices = price_data.get("realDealPrices", [])

    html = ""

    if not market_prices and not real_prices:
        html += f"<p style='color:#888; font-size:12px; margin-top:10px;'>{trade_type} 시세/실거래가 데이터가 없습니다.</p>"
        return html

    # 1) 시세 요약 카드
    low = high = None
    if market_prices:
        latest = market_prices[0]
        if trade_type == "매매":
            low = latest.get("dealLowPriceLimit")
            high = latest.get("dealUpperPriceLimit")
        elif trade_type == "전세":
            low = latest.get("leaseLowPriceLimit")
            high = latest.get("leaseUpperPriceLimit")
        else:  # 월세
            low = latest.get("rentLowPriceLimit")
            high = latest.get("rentUpperPriceLimit")

    base_date = ""
    if market_prices:
        base_date = _format_date_yyyymmdd(market_prices[0].get("baseYearMonthDay", ""))

    if low or high:
        html += _format_price_summary_cards(low, high, trade_type, lease_area_info, base_date)

    # 2) 실거래가 테이블
    if real_prices:
        html += f"<p style='font-weight:bold; font-size:13px; margin:10px 0 4px;'>{trade_type} 실거래가</p>"
        real_html = _format_real_price_table(real_prices, trade_type)
        if real_html:
            html += real_html

    # 3) 시세 테이블 (시계열)
    if market_prices:
        html += f"<p style='font-weight:bold; font-size:13px; margin:10px 0 4px;'>{trade_type} 시세</p>"
        market_html = _format_market_price_table(market_prices, trade_type)
        if market_html:
            html += market_html

    return html
