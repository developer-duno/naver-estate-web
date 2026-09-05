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
  /** 청약 경쟁률 (N:1) — mibunyang 수집 */
  competition_rate?: number;
  competition_applicants?: number;
  competition_supply?: number;
  /** 단지 범죄 안전등급 1~5 (낮을수록 안전) */
  crime_safety_grade?: number;
  /** 내진설계 여부 */
  quake_design?: boolean;
  /** 조망 (예: 도시/천변) */
  view?: string;
  /** 주향 (예: 남동) */
  primary_direction?: string;
  /** 난방연료 (예: 도시가스/LPG) */
  heat_fuel?: string;
  /** 복도구조 (계단식/복도식/혼합식) */
  corridor_type?: string;
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
  /** 분양가 수집 기준일 */
  recorded_at?: string;
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
  /** 시세 통계 갱신시각 (신선도) */
  updated_at?: string;
}

/** 시공사 정보 */
export interface MbBuilder {
  name: string;
  debt_ratio?: number;
  credit_grade?: string;
  hug_guarantee?: boolean;
  /** 시공사 정보 갱신시각 (신선도) */
  updated_at?: string;
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
  emergency_updated_at?: string; // V054 순환 키 겸 갱신시각
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
  childcare_updated_at?: string; // V053 순환 키 겸 갱신시각
  /** 범죄통계 (V013) */
  crime_score?: number;
  crime_grade?: string;
  crime_updated_at?: string;
  /** 인프라 데이터 갱신시각 (신선도) */
  updated_at?: string;
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
  /** 학군 데이터 갱신시각 (신선도) */
  updated_at?: string;
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
  /** 교통 데이터 갱신시각 (신선도) */
  updated_at?: string;
}

// ── 분양 (청약홈 공식 데이터) — BE routers/mb_serializers.py 짝꿍 verbatim ──

/** 청약홈 공식 분양 일정 12종 (presale_schedule_to_dict). 차수(house_manage_no)별 1행. */
export interface MbPresaleSchedule {
  id: number;
  apartment_id: string;
  house_manage_no: string;
  pblanc_no?: string | null;
  /** 모집공고일 (ISO date) */
  recruit_date?: string | null;
  special_receipt_bgnde?: string | null;
  special_receipt_endde?: string | null;
  general_rank1_bgnde?: string | null;
  general_rank1_endde?: string | null;
  general_rank2_bgnde?: string | null;
  general_rank2_endde?: string | null;
  winner_announce_date?: string | null;
  contract_bgnde?: string | null;
  contract_endde?: string | null;
  /** 입주예정월 YYYYMM */
  move_in_ym?: string | null;
  tot_supply?: number | null;
  pblanc_url?: string | null;
  biz_entity?: string | null;
  /** 시공사 — BE serializer 키 constructor_name (JS 내장 constructor 충돌 회피). */
  constructor_name?: string | null;
  fetched_at?: string | null;
}

/** 특별공급 유형별 세대수 (BE special_supply_breakdown / special_by_type_total) */
export interface MbSpecialSupplyItem {
  key: string;
  label: string;
  count: number;
}

/** 청약홈 평형별 공급정보 (unit_supply_to_dict). 단지당 평형 1:N. */
export interface MbUnitSupply {
  id: number;
  apartment_id: string;
  house_manage_no: string;
  model_no: string;
  house_ty?: string | null;
  /** 공급면적 ㎡ */
  supply_area?: number | null;
  general_supply?: number | null;
  special_supply?: number | null;
  /** raw JSONB (FE 는 breakdown 사용 권장) */
  special_by_type?: Record<string, number> | null;
  /** 한글 라벨 변환 리스트 (값 0 유형 제외) */
  special_supply_breakdown: MbSpecialSupplyItem[];
  /** 분양최고금액 (만원) */
  top_amount?: number | null;
}

/** 분양 상세 요약 집계 (BE presale_summary — FE 합산 금지) */
export interface MbPresaleSummary {
  total_general_supply: number;
  total_special_supply: number;
  total_supply: number;
  special_by_type_total: MbSpecialSupplyItem[];
  max_top_amount?: number | null;
  min_top_amount?: number | null;
  unit_type_count: number;
  schedule_count: number;
}

/** 분양 상세 = MbApartment + 부속 (get_presale_detail 응답) */
export interface MbPresaleDetail extends MbApartment {
  schedules: MbPresaleSchedule[];
  unit_supplies: MbUnitSupply[];
  presale_summary: MbPresaleSummary;
  trade_stats?: MbTradeStats;
  infra?: MbInfra;
  school?: MbSchool;
  transport?: MbTransport;
  builder_info?: MbBuilder;
}

/** 오피스텔·민간임대 청약 목록 항목 (get_officetel_rental 응답, 이슈 #323).
 * kind 로 오피스텔(apartments 연결)/민간임대(독립)를 구분 — BE presale_schedule_to_dict
 * /rental_schedule_to_dict 짝꿍(routers/mb_serializers.py). */
export interface MbOfficetelRentalItem {
  kind: "officetel" | "rental";
  house_manage_no: string;
  pblanc_no?: string | null;
  /** officetel·rental 둘 다 NOT NULL 컬럼(V045 완전 분리 테이블·V041 rental 선례) —
   * apartments 로스터 매칭이 애초에 필요 없어 apartment_id/apartment_name 이 없다. */
  house_nm: string;
  address?: string | null;
  recruit_date?: string | null;
  /** kind="officetel" 전용 — 특별공급 접수기간 */
  special_receipt_bgnde?: string | null;
  special_receipt_endde?: string | null;
  /** kind="officetel" 전용 — 1순위 접수기간 */
  general_rank1_bgnde?: string | null;
  general_rank1_endde?: string | null;
  /** kind="officetel" 전용 — 2순위 접수기간 */
  general_rank2_bgnde?: string | null;
  general_rank2_endde?: string | null;
  /** kind="officetel" 전용 — 계약기간 */
  contract_bgnde?: string | null;
  contract_endde?: string | null;
  /** kind="rental" 전용 — 접수기간 */
  receipt_bgnde?: string | null;
  receipt_endde?: string | null;
  winner_announce_date?: string | null;
  move_in_ym?: string | null;
  tot_supply?: number | null;
  pblanc_url?: string | null;
  biz_entity?: string | null;
  constructor_name?: string | null;
  region_code?: string | null;
  /** kind="officetel" 전용 — 청약 지역명(SUBSCRPT_AREA_CODE_NM, V045). BE region 필터는
   * 구현 완료(세션382/384, get_officetel_schedules()/get_rental_schedules() 참조) —
   * FE 는 아직 이 필드로 필터 UI 를 만들지 않아 타입 계약만 유지(화면 렌더 없음). */
  region_name?: string | null;
  fetched_at?: string | null;
}
