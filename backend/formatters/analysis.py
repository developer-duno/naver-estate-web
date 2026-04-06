"""전세가율 계산 + 대출 분석 HTML 포맷"""

from formatters.price_core import format_price_value


def calc_jeonse_ratio(trade_data, lease_data):
    """전세가율 — API 제공 비율 + 직접 계산 병행"""
    html = "<p style='font-weight:bold; font-size:13px; margin:8px 0 4px;'>전세가율</p>"
    trade_areas = trade_data.get("areas", [])
    lease_areas = lease_data.get("areas", [])
    if not trade_areas or not lease_areas:
        return html + "<p>시세 데이터가 부족하여 전세가율을 계산할 수 없습니다.</p>"

    # pyeongNo 기준으로 매매 시세 매핑
    trade_by_pyeong = {}
    for area_info in trade_areas:
        pno = area_info.get("pyeongNo")
        mp = area_info.get("data", {}).get("marketPrices", [])
        if mp:
            trade_by_pyeong[pno] = {
                "avg": mp[0].get("dealAveragePrice", 0),
                "apiRatio": mp[0].get("leasePerDealRate", ""),
            }

    html += "<table border='1' cellpadding='5' cellspacing='0' style='border-collapse:collapse; width:100%; font-size:12px;'>"
    html += "<tr style='background-color:#fff9c4;'><th>면적</th><th>매매 평균</th><th>전세 평균</th><th>전세가율</th></tr>"

    has_data = False
    for area_info in lease_areas:
        pno = area_info.get("pyeongNo")
        area_label = area_info.get("areaLabel", "-")
        mp = area_info.get("data", {}).get("marketPrices", [])
        lease_val = mp[0].get("leaseAveragePrice", 0) if mp else 0
        trade_info = trade_by_pyeong.get(pno, {})
        trade_val = trade_info.get("avg", 0)
        api_ratio = trade_info.get("apiRatio", "")

        try:
            trade_int = int(trade_val) if trade_val else 0
            lease_int = int(lease_val) if lease_val else 0
        except (ValueError, TypeError):
            trade_int = lease_int = 0

        if trade_int > 0 and lease_int > 0:
            calc_ratio = f"{(lease_int / trade_int * 100):.1f}%"
            ratio_str = f"{api_ratio} ({calc_ratio})" if api_ratio else calc_ratio
            trade_str = format_price_value(trade_int)
            lease_str = format_price_value(lease_int)
            html += f"<tr><td>{area_label}</td><td>{trade_str}</td><td>{lease_str}</td><td>{ratio_str}</td></tr>"
            has_data = True

    html += "</table>"
    if not has_data:
        return html.split("<table")[0] + "<p>시세 데이터가 부족하여 전세가율을 계산할 수 없습니다.</p>"
    return html


def format_loan_analysis(trade_data, lease_data):
    """매매/전세 시세 기반 대출 분석 HTML 생성"""
    trade_areas = trade_data.get("areas", [])
    lease_areas = lease_data.get("areas", [])
    if not trade_areas:
        return "<p>매매 시세 데이터가 없어 분석할 수 없습니다.</p>"

    # 전세 매핑
    lease_by_pyeong = {}
    for area_info in lease_areas:
        pno = area_info.get("pyeongNo")
        mp = area_info.get("data", {}).get("marketPrices", [])
        if mp:
            lease_by_pyeong[pno] = {
                "avg": mp[0].get("leaseAveragePrice", 0),
                "low": mp[0].get("leaseLowPriceLimit", 0),
            }

    # LTV 규정 안내
    html = "<p style='color:#555; font-size:12px;'>"
    html += "* 주택담보대출 LTV 기준 (2024년 기준): "
    html += "일반지역 70%, 조정대상지역 50%(9억 이하)/30%(9억 초과), "
    html += "투기과열지구 40%(9억 이하)/20%(9억 초과). "
    html += "무주택자 우대 +10~20%p. DSR 40% 적용."
    html += "</p>"

    html += "<table border='1' cellpadding='5' cellspacing='0' style='border-collapse:collapse; width:100%; font-size:12px;'>"
    html += "<tr style='background-color:#e8eaf6;'>"
    html += "<th>면적</th><th>최소 매매가</th><th>전세 평균</th><th>갭(매매-전세)</th>"
    html += "<th>예상 대출<br>(LTV 70%)</th><th>예상 대출<br>(LTV 50%)</th><th>예상 대출<br>(LTV 40%)</th>"
    html += "</tr>"

    has_data = False
    for area_info in trade_areas:
        pno = area_info.get("pyeongNo")
        area_label = area_info.get("areaLabel", "-")
        mp = area_info.get("data", {}).get("marketPrices", [])
        if not mp:
            continue

        latest = mp[0]
        deal_low = latest.get("dealLowPriceLimit", 0)
        deal_avg = latest.get("dealAveragePrice", 0)

        if not deal_low or not deal_avg:
            continue

        deal_low = int(deal_low)
        lease_info = lease_by_pyeong.get(pno, {})
        lease_avg = int(lease_info.get("avg", 0)) if lease_info.get("avg") else 0

        gap = deal_low - lease_avg if lease_avg > 0 else deal_low
        loan_70 = int(deal_low * 0.7)
        loan_50 = int(deal_low * 0.5)
        loan_40 = int(deal_low * 0.4)

        fmt = format_price_value
        gap_str = fmt(gap) if lease_avg > 0 else "-"
        lease_str = fmt(lease_avg) if lease_avg > 0 else "-"

        html += f"<tr><td>{area_label}</td>"
        html += f"<td><b>{fmt(deal_low)}</b></td>"
        html += f"<td>{lease_str}</td>"
        html += f"<td>{gap_str}</td>"
        html += f"<td>{fmt(loan_70)}</td>"
        html += f"<td>{fmt(loan_50)}</td>"
        html += f"<td>{fmt(loan_40)}</td></tr>"
        has_data = True

    html += "</table>"

    if not has_data:
        return "<p>시세 데이터가 없어 대출 분석을 할 수 없습니다.</p>"

    # 참고 법률 안내
    html += "<br><p style='color:#333; font-size:13px;'><b>관련 법률/규정:</b></p>"
    html += "<ul style='color:#555; font-size:12px;'>"
    html += "<li><b>주택법 시행령</b> - LTV(담보인정비율) 규제 기준</li>"
    html += "<li><b>은행업감독규정</b> - DSR(총부채원리금상환비율) 40% 규제</li>"
    html += "<li><b>주택도시기금법</b> - 디딤돌대출(무주택 서민: 최대 4억, 금리 2.15~3.0%)</li>"
    html += "<li><b>한국주택금융공사법</b> - 보금자리론(9억 이하, 최대 5억, 고정금리)</li>"
    html += "<li><b>주택임대차보호법</b> - 전세보증금 보호, 최우선변제금</li>"
    html += "</ul>"
    html += "<p style='color:red; font-size:12px;'>* 실제 대출 조건은 개인 신용, 소득, 보유 주택 수, 지역 규제에 따라 다릅니다. 정확한 금액은 은행 상담을 받으세요.</p>"

    return html
