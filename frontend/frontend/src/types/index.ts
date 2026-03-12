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
  last_crawled_at?: string;
  article_count?: number;
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
}

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
  sort_by?: string;
  page?: number;
  page_size?: number;
}

/** DB 통계 */
export interface DbStats {
  complex_count: number;
  article_count: number;
}

/** 지역 구조: {시도: {시군구: [동, ...]}} */
export type Regions = Record<string, Record<string, string[]>>;
