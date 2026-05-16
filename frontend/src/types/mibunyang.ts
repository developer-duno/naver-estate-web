/** 미분양 아파트 */
export interface MbApartment {
  id: string;
  name: string;
  region: string;
  gu?: string;
  dong?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  builder?: string;
  units?: number;
  unsold?: number;
  unsold_rate?: number;
  completion?: string;
  heating?: string;
  max_floor?: number;
  parking_ratio?: number;
  floor_area_ratio?: number;
  building_coverage_ratio?: number;
  /** 전용률 (%) — 공급면적 대비 전용면적 비율 */
  exclusive_ratio?: number;
  discount_pct?: number;
  balcony_free?: boolean;
  option_free?: boolean;
  cashback?: number;
  benefits?: Record<string, unknown>;
  presale_min_price?: number;
  presale_max_price?: number;
  presale_pp?: number;
  presale_type?: string;
  presale_stage?: string;
  presale_move_in?: string;
  naver_nearby_median?: number;
  naver_jeonse_rate?: number;
  naver_sell_count?: number;
  naver_build_year?: number;
  /** 학교 도보 시간 (분) — 네이버 연동, 가까울수록 좋음 */
  naver_school_walk_min?: number;
  is_regulated?: boolean;
  noise?: number;
  /** 가장 가까운 유해시설까지 거리 (m) — 멀수록 좋음 */
  noxious_dist?: number;
  road_address?: string;
  district?: string;
  /** 세대당 월 관리비 합산 (만원) */
  avg_maintenance_cost?: number;
  /** 관리비 5 항목 분리 (mibunyang W3, 2026-05-13 동기화) */
  maint_heat?: number;
  maint_hotwater?: number;
  maint_gas?: number;
  maint_elec?: number;
  maint_water?: number;
  created_at?: string;
  updated_at?: string;
  trade_stats?: MbTradeStats;
  infra?: MbInfra;
  school?: MbSchool;
  transport?: MbTransport;
  prices?: MbPrice[];
  builder_info?: MbBuilder;
}

/** 미분양 추이 */
export interface MbUnsoldHistory {
  id: number;
  apartment_id: string;
  base_month: string;
  unsold_count?: number;
  post_completion_unsold?: number;
  change?: number;
  recorded_at?: string;
}

/** 지역 통계 */
export interface MbRegion {
  id: number;
  region: string;
  gu?: string;
  population?: number;
  households?: number;
  regional_unsold?: number;
  pop_growth?: number;
  avg_income?: number;
  supply_ratio?: number;
  jeonse_rate?: number;
  avg_price?: number;
  avg_price_sqm?: number;
  net_migration?: number;
  price_index?: number;
  new_supply?: number;
  initial_sale_rate?: number;
  land_cost_ratio?: number;
  recorded_at?: string;
}

/** 실거래 내역 */
export interface MbTrade {
  id: number;
  region: string;
  gu?: string;
  dong?: string;
  deal_month?: string;
  area?: number;
  price?: number;
  floor?: number;
  build_year?: number;
  trade_type?: string;
  deposit?: number;
  apt_name?: string;
  cancel_date?: string;
  dealing_type?: string;
}

/** 분양가 */
export interface MbPrice {
  id: number;
  apartment_id: string;
  area?: number;
  supply_area?: number;
  price?: number;
  pp?: number;
  house_type?: string;
  supply_count?: number;
}

/** 거래 통계 */
export interface MbTradeStats {
  apartment_id: string;
  nearby_median?: number;
  recent_trades_6m?: number;
  jeonse_rate?: number;
  pir?: number;
  psr?: number;
  price_by_area?: Record<string, unknown>;
  rent_by_area?: Record<string, unknown>;
  jeonse_by_area?: Record<string, unknown>;
  price_by_floor?: Record<string, unknown>;
  avg_floor?: number;
  floor_range?: string;
  cancel_ratio_6m?: number;
}

/** 시공사 정보 */
export interface MbBuilder {
  name: string;
  debt_ratio?: number;
  credit_grade?: string;
  hug_guarantee?: boolean;
}

/** 인프라 정보 */
export interface MbInfra {
  hospital?: number;
  hospital_dist?: number;
  mart?: number;
  mart_dist?: number;
  conv?: number;
  conv_dist?: number;
  cafe?: number;
  cafe_dist?: number;
  culture?: number;
  culture_dist?: number;
  bank?: number;
  bank_dist?: number;
  pharmacy?: number;
  pharmacy_dist?: number;
  park?: number;
  park_dist?: number;
  subway_dist?: number;
  /** 응급의료기관 (V012) */
  emergency_hospital?: number;
  emergency_hospital_dist?: number;
  emergency_beds?: number;
  emergency_level?: string;
  /** 응급의료기관 시설명/분류 (mibunyang W4, 2026-05-13 동기화) */
  emergency_name?: string;
  emergency_type?: string;
  /** 대기질 — 에어코리아 (V012) */
  air_station_name?: string;
  air_station_dist?: number;
  air_pm10?: number;
  air_pm25?: number;
  air_o3?: number;
  air_grade?: string;
  air_updated_at?: string;
  /** 어린이집 (V013 + V019 type/teachers) */
  childcare_count?: number;
  childcare_nearest_dist?: number;
  childcare_nearest_name?: string;
  childcare_nearest_capacity?: number;
  childcare_nearest_type?: string;
  childcare_nearest_teachers?: number;
  /** 범죄통계 (V013) */
  crime_score?: number;
  crime_grade?: string;
  crime_updated_at?: string;
}

/** 학군 정보 — 단지 주변 학교 목록 */
export interface MbNearbySchool {
  name: string;
  type?: string;
  distance?: number;
  students?: number;
  classes?: number;
}

export interface MbSchool {
  school_score?: number;
  school_grade?: string;
  nearby_schools?: MbNearbySchool[];
}

/** 교통 정보 */
export interface MbTransport {
  bus_routes?: number;
  ic_dist?: number;
  ktx_dist?: number;
  subway_dist?: number;
  subway_name?: string;
  subway_lines?: string;
  bus_stop_names?: string;
}
