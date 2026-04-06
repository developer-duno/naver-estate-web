"""단지 기본정보 + 면적(평형) 상세 HTML 포맷"""

from formatters.price_core import HEAT_FUEL_MAP, HEAT_METHOD_MAP
from utils import _format_date_yyyymmdd


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


def format_complex_info(detail):
    """단지 기본정보를 HTML 테이블로 포맷 (면적별 상세는 별도 탭)"""
    cd = detail.get("complexDetail", {}) if isinstance(detail, dict) else {}

    def val(key, default="-"):
        v = cd.get(key)
        return str(v) if v else default

    approve_date = _format_date_yyyymmdd(val("useApproveYmd"))

    pyeong_list = detail.get("complexPyeongDetailList", [])
    if pyeong_list:
        names = [p.get("pyeongName", "") for p in pyeong_list if p.get("pyeongName")]
        area_str = ", ".join(f"{n}평" for n in names) if names else "-"
    else:
        area_str = "-"

    low = val("lowFloor")
    high = val("highFloor")
    floor_str = f"{low}층 ~ {high}층" if low != "-" and high != "-" else "-"

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


def format_area_detail(p, use_pyeong=False):
    """개별 면적(평형) 상세 정보를 HTML로 포맷. use_pyeong=True면 평 단위."""
    name = p.get("pyeongName", "")
    exclusive = p.get("exclusiveArea", "")
    supply = p.get("supplyArea", "")

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

    floor_plans = p.get("floorPlanTypeList") or p.get("pyeongShapeList") or []
    if floor_plans:
        html += '<p style="font-weight:bold; font-size:13px; margin:10px 0 4px;">평면도</p>'
        for fp in floor_plans[:3]:
            img_url = fp.get("imageUrl") or fp.get("imageSrc") or ""
            if img_url:
                html += f'<img src="{img_url}" style="max-height:200px; margin-right:8px; border:1px solid #ddd;" />'

    return html
