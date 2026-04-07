/** 단지 정보 */
export interface Complex {
  complex_no: string;
  complex_name: string;
  cortar_no?: string;
  real_estate_type_code?: string;
  real_estate_type_name?: string;
  latitude?: number;
  longitude?: number;
  total_household_count?: number;
  high_floor?: number;
  low_floor?: number;
  use_approve_ymd?: string;
  total_dong_count?: number;
  min_supply_area_m2?: number;
  max_supply_area_m2?: number;
  cortar_address?: string;
  sido?: string;
  sigungu?: string;
  dong?: string;
  heat_method_type?: string;
  total_parking_count?: number;
  construction_company?: string;
  floor_area_ratio?: string;
  building_coverage_ratio?: string;
  address?: string;
  road_address?: string;
  heat_fuel_type?: string;
  parking_count_by_household?: number;
  management_office_tel?: string;
  last_crawled_at?: string;
  detail_crawled_at?: string;
  article_count?: number;
  nearby_median_price?: number;
  jeonse_rate?: number;
  recent_trades_6m?: number;
  filter_options?: FilterOptions;
  has_pool?: boolean;
}

/** 매물 정보 */
export interface Article {
  article_no: string;
  complex_no: string;
  trade_type_name?: string;
  building_name?: string;
  floor_info?: string;
  deal_or_warrant_prc?: string;
  rent_prc?: string;
  area1_m2?: number;
  area2_m2?: number;
  area2_pyeong?: number;
  direction?: string;
  article_feature_desc?: string;
  tags?: string[];
  realtor_name?: string;
  article_confirm_ymd?: string;
  complex_name?: string;
  numeric_price?: number;
  numeric_rent_price?: number;
  price_per_pyeong?: number;
  room_count?: number;
  bathroom_count?: number;
  move_in_date?: string;
  maintenance_cost?: string;
  numeric_maintenance_cost?: number;
  heating_type?: string;
  total_floor_count?: number;
  jibun_address?: string;
  detail_description?: string;
  photo_urls?: string[];
  representative_img_url?: string;
  realtor_phone_display?: string;
  realtor_address?: string;
  parking_count?: string;
  acquisition_tax?: string;
  broker_fee?: string;
  latitude?: number;
  longitude?: number;
  is_verified?: boolean;
  is_presale?: boolean;
  detail_crawled?: boolean;
  use_approve_ymd?: string;
  article_name?: string;
  first_seen_at?: string;
  last_seen_at?: string;
  previous_price?: number;
  price_changed_at?: string;
  total_household_count?: number;
  complex_address?: string;
  article_real_estate_type_name?: string;
  realtor_id?: string;
  realtor_phone?: string;
}

/** 매물 가격 변동 이력 항목 */
export interface ArticlePriceHistoryItem {
  price: number | null;
  rent_price: number | null;
  recorded_at: string | null;
}

/** 면적별 상세 */
export interface PyeongDetail {
  pyeong_no: number;
  pyeong_name?: string;
  supply_area?: string;
  supply_area_double?: number;
  exclusive_area?: string;
  exclusive_rate?: string;
  household_count_by_pyeong?: string;
  entrance_type?: string;
  room_count?: number;
  bathroom_count?: number;
  avg_maintenance_cost?: number;
  summer_maintenance_cost?: number;
  winter_maintenance_cost?: number;
  floor_plan_url?: string;
  supply_pyeong?: string;
  exclusive_pyeong?: string;
  latest_maintenance_cost?: number;
  maintenance_cost_basis?: string;
}

/** 정렬 옵션 (백엔드 Literal과 동기화) */
export type SortBy = "rank" | "price_asc" | "price_desc" | "area_asc" | "area_desc" | "ppyeong_asc" | "ppyeong_desc" | "maintenance_asc" | "maintenance_desc" | "confirm_asc" | "confirm_desc";

/** 필터 옵션 */
export interface ArticleFilters {
  trade_types?: string;
  min_price?: number;
  max_price?: number;
  min_rent?: number;
  max_rent?: number;
  min_area_m2?: number;
  max_area_m2?: number;
  min_rooms?: number;
  min_baths?: number;
  direction?: string;
  min_ppyeong?: number;
  max_ppyeong?: number;
  min_maintenance?: number;
  max_maintenance?: number;
  building_name?: string;
  verified_only?: boolean;
  max_building_age?: number;
  move_in_type?: string;
  estate_type?: string;
  min_floor?: number;
  max_floor?: number;
  tags?: string;
  selected_articles?: string;
  sort_by?: SortBy;
  page?: number;
  page_size?: number;
}

/** 필터 옵션 (단지별 동적 값) */
export interface FilterOptions {
  building_names: string[];
  tags: string[];
  directions: string[];
}

/** DB 통계 */
export interface DbStats {
  complex_count: number;
  article_count: number;
}

/** 지역 구조: {시도: {시군구: [동, ...]}} */
export type Regions = Record<string, Record<string, string[]>>;

/** 면적별 가격 통계 — 거래유형별 평균가 */
export interface AreaPriceStat {
  label: string;
  maemae?: number;
  jeonse?: number;
  wolse?: number;
  maemae_count?: number;
  jeonse_count?: number;
  wolse_count?: number;
}

/** 층수별 가격 통계 — 거래유형별 min/avg/max */
export interface FloorPriceStat {
  label: string;
  maemae_avg?: number; maemae_min?: number; maemae_max?: number; maemae_count?: number;
  jeonse_avg?: number; jeonse_min?: number; jeonse_max?: number; jeonse_count?: number;
  wolse_avg?: number;  wolse_min?: number;  wolse_max?: number;  wolse_count?: number;
}

/** @deprecated 단일 거래유형 통계 (PriceChartInner 내부용) */
export interface PriceStat {
  label: string;
  min: number;
  avg: number;
  max: number;
  median: number;
  count: number;
}

export interface PriceStats {
  complex_no: string;
  total_articles: number;
  by_area: AreaPriceStat[];
  by_floor: FloorPriceStat[];
}

/** 단지 가격 추이 항목 */
export interface PriceHistoryItem {
  trade_type: string;
  trade_type_label: string;
  price_upper: number | null;
  price_lower: number | null;
  price_avg: number | null;
  base_month: string;
}

/** 단지 가격 추이 응답 */
export interface PriceHistoryResponse {
  complex_no: string;
  items: PriceHistoryItem[];
}

/** 실거래가 수집 진행 상태 */
export interface PriceCollectProgress {
  complex_no: string;
  status: "idle" | "running" | "done" | "error" | "fresh";
  collected?: number;
  failed?: number;
  total?: number;
  error?: string;
}

/** 크롤링 진행 상태 */
export interface CrawlProgress {
  complex_no: string;
  status: "idle" | "started" | "running" | "done" | "done_partial" | "error" | "cached" | "already_running";
  phase?: "articles" | "enriching" | "details";
  current_page?: number;
  article_count?: number;
  has_more?: boolean;
  error?: string;
  detail_phase?: "running" | "done" | null;
  detail_crawled_count?: number;
  detail_total?: number;
  detail_skipped_count?: number;
}

// ── 미분양 (mibunyang) ──

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
  is_regulated?: boolean;
  road_address?: string;
  district?: string;
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
  net_migration?: number;
  price_index?: number;
  new_supply?: number;
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
  /** 대기질 — 에어코리아 (V012) */
  air_station_name?: string;
  air_station_dist?: number;
  air_pm10?: number;
  air_pm25?: number;
  air_o3?: number;
  air_grade?: string;
  air_updated_at?: string;
  /** 어린이집 (V013) */
  childcare_count?: number;
  childcare_nearest_dist?: number;
  childcare_nearest_name?: string;
  childcare_nearest_capacity?: number;
  /** 범죄통계 (V013) */
  crime_score?: number;
  crime_grade?: string;
  crime_updated_at?: string;
}

/** 학군 정보 */
export interface MbSchool {
  school_score?: number;
  school_grade?: string;
  nearby_schools?: Record<string, unknown>;
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
