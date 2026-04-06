"""가격 포맷 코어 + 난방 상수"""

from utils import _format_date_yyyymmdd

# 난방 방식/연료 코드→이름 매핑
HEAT_METHOD_MAP = {
    "HT001": "중앙난방", "HT002": "개별난방", "HT003": "지역난방",
}
HEAT_FUEL_MAP = {
    "HF001": "도시가스", "HF002": "LPG", "HF003": "석유", "HF004": "전기",
}


def format_price_value(price_man):
    """만원 단위 정수를 억/만 표시로 변환"""
    try:
        price_man = int(price_man)
    except (ValueError, TypeError):
        return "-"
    if price_man >= 10000:
        eok = price_man // 10000
        man = price_man % 10000
        return f"{eok}억 {man:,}만" if man else f"{eok}억"
    return f"{price_man:,}만"


def format_price_data(data):
    """시세 API 응답을 HTML 테이블로 포맷 (면적별 구조)"""
    areas = data.get("areas", [])
    if not areas:
        return "<p>시세 데이터가 없습니다.</p>"

    html = "<table border='1' cellpadding='5' cellspacing='0' style='border-collapse:collapse; width:100%; font-size:12px;'>"
    html += "<tr style='background-color:#e3f2fd;'><th>면적</th><th>하한</th><th>평균</th><th>상한</th><th>기준일</th></tr>"

    has_data = False
    for area_info in areas:
        area_label = area_info.get("areaLabel", "-")
        price_data = area_info.get("data", {})
        if not isinstance(price_data, dict):
            continue

        market_prices = price_data.get("marketPrices", [])
        if market_prices and isinstance(market_prices, list):
            latest = market_prices[0]
            # 매매/전세 공통으로 처리
            avg = latest.get("dealAveragePrice") or latest.get("leaseAveragePrice")
            low = latest.get("dealLowPriceLimit") or latest.get("leaseLowPriceLimit")
            high = latest.get("dealUpperPriceLimit") or latest.get("leaseUpperPriceLimit")
            base_date = latest.get("baseYearMonthDay", "")

            if avg:
                avg_str = format_price_value(int(avg))
                low_str = format_price_value(int(low)) if low else "-"
                high_str = format_price_value(int(high)) if high else "-"
                date_str = _format_date_yyyymmdd(base_date)
                html += f"<tr><td>{area_label}</td><td>{low_str}</td><td><b>{avg_str}</b></td><td>{high_str}</td><td>{date_str}</td></tr>"
                has_data = True

    html += "</table>"

    if not has_data:
        return "<p>시세 데이터가 없습니다.</p>"
    return html
