export * from "./estate";

export * from "./analytics";

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
