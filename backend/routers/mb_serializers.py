"""mibunyang ORM → dict 직렬화 (10개 모델)"""

from db.mb_queries import extract_base_name


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
        "exclusive_ratio": float(a.exclusive_ratio) if a.exclusive_ratio else None,
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
        "naver_school_walk_min": a.naver_school_walk_min,
        "is_regulated": a.is_regulated,
        "noise": a.noise,
        "noxious_dist": a.noxious_dist,
        "road_address": a.road_address,
        "district": a.district,
        # 세대당 월 관리비 합산 (만원)
        "avg_maintenance_cost": a.avg_maintenance_cost,
        # 관리비 5 항목 분리 (mibunyang W3)
        "maint_heat": a.maint_heat,
        "maint_hotwater": a.maint_hotwater,
        "maint_gas": a.maint_gas,
        "maint_elec": a.maint_elec,
        "maint_water": a.maint_water,
        # 청약 경쟁률 (mibunyang)
        "competition_rate": a.competition_rate,
        "competition_applicants": a.competition_applicants,
        "competition_supply": a.competition_supply,
        # 안전 — 범죄 안전등급 1~5 / 내진설계
        "crime_safety_grade": a.crime_safety_grade,
        "quake_design": a.quake_design,
        # 주거 환경 — 조망 / 주향 / 난방연료 / 복도구조
        "view": a.view,
        "primary_direction": a.primary_direction,
        "heat_fuel": a.heat_fuel,
        "corridor_type": a.corridor_type,
        "created_at": a.created_at.isoformat() if a.created_at else None,
        "updated_at": a.updated_at.isoformat() if a.updated_at else None,
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
        "avg_price_sqm": r.avg_price_sqm,
        "net_migration": r.net_migration,
        "price_index": r.price_index,
        "new_supply": r.new_supply,
        "initial_sale_rate": r.initial_sale_rate,
        "land_cost_ratio": r.land_cost_ratio,
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
        "recorded_at": p.recorded_at.isoformat() if p.recorded_at else None,
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
        "updated_at": ts.updated_at.isoformat() if ts.updated_at else None,
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
        # 응급의료기관 시설명/분류 (mibunyang W4)
        "emergency_name": i.emergency_name,
        "emergency_type": i.emergency_type,
        # 대기질 — 에어코리아 (V012)
        "air_station_name": i.air_station_name,
        "air_station_dist": i.air_station_dist,
        "air_pm10": i.air_pm10,
        "air_pm25": i.air_pm25,
        "air_o3": i.air_o3,
        "air_grade": i.air_grade,
        "air_updated_at": i.air_updated_at.isoformat() if i.air_updated_at else None,
        # 어린이집 (V013)
        "childcare_count": i.childcare_count,
        "childcare_nearest_dist": i.childcare_nearest_dist,
        "childcare_nearest_name": i.childcare_nearest_name,
        "childcare_nearest_capacity": i.childcare_nearest_capacity,
        "childcare_nearest_type": i.childcare_nearest_type,
        "childcare_nearest_teachers": i.childcare_nearest_teachers,
        # 범죄통계 (V013)
        "crime_score": i.crime_score,
        "crime_grade": i.crime_grade,
        "crime_updated_at": i.crime_updated_at.isoformat() if i.crime_updated_at else None,
        # 인프라 데이터 갱신시각 (신선도 표시)
        "updated_at": i.updated_at.isoformat() if i.updated_at else None,
    }


def school_to_dict(s) -> dict:
    """School ORM → dict"""
    return {
        "school_score": s.school_score,
        "school_grade": s.school_grade,
        "nearby_schools": s.nearby_schools,
        "updated_at": s.updated_at.isoformat() if s.updated_at else None,
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
        "updated_at": t.updated_at.isoformat() if t.updated_at else None,
    }


def builder_to_dict(b) -> dict:
    """Builder ORM → dict"""
    return {
        "name": b.name,
        "debt_ratio": b.debt_ratio,
        "credit_grade": b.credit_grade,
        "hug_guarantee": b.hug_guarantee,
        "updated_at": b.updated_at.isoformat() if b.updated_at else None,
    }


def presale_schedule_to_dict(s) -> dict:
    """PresaleScheduleOfficial ORM → dict (청약홈 공식 분양 일정 12종)"""
    return {
        "id": s.id,
        "apartment_id": s.apartment_id,
        "house_manage_no": s.house_manage_no,
        "pblanc_no": s.pblanc_no,
        "recruit_date": s.recruit_date.isoformat() if s.recruit_date else None,
        "special_receipt_bgnde": s.special_receipt_bgnde.isoformat() if s.special_receipt_bgnde else None,
        "special_receipt_endde": s.special_receipt_endde.isoformat() if s.special_receipt_endde else None,
        "general_rank1_bgnde": s.general_rank1_bgnde.isoformat() if s.general_rank1_bgnde else None,
        "general_rank1_endde": s.general_rank1_endde.isoformat() if s.general_rank1_endde else None,
        "general_rank2_bgnde": s.general_rank2_bgnde.isoformat() if s.general_rank2_bgnde else None,
        "general_rank2_endde": s.general_rank2_endde.isoformat() if s.general_rank2_endde else None,
        "winner_announce_date": s.winner_announce_date.isoformat() if s.winner_announce_date else None,
        "contract_bgnde": s.contract_bgnde.isoformat() if s.contract_bgnde else None,
        "contract_endde": s.contract_endde.isoformat() if s.contract_endde else None,
        "move_in_ym": s.move_in_ym,
        "tot_supply": s.tot_supply,
        "pblanc_url": s.pblanc_url,
        "biz_entity": s.biz_entity,
        "constructor": s.constructor,
        "fetched_at": s.fetched_at.isoformat() if s.fetched_at else None,
    }


# special_by_type JSONB 키 → 한글 라벨 (청약홈 특별공급 8유형, BE 단일 SSOT).
# 키는 mibunyang collect-applyhome-detail.mjs 가 박는 고정 키 (마이그 주석 답습).
# FE 는 본 변환 결과 special_supply_breakdown 리스트만 소비 (raw JSONB 키 해독 불필요).
SPECIAL_TYPE_LABELS = {
    "dazanyeo": "다자녀",
    "sinhon": "신혼부부",
    "saengae_choecho": "생애최초",
    "nobumo": "노부모부양",
    "cheongnyeon": "청년",
    "sinsaenga": "신생아",
    "gigwan": "기관추천",
    "etc": "기타",
}


def _special_breakdown(special_by_type) -> list:
    """special_by_type JSONB(dict) → [{key, label, count}] 리스트 (라벨 순서 고정).

    값 0/None 유형은 제외. 미등록 키는 키 자체를 라벨로 폴백 (신규 유형 추가 시 무손실).
    """
    if not isinstance(special_by_type, dict):
        return []
    out = []
    # 알려진 라벨 순서 우선, 그 다음 미등록 키
    seen = set()
    for key, label in SPECIAL_TYPE_LABELS.items():
        cnt = special_by_type.get(key)
        if cnt:
            out.append({"key": key, "label": label, "count": cnt})
        seen.add(key)
    for key, cnt in special_by_type.items():
        if key not in seen and cnt:
            out.append({"key": key, "label": key, "count": cnt})
    return out


def unit_supply_to_dict(u) -> dict:
    """ApplyhomeUnitSupply ORM → dict (청약홈 평형별 공급정보)"""
    return {
        "id": u.id,
        "apartment_id": u.apartment_id,
        "house_manage_no": u.house_manage_no,
        "model_no": u.model_no,
        "house_ty": u.house_ty,
        "supply_area": u.supply_area,
        "general_supply": u.general_supply,
        "special_supply": u.special_supply,
        "special_by_type": u.special_by_type,
        "special_supply_breakdown": _special_breakdown(u.special_by_type),
        "top_amount": u.top_amount,
    }


def presale_summary(units: list, schedules: list) -> dict:
    """평형별 공급(ApplyhomeUnitSupply) + 일정(PresaleScheduleOfficial) ORM 리스트 →
    분양 상세 요약 집계 (BE 1회 집계 = SSOT).

    FE 합산 위임 금지 (N→1 silent 버그 + 코드중복, domain-mapping-ssot.md 룰2).
    유형별 특공 세대수는 모든 평형의 special_by_type 을 키별 합산.
    """
    total_general = sum((u.general_supply or 0) for u in units)
    total_special = sum((u.special_supply or 0) for u in units)
    top_amounts = [u.top_amount for u in units if u.top_amount is not None]

    # 유형별 특공 세대수 합산 (전 평형 누적)
    type_accum: dict[str, int] = {}
    for u in units:
        sbt = u.special_by_type
        if isinstance(sbt, dict):
            for key, cnt in sbt.items():
                if cnt:
                    type_accum[key] = type_accum.get(key, 0) + int(cnt)
    special_by_type_total = []
    seen = set()
    for key, label in SPECIAL_TYPE_LABELS.items():
        if type_accum.get(key):
            special_by_type_total.append({"key": key, "label": label, "count": type_accum[key]})
        seen.add(key)
    for key, cnt in type_accum.items():
        if key not in seen and cnt:
            special_by_type_total.append({"key": key, "label": key, "count": cnt})

    return {
        "total_general_supply": total_general,
        "total_special_supply": total_special,
        "total_supply": total_general + total_special,
        "special_by_type_total": special_by_type_total,
        "max_top_amount": max(top_amounts) if top_amounts else None,
        "min_top_amount": min(top_amounts) if top_amounts else None,
        "unit_type_count": len(units),
        "schedule_count": len(schedules),
    }
