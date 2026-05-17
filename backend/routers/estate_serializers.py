"""매물/단지 ORM → dict 직렬화"""

from shared.constants import M2_TO_PYEONG


def complex_to_dict(c) -> dict:
    """Complex ORM → dict"""
    return {
        "complex_no": c.complex_no,
        "complex_name": c.complex_name,
        "cortar_no": c.cortar_no,
        "real_estate_type_code": c.real_estate_type_code,
        "real_estate_type_name": c.real_estate_type_name,
        "latitude": c.latitude,
        "longitude": c.longitude,
        "total_household_count": c.total_household_count,
        "high_floor": c.high_floor,
        "low_floor": c.low_floor,
        "use_approve_ymd": c.use_approve_ymd,
        "total_dong_count": c.total_dong_count,
        "min_supply_area_m2": c.min_supply_area_m2,
        "max_supply_area_m2": c.max_supply_area_m2,
        "cortar_address": c.cortar_address,
        "sido": c.sido,
        "sigungu": c.sigungu,
        "dong": c.dong,
        "heat_method_type": c.heat_method_type,
        "total_parking_count": c.total_parking_count,
        "construction_company": c.construction_company,
        "floor_area_ratio": c.floor_area_ratio,
        "building_coverage_ratio": c.building_coverage_ratio,
        "address": c.address,
        "road_address": c.road_address,
        "heat_fuel_type": c.heat_fuel_type,
        "parking_count_by_household": c.parking_count_by_household,
        "management_office_tel": c.management_office_tel,
        "last_crawled_at": c.last_crawled_at.isoformat() if c.last_crawled_at else None,
        "nearby_median_price": c.nearby_median_price,
        "jeonse_rate": c.jeonse_rate,
        "recent_trades_6m": c.recent_trades_6m,
        "detail_crawled_at": c.detail_crawled_at.isoformat() if getattr(c, "detail_crawled_at", None) else None,
        "has_pool": getattr(c, "has_pool", None),
    }


def article_to_dict(a, complex_obj=None) -> dict:
    """Article ORM → 전체 필드 dict. complex_obj가 있으면 단지 정보로 빈 필드 보완."""
    pyeong = round(a.area2_m2 / M2_TO_PYEONG, 1) if a.area2_m2 else None
    c = complex_obj
    return {
        "article_no": a.article_no,
        "complex_no": a.complex_no,
        "trade_type_name": a.trade_type_name,
        "building_name": a.building_name,
        "floor_info": a.floor_info,
        "deal_or_warrant_prc": a.deal_or_warrant_prc,
        "rent_prc": a.rent_prc,
        "area1_m2": a.area1_m2,
        "area2_m2": a.area2_m2,
        "area2_pyeong": pyeong,
        "direction": a.direction,
        "article_feature_desc": a.article_feature_desc,
        "tags": a.tags,
        "realtor_name": a.realtor_name,
        "article_confirm_ymd": a.article_confirm_ymd,
        "complex_name": a.complex_name or (c.complex_name if c else None),
        "numeric_price": a.numeric_price,
        "numeric_rent_price": a.numeric_rent_price,
        "price_per_pyeong": a.price_per_pyeong,
        "room_count": a.room_count,
        "bathroom_count": a.bathroom_count,
        "move_in_date": a.move_in_date,
        "maintenance_cost": a.maintenance_cost,
        "numeric_maintenance_cost": a.numeric_maintenance_cost,
        "heating_type": a.heating_type or (c.heat_method_type if c else None),
        "total_floor_count": a.total_floor_count,
        "jibun_address": a.jibun_address,
        "detail_description": a.detail_description,
        "photo_urls": a.photo_urls,
        "representative_img_url": a.representative_img_url,
        "realtor_phone_display": a.realtor_phone_display,
        "realtor_address": a.realtor_address,
        "parking_count": a.parking_count,
        "acquisition_tax": a.acquisition_tax,
        "broker_fee": a.broker_fee,
        "latitude": a.latitude,
        "longitude": a.longitude,
        "is_verified": a.is_verified,
        "is_presale": a.is_presale,
        "detail_crawled": a.detail_crawled,
        "use_approve_ymd": a.use_approve_ymd or (c.use_approve_ymd if c else None),
        "article_name": a.article_name,
        "first_seen_at": a.first_seen_at.isoformat() if a.first_seen_at else None,
        "last_seen_at": a.last_seen_at.isoformat() if a.last_seen_at else None,
        "previous_price": a.previous_price,
        "price_changed_at": a.price_changed_at.isoformat() if a.price_changed_at else None,
        "total_household_count": c.total_household_count if c else None,
        "complex_address": c.address if c else None,
        "article_real_estate_type_name": getattr(a, "article_real_estate_type_name", None),
        "realtor_id": getattr(a, "realtor_id", None),
        "realtor_phone": getattr(a, "realtor_phone", None),
        # #9 매물 가치 필드
        "price_change_state": getattr(a, "price_change_state", None),
        "article_status": getattr(a, "article_status", None),
        "same_addr_cnt": getattr(a, "same_addr_cnt", None),
        "same_addr_min_prc": getattr(a, "same_addr_min_prc", None),
        "same_addr_max_prc": getattr(a, "same_addr_max_prc", None),
        "verification_type_code": getattr(a, "verification_type_code", None),
        "is_direct_trade": getattr(a, "is_direct_trade", False),
        "cp_name": getattr(a, "cp_name", None),
        "site_image_count": getattr(a, "site_image_count", None),
        "same_addr_premium_min": getattr(a, "same_addr_premium_min", None),
        "same_addr_premium_max": getattr(a, "same_addr_premium_max", None),
        "premium_prc": getattr(a, "premium_prc", None),
        # 수익률 (동적 계산, DB 컬럼 불필요)
        "monthly_rent_yield": _calc_rent_yield(a),
        "article_jeonse_ratio": _calc_jeonse_ratio(a, c),
    }


def _calc_rent_yield(a) -> float | None:
    """월세 수익률: (월세 × 12) / 보증금 × 100"""
    if (
        a.trade_type_name == "월세"
        and a.numeric_rent_price
        and a.numeric_price
        and a.numeric_price > 0
    ):
        return round((a.numeric_rent_price * 12) / a.numeric_price * 100, 2)
    return None


def _calc_jeonse_ratio(a, c) -> float | None:
    """개별 전세가율: 전세보증금 / 매매중위가 × 100"""
    c_median = getattr(c, "nearby_median_price", None) if c else None
    if (
        a.trade_type_name == "전세"
        and a.numeric_price
        and c_median
        and c_median > 0
    ):
        return round(a.numeric_price / c_median * 100, 1)
    return None
