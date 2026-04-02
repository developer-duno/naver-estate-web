"""공통 직렬화 함수 — Complex/Article ORM → dict 변환

complexes.py와 articles.py에서 동일한 변환 로직이 중복되어 있었음.
DRY 원칙에 따라 단일 모듈로 통합.
"""

from db.mb_queries import extract_base_name
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
    }


def build_filter_dict(
    *,
    trade_types: str | None = None,
    min_price: int | None = None,
    max_price: int | None = None,
    min_rent: int | None = None,
    max_rent: int | None = None,
    min_area_m2: float | None = None,
    max_area_m2: float | None = None,
    min_rooms: int | None = None,
    min_baths: int | None = None,
    direction: str | None = None,
    min_ppyeong: int | None = None,
    max_ppyeong: int | None = None,
    min_maintenance: int | None = None,
    max_maintenance: int | None = None,
    building_name: str | None = None,
    verified_only: bool = False,
    max_building_age: int | None = None,
    move_in_type: str | None = None,
    estate_type: str | None = None,
    min_floor: int | None = None,
    max_floor: int | None = None,
    tags: str | None = None,
) -> dict | None:
    """필터 파라미터를 queries.get_articles_by_complex용 dict로 변환"""
    VALID_TRADE_TYPES = {"매매", "전세", "월세", "단기임대"}
    filters = {}
    if trade_types:
        types = [t.strip() for t in trade_types.split(",") if t.strip() in VALID_TRADE_TYPES]
        if types:
            filters["trade_types"] = types
    if min_price is not None:
        filters["min_price"] = min_price
    if max_price is not None:
        filters["max_price"] = max_price
    if min_rent is not None:
        filters["min_rent"] = min_rent
    if max_rent is not None:
        filters["max_rent"] = max_rent
    if min_area_m2 is not None:
        filters["min_area_m2"] = min_area_m2
    if max_area_m2 is not None:
        filters["max_area_m2"] = max_area_m2
    if min_rooms is not None and min_rooms > 0:
        filters["min_rooms"] = min_rooms
    if min_baths is not None and min_baths > 0:
        filters["min_baths"] = min_baths
    if direction:
        filters["direction"] = direction
    if min_ppyeong is not None:
        filters["min_ppyeong"] = min_ppyeong
    if max_ppyeong is not None:
        filters["max_ppyeong"] = max_ppyeong
    if min_maintenance is not None:
        filters["min_maintenance"] = min_maintenance
    if max_maintenance is not None:
        filters["max_maintenance"] = max_maintenance
    if building_name:
        filters["building_name"] = building_name
    if verified_only:
        filters["verified_only"] = True
    if max_building_age is not None and max_building_age > 0:
        filters["max_building_age"] = max_building_age
    if move_in_type:
        filters["move_in_type"] = move_in_type
    if estate_type and estate_type != "all":
        filters["estate_type"] = estate_type
    if min_floor is not None:
        filters["min_floor"] = min_floor
    if max_floor is not None:
        filters["max_floor"] = max_floor
    if tags:
        filters["tags"] = tags.split(",")
    return filters or None


# ── mibunyang 직렬화 ─────────────────────────────────────────


def apartment_to_dict(a) -> dict:
    """Apartment ORM → dict (name에서 차수 접미사 제거)"""
    return {
        "id": a.id,
        "name": extract_base_name(a.name),
        "region": a.region,
        "gu": a.gu,
        "dong": a.dong,
        "address": a.address,
        "latitude": a.latitude,
        "longitude": a.longitude,
        "builder": a.builder,
        "units": a.units,
        "unsold": a.unsold,
        "unsold_rate": a.unsold_rate,
        "completion": a.completion,
        "heating": a.heating,
        "max_floor": a.max_floor,
        "parking_ratio": a.parking_ratio,
        "floor_area_ratio": float(a.floor_area_ratio) if a.floor_area_ratio else None,
        "building_coverage_ratio": float(a.building_coverage_ratio) if a.building_coverage_ratio else None,
        "discount_pct": a.discount_pct,
        "balcony_free": a.balcony_free,
        "option_free": a.option_free,
        "cashback": a.cashback,
        "benefits": a.benefits,
        "presale_min_price": a.presale_min_price,
        "presale_max_price": a.presale_max_price,
        "presale_pp": a.presale_pp,
        "presale_type": a.presale_type,
        "presale_stage": a.presale_stage,
        "presale_move_in": a.presale_move_in,
        "naver_nearby_median": a.naver_nearby_median,
        "naver_jeonse_rate": a.naver_jeonse_rate,
        "naver_sell_count": a.naver_sell_count,
        "naver_build_year": a.naver_build_year,
        "is_regulated": a.is_regulated,
        "road_address": a.road_address,
        "district": a.district,
    }


def unsold_history_to_dict(u) -> dict:
    """UnsoldHistory ORM → dict"""
    return {
        "id": u.id,
        "apartment_id": u.apartment_id,
        "base_month": u.base_month,
        "unsold_count": u.unsold_count,
        "post_completion_unsold": u.post_completion_unsold,
        "change": u.change,
        "recorded_at": u.recorded_at.isoformat() if u.recorded_at else None,
    }


def mb_region_to_dict(r) -> dict:
    """MBRegion ORM → dict"""
    return {
        "id": r.id,
        "region": r.region,
        "gu": r.gu,
        "population": r.population,
        "households": r.households,
        "regional_unsold": r.regional_unsold,
        "pop_growth": r.pop_growth,
        "avg_income": r.avg_income,
        "supply_ratio": r.supply_ratio,
        "jeonse_rate": r.jeonse_rate,
        "avg_price": r.avg_price,
        "net_migration": r.net_migration,
        "price_index": r.price_index,
        "new_supply": r.new_supply,
        "recorded_at": r.recorded_at.isoformat() if r.recorded_at else None,
    }


def mb_trade_to_dict(t) -> dict:
    """MBTrade ORM → dict"""
    return {
        "id": t.id,
        "region": t.region,
        "gu": t.gu,
        "dong": t.dong,
        "deal_month": t.deal_month,
        "area": t.area,
        "price": t.price,
        "floor": t.floor,
        "build_year": t.build_year,
        "trade_type": t.trade_type,
        "deposit": t.deposit,
        "apt_name": t.apt_name,
        "cancel_date": t.cancel_date,
        "dealing_type": t.dealing_type,
    }


def mb_price_to_dict(p) -> dict:
    """MBPrice ORM → dict"""
    return {
        "id": p.id,
        "apartment_id": p.apartment_id,
        "area": p.area,
        "supply_area": p.supply_area,
        "price": p.price,
        "pp": p.pp,
        "house_type": p.house_type,
        "supply_count": p.supply_count,
    }


def trade_stats_to_dict(ts) -> dict:
    """TradeStats ORM → dict"""
    return {
        "apartment_id": ts.apartment_id,
        "nearby_median": ts.nearby_median,
        "recent_trades_6m": ts.recent_trades_6m,
        "jeonse_rate": ts.jeonse_rate,
        "pir": ts.pir,
        "psr": ts.psr,
        "price_by_area": ts.price_by_area,
        "rent_by_area": ts.rent_by_area,
        "jeonse_by_area": ts.jeonse_by_area,
        "price_by_floor": ts.price_by_floor,
        "avg_floor": ts.avg_floor,
        "floor_range": ts.floor_range,
        "cancel_ratio_6m": ts.cancel_ratio_6m,
    }


def infra_to_dict(i) -> dict:
    """Infra ORM → dict"""
    return {
        "hospital": i.hospital,
        "hospital_dist": i.hospital_dist,
        "mart": i.mart,
        "mart_dist": i.mart_dist,
        "conv": i.conv,
        "conv_dist": i.conv_dist,
        "cafe": i.cafe,
        "cafe_dist": i.cafe_dist,
        "culture": i.culture,
        "culture_dist": i.culture_dist,
        "bank": i.bank,
        "bank_dist": i.bank_dist,
        "pharmacy": i.pharmacy,
        "pharmacy_dist": i.pharmacy_dist,
        "park": i.park,
        "park_dist": i.park_dist,
        "subway_dist": i.subway_dist,
        # 응급의료기관 (V012)
        "emergency_hospital": i.emergency_hospital,
        "emergency_hospital_dist": i.emergency_hospital_dist,
        "emergency_beds": i.emergency_beds,
        "emergency_level": i.emergency_level,
        # 대기질 — 에어코리아 (V012)
        "air_station_name": i.air_station_name,
        "air_station_dist": i.air_station_dist,
        "air_pm10": i.air_pm10,
        "air_pm25": i.air_pm25,
        "air_o3": i.air_o3,
        "air_grade": i.air_grade,
        "air_updated_at": i.air_updated_at.isoformat() if i.air_updated_at else None,
    }


def school_to_dict(s) -> dict:
    """School ORM → dict"""
    return {
        "school_score": s.school_score,
        "school_grade": s.school_grade,
        "nearby_schools": s.nearby_schools,
    }


def transport_to_dict(t) -> dict:
    """Transport ORM → dict"""
    return {
        "bus_routes": t.bus_routes,
        "ic_dist": t.ic_dist,
        "ktx_dist": t.ktx_dist,
        "subway_dist": t.subway_dist,
        "subway_name": t.subway_name,
        "subway_lines": t.subway_lines,
        "bus_stop_names": t.bus_stop_names,
    }


def builder_to_dict(b) -> dict:
    """Builder ORM → dict"""
    return {
        "name": b.name,
        "debt_ratio": b.debt_ratio,
        "credit_grade": b.credit_grade,
        "hug_guarantee": b.hug_guarantee,
    }
