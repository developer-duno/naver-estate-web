"""시세/학군/단지 정보 HTML 포맷팅 함수"""

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


def format_complex_info(detail):
    """단지 기본정보를 HTML 테이블로 포맷 (면적별 상세는 별도 탭)"""
    # API 응답: 단지 정보는 "complexDetail" 안에 중첩됨
    cd = detail.get("complexDetail", {}) if isinstance(detail, dict) else {}

    def val(key, default="-"):
        v = cd.get(key)
        return str(v) if v else default

    # 사용승인일 포맷
    approve_date = _format_date_yyyymmdd(val("useApproveYmd"))

    # 면적 요약 (평형 이름만 나열)
    pyeong_list = detail.get("complexPyeongDetailList", [])
    if pyeong_list:
        names = [p.get("pyeongName", "") for p in pyeong_list if p.get("pyeongName")]
        area_str = ", ".join(f"{n}평" for n in names) if names else "-"
    else:
        area_str = "-"

    # 저/최고층
    low = val("lowFloor")
    high = val("highFloor")
    floor_str = f"{low}층 ~ {high}층" if low != "-" and high != "-" else "-"

    # 난방 (코드→이름 변환, fallback으로 TypeName 사용)
    heat_method = HEAT_METHOD_MAP.get(cd.get("heatMethodTypeCode"), "")
    heat_fuel = HEAT_FUEL_MAP.get(cd.get("heatFuelTypeCode"), "")
    heat_str = heat_method + (f" ({heat_fuel})" if heat_fuel else "")
    if not heat_str.strip():
        heat_str = val("heatMethodTypeName")

    rows = [
        ("주소", val("address", val("cortarAddress"))),
        ("세대수", f'{val("totalHouseholdCount")}세대'),
        ("저/최고층", floor_str),
        ("사용승인일", approve_date),
        ("총주차대수", f'{val("totalParkingCount")}대'),
        ("건설사", val("constructionCompanyName")),
        ("난방", heat_str or "-"),
        ("면적", area_str),
    ]

    html = "<p style='font-weight:bold; font-size:13px; margin:8px 0 4px;'>단지 정보</p>"
    html += '<table border="1" cellpadding="5" style="border-collapse:collapse; width:100%; font-size:12px;">'
    for label, value in rows:
        html += f'<tr><td style="background:#f5f5f5; width:120px;"><b>{label}</b></td><td>{value}</td></tr>'
    html += "</table>"

    return html


def _format_area_value(m2_val, use_pyeong=False):
    """면적 값을 m² 또는 평 단위로 포맷"""
    from constants import M2_TO_PYEONG
    try:
        v = float(m2_val)
    except (ValueError, TypeError):
        return str(m2_val) if m2_val else "-"
    if use_pyeong:
        return f"{v / M2_TO_PYEONG:.2f}평"
    return f"{v} m&sup2;"


def format_area_detail(p, use_pyeong=False):
    """개별 면적(평형) 상세 정보를 HTML로 포맷. use_pyeong=True면 평 단위."""
    name = p.get("pyeongName", "")
    exclusive = p.get("exclusiveArea", "")
    supply = p.get("supplyArea", "")

    # 전용률 계산
    exclusive_rate = ""
    try:
        exc_f = float(exclusive) if exclusive else 0
        sup_f = float(supply) if supply else 0
        if sup_f > 0:
            exclusive_rate = f"{(exc_f / sup_f * 100):.1f}%"
    except (ValueError, TypeError):
        pass

    rooms = p.get("roomCnt") or p.get("roomCount")
    baths = p.get("bathroomCnt") or p.get("bathroomCount")
    households = p.get("householdCountByPyeong")
    entrance = p.get("entranceType") or p.get("entranceTypeName")

    supply_str = _format_area_value(supply, use_pyeong)
    exclusive_str = _format_area_value(exclusive, use_pyeong)

    html = f'<p style="font-weight:bold; font-size:13px; margin:8px 0 4px;">{name}평</p>'
    html += '<table border="1" cellpadding="5" style="border-collapse:collapse; width:100%; font-size:12px;">'
    html += f'<tr><td style="background:#f5f5f5; width:120px;"><b>공급면적</b></td><td>{supply_str}</td></tr>'
    html += f'<tr><td style="background:#f5f5f5;"><b>전용면적</b></td><td>{exclusive_str}</td></tr>'
    if exclusive_rate:
        html += f'<tr><td style="background:#f5f5f5;"><b>전용률</b></td><td>{exclusive_rate}</td></tr>'
    if rooms:
        html += f'<tr><td style="background:#f5f5f5;"><b>방</b></td><td>{rooms}개</td></tr>'
    if baths:
        html += f'<tr><td style="background:#f5f5f5;"><b>욕실</b></td><td>{baths}개</td></tr>'
    if households:
        html += f'<tr><td style="background:#f5f5f5;"><b>세대수</b></td><td>{households}세대</td></tr>'
    if entrance:
        html += f'<tr><td style="background:#f5f5f5;"><b>현관구조</b></td><td>{entrance}</td></tr>'

    # 공용관리비 (maintenanceCostList에서 최신 데이터)
    maintenance_costs = p.get("maintenanceCostList", [])
    if maintenance_costs:
        latest_cost = maintenance_costs[0]
        total_price = latest_cost.get("totalPrice", "0")
        basis_ym = latest_cost.get("basisYearMonth", "")
        try:
            won = int(total_price)
            if won >= 10000:
                cost_str = f"{won:,}원 (약 {won // 10000}만원)"
            else:
                cost_str = f"{won:,}원"
        except (ValueError, TypeError):
            cost_str = str(total_price) + "원"
        basis_str = f" ({basis_ym[:4]}.{basis_ym[4:]})" if len(basis_ym) == 6 else ""
        html += f'<tr><td style="background:#f5f5f5;"><b>공용관리비</b></td><td>{cost_str}{basis_str}</td></tr>'

    html += '</table>'

    # 평면도 이미지
    floor_plans = p.get("floorPlanTypeList") or p.get("pyeongShapeList") or []
    if floor_plans:
        html += '<p style="font-weight:bold; font-size:13px; margin:10px 0 4px;">평면도</p>'
        for fp in floor_plans[:3]:
            img_url = fp.get("imageUrl") or fp.get("imageSrc") or ""
            if img_url:
                html += f'<img src="{img_url}" style="max-height:200px; margin-right:8px; border:1px solid #ddd;" />'

    return html


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


def format_school_data(data):
    """학군 API 응답을 HTML로 포맷"""
    html = ""
    school_list = data.get("schools", data.get("schoolList", []))
    if isinstance(data, list):
        school_list = data

    if not school_list:
        return "<p>학군 정보가 없습니다.</p>"

    # 배정 안내 메시지
    alloc_msg = data.get("allocationMessage", "")
    if alloc_msg:
        html += f"<p style='color:#1565c0; margin-bottom:10px;'>{alloc_msg}</p>"

    html += "<table border='1' cellpadding='5' cellspacing='0' style='border-collapse:collapse; width:100%; font-size:12px;'>"
    html += "<tr style='background-color:#e8f5e9;'>"
    html += "<th>학교명</th><th>구분</th><th>설립</th><th>도보</th>"
    html += "<th>학생수</th><th>학급수</th><th>학급당 학생</th><th>교사당 학생</th>"
    html += "</tr>"

    for school in school_list:
        if isinstance(school, dict):
            name = school.get("schoolName", "-")
            # 학교 구분: 학교명에서 추출 (초등학교/중학교/고등학교)
            stype = "-"
            if "초등학교" in name or "초등" in name:
                stype = "초등"
            elif "중학교" in name or "중학" in name:
                stype = "중학"
            elif "고등학교" in name or "고등" in name:
                stype = "고등"
            org_type = school.get("organizationType", "-")  # 공립/사립
            walk_time = school.get("walkTime", "-")
            if isinstance(walk_time, (int, float)):
                walk_time = f"{walk_time}분"

            total_students = school.get("totalStudentCount", "-")
            total_classes = school.get("totalClassroomCount", "-")
            per_class = school.get("studentCountPerClassroom", "-")
            per_teacher = school.get("studentCountPerTeacher", "-")

            if isinstance(per_class, float):
                per_class = f"{per_class:.1f}"
            if isinstance(per_teacher, float):
                per_teacher = f"{per_teacher:.1f}"

            html += f"<tr><td>{name}</td><td>{stype}</td><td>{org_type}</td><td>{walk_time}</td>"
            html += f"<td>{total_students}</td><td>{total_classes}</td><td>{per_class}</td><td>{per_teacher}</td></tr>"

    html += "</table>"

    # 학교별 상세 정보
    html += "<p style='font-weight:bold; font-size:13px; margin:10px 0 4px;'>학교별 상세 정보</p>"
    for school in school_list:
        if not isinstance(school, dict):
            continue
        name = school.get("schoolName", "-")

        html += '<div style="border:1px solid #c8e6c9; border-radius:5px; padding:10px; margin-bottom:8px; background:#f9fbe7;">'
        html += f'<b style="font-size:13px;">{name}</b>'
        html += '<table cellpadding="6" style="margin-top:5px; width:100%;">'

        # 기본 정보 행
        address = school.get("address", "")
        phone = school.get("phoneNumber", "")
        establish_ymd = school.get("establishYmd", "")
        education_office = school.get("educationOfficeName", "")
        district = school.get("districtName", "")
        homepage = school.get("homepageUrl", "")
        teacher_count = school.get("teacherCount", "")
        walk_dist = school.get("walkDistance", "")
        walk_time_d = school.get("walkTime", "")

        detail_rows = []
        if address:
            detail_rows.append(("주소", address))
        if phone:
            detail_rows.append(("전화", phone))
        if establish_ymd:
            detail_rows.append(("설립일", _format_date_yyyymmdd(str(establish_ymd))))
        if education_office:
            detail_rows.append(("교육청", education_office))
        if district:
            detail_rows.append(("학군", district))
        if teacher_count:
            detail_rows.append(("교직원수", f"{teacher_count}명"))
        if walk_dist or walk_time_d:
            dist_str = f"{walk_dist}m" if walk_dist else ""
            time_str = f" (도보 {walk_time_d}분)" if isinstance(walk_time_d, (int, float)) else ""
            detail_rows.append(("거리", f"{dist_str}{time_str}"))

        for i in range(0, len(detail_rows), 2):
            html += '<tr>'
            lbl1, val1 = detail_rows[i]
            html += f'<td style="color:#888; width:70px;">{lbl1}</td><td>{val1}</td>'
            if i + 1 < len(detail_rows):
                lbl2, val2 = detail_rows[i + 1]
                html += f'<td style="color:#888; width:70px;">{lbl2}</td><td>{val2}</td>'
            html += '</tr>'

        # 학년별 학생수
        grade_counts = school.get("gradeCounts") or school.get("gradeStudentCountList") or []
        if grade_counts and isinstance(grade_counts, list):
            html += '<tr><td style="color:#888;" colspan="4"><b>학년별 학생수:</b> '
            parts = []
            for gc in grade_counts:
                if isinstance(gc, dict):
                    grade = gc.get("grade") or gc.get("gradeNo", "")
                    count = gc.get("studentCount") or gc.get("count", "")
                    if grade and count:
                        parts.append(f"{grade}학년: {count}명")
            if parts:
                html += ", ".join(parts)
            else:
                html += "-"
            html += '</td></tr>'

        html += '</table>'

        if homepage:
            html += f'<a href="{homepage}" style="color:#1976D2; font-size:12px;">홈페이지</a>'

        html += '</div>'

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


# ─────────────────────────────────────────────────────────
# 면적별 상세 시세 포맷 (네이버 스타일 탭 구조용)
# ─────────────────────────────────────────────────────────

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
        # 날짜 (API: formattedTradeYearMonth, tradeYear/tradeMonth/tradeDate)
        ymd = rp.get("formattedTradeYearMonth") or rp.get("tradeYearMonth") or rp.get("contractDate") or ""
        if not ymd:
            year = rp.get("tradeYear") or rp.get("dealYear") or rp.get("year") or ""
            month = rp.get("tradeMonth") or rp.get("dealMonth") or rp.get("month") or ""
            date = rp.get("tradeDate") or ""
            if year and month:
                ymd = f"{year}.{str(month).zfill(2)}"
                if date:
                    ymd += f".{str(date).zfill(2)}"

        # 가격 (월세: 보증금/월세 분리 표시)
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
                # formattedPrice fallback (API 제공)
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

    # 실거래가 데이터 (시세 없어도 실거래가만 있을 수 있음)
    real_prices = price_data.get("realPriceList", [])
    if not real_prices:
        real_prices = price_data.get("realPriceDataList", [])
    if not real_prices:
        real_prices = price_data.get("realDealPrices", [])

    html = ""

    if not market_prices and not real_prices:
        html += f"<p style='color:#888; font-size:12px; margin-top:10px;'>{trade_type} 시세/실거래가 데이터가 없습니다.</p>"
        return html

    # 1) 시세 요약 카드 (KB시세 — 월세는 일반적으로 시세 없음)
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
