"""공통 직렬화 함수 — Complex/Article ORM → dict 변환

complexes.py와 articles.py에서 동일한 변환 로직이 중복되어 있었음.
DRY 원칙에 따라 단일 모듈로 통합.
"""

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
        "last_crawled_at": c.last_crawled_at.isoformat() if c.last_crawled_at else None,
    }


def article_to_dict(a) -> dict:
    """Article ORM → 전체 필드 dict"""
    pyeong = round(a.area2_m2 / M2_TO_PYEONG, 1) if a.area2_m2 else None
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
        "complex_name": a.complex_name,
        "numeric_price": a.numeric_price,
        "numeric_rent_price": a.numeric_rent_price,
        "price_per_pyeong": a.price_per_pyeong,
        "room_count": a.room_count,
        "bathroom_count": a.bathroom_count,
        "move_in_date": a.move_in_date,
        "maintenance_cost": a.maintenance_cost,
        "numeric_maintenance_cost": a.numeric_maintenance_cost,
        "heating_type": a.heating_type,
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
        "use_approve_ymd": a.use_approve_ymd,
        "article_name": a.article_name,
        "first_seen_at": a.first_seen_at.isoformat() if a.first_seen_at else None,
        "last_seen_at": a.last_seen_at.isoformat() if a.last_seen_at else None,
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
) -> dict | None:
    """필터 파라미터를 queries.get_articles_by_complex용 dict로 변환"""
    filters = {}
    if trade_types:
        filters["trade_types"] = trade_types.split(",")
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
    if min_rooms:
        filters["min_rooms"] = min_rooms
    if min_baths:
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
    if max_building_age:
        filters["max_building_age"] = max_building_age
    if move_in_type:
        filters["move_in_type"] = move_in_type
    if estate_type and estate_type != "all":
        filters["estate_type"] = estate_type
    return filters or None
