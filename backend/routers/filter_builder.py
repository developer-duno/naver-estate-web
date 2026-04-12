"""필터 파라미터 → queries 용 dict 변환"""


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
    min_yield: float | None = None,
    max_yield: float | None = None,
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
    if min_yield is not None:
        filters["min_yield"] = min_yield
    if max_yield is not None:
        filters["max_yield"] = max_yield
    return filters or None
