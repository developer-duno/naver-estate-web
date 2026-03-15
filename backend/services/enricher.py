"""단지 상세 정보 보강 — live.py와 crawler/service.py 통합

Phase 1-1: 두 곳에서 중복/불일치하던 _enrich_complex_detail()을 단일 모듈로 통합.
필드명 불일치(batlRatio vs floorAreaRatio) 수정 포함.
"""

import logging
from datetime import datetime, timezone

from db.models import Complex as ComplexModel, ComplexPyeongDetail
from shared.naver_api import NaverEstateAPI

logger = logging.getLogger(__name__)

HEAT_METHOD_MAP = {"HT001": "중앙난방", "HT002": "개별난방", "HT003": "지역난방"}
HEAT_FUEL_MAP = {"HF001": "도시가스", "HF002": "LPG", "HF003": "석유", "HF004": "전기"}


def _utcnow():
    return datetime.now(timezone.utc)


def _safe_int(val):
    if val is None:
        return None
    try:
        return int(val)
    except (ValueError, TypeError):
        return None


def _safe_float(val):
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def enrich_complex_detail(db, complex_no):
    """단지 상세 정보 보강 (면적별 정보, 난방, 건설사, 주소 등).

    live.py와 crawler/service.py 모두 이 함수를 호출.
    """
    try:
        detail = NaverEstateAPI.get_complex_detail(complex_no)
    except Exception as e:
        logger.warning("단지 상세 조회 실패: %s -> %s", complex_no, e)
        return

    if not detail or not isinstance(detail, dict) or "error" in detail:
        return

    cd = detail.get("complexDetail") or {}

    # 난방 정보: 코드 -> 이름 매핑
    heat_method = HEAT_METHOD_MAP.get(cd.get("heatMethodTypeCode"), cd.get("heatMethodTypeName", ""))
    heat_fuel = HEAT_FUEL_MAP.get(cd.get("heatFuelTypeCode"), "")
    heat_str = heat_method + (f" ({heat_fuel})" if heat_fuel else "")

    # 도로명주소 조합
    road_prefix = cd.get("roadAddressPrefix", "")
    road_addr = cd.get("roadAddress", "")
    road_full = f"{road_prefix} {road_addr}".strip() if road_addr else None

    # 용적률/건폐율: API 필드 양쪽 모두 지원
    floor_area_ratio = cd.get("floorAreaRatio") or cd.get("batlRatio")
    building_coverage_ratio = cd.get("buildingCoverageRatio") or cd.get("btlRatio")

    db.query(ComplexModel).filter(ComplexModel.complex_no == complex_no).update({
        "heat_method_type": heat_str.strip() or None,
        "heat_fuel_type": heat_fuel or None,
        "total_parking_count": _safe_int(cd.get("parkingPossibleCount")) or _safe_int(cd.get("totalParkingCount")),
        "construction_company": cd.get("constructionCompanyName"),
        "floor_area_ratio": floor_area_ratio,
        "building_coverage_ratio": building_coverage_ratio,
        "address": cd.get("address"),
        "road_address": road_full,
        "parking_count_by_household": _safe_float(cd.get("parkingCountByHousehold")),
        "management_office_tel": cd.get("managementOfficeTelNo"),
        "detail_crawled_at": _utcnow(),
    }, synchronize_session=False)

    pyeong_list = detail.get("complexPyeongDetailList") or []
    for p in pyeong_list:
        pyeong_no = _safe_int(p.get("pyeongNo"))
        if pyeong_no is None:
            continue

        avg_maint = p.get("averageMaintenanceCost") or {}

        grand_plans = p.get("grandPlanList") or []
        floor_plan_url = None
        if grand_plans:
            src = grand_plans[0].get("imageSrc", "")
            if src:
                floor_plan_url = f"https://landthumb-phinf.pstatic.net{src}" if src.startswith("/") else src

        maint_list = p.get("maintenanceCostList") or []
        latest_maint_cost = None
        maint_basis = None
        if maint_list:
            latest_maint_cost = _safe_int(maint_list[0].get("totalPrice"))
            maint_basis = maint_list[0].get("basisYearMonth")

        values = {
            "complex_no": complex_no,
            "pyeong_no": pyeong_no,
            "pyeong_name": p.get("pyeongName"),
            "supply_area": p.get("supplyArea"),
            "supply_area_double": _safe_float(p.get("supplyAreaDouble")),
            "exclusive_area": p.get("exclusiveArea"),
            "exclusive_rate": p.get("exclusiveRate"),
            "household_count_by_pyeong": p.get("householdCountByPyeong"),
            "entrance_type": p.get("entranceType"),
            "room_count": _safe_int(p.get("roomCnt")),
            "bathroom_count": _safe_int(p.get("bathroomCnt")),
            "avg_maintenance_cost": _safe_int(avg_maint.get("averageTotalPrice")),
            "summer_maintenance_cost": _safe_int(avg_maint.get("summerTotalPrice")),
            "winter_maintenance_cost": _safe_int(avg_maint.get("winterTotalPrice")),
            "floor_plan_url": floor_plan_url,
            "supply_pyeong": p.get("supplyPyeong"),
            "exclusive_pyeong": p.get("exclusivePyeong"),
            "latest_maintenance_cost": latest_maint_cost,
            "maintenance_cost_basis": maint_basis,
            "updated_at": _utcnow(),
        }

        existing = (
            db.query(ComplexPyeongDetail)
            .filter(
                ComplexPyeongDetail.complex_no == complex_no,
                ComplexPyeongDetail.pyeong_no == pyeong_no,
            )
            .first()
        )
        if existing:
            for k, v in values.items():
                if k not in ("complex_no", "pyeong_no"):
                    setattr(existing, k, v)
        else:
            db.add(ComplexPyeongDetail(**values))

    db.commit()
    logger.info("단지 상세 보강 완료: %s -> %d개 면적", complex_no, len(pyeong_list))
