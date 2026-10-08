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

/** 단지 공동주택 공시가격 평형별 항목 */
export interface OfficialPriceItem {
  prvuse_ar: number;
  price_median: number;
  ho_count: number;
}

/** 단지 공동주택 공시가격 응답 (무료 공개, 게이트 없음) */
export interface OfficialPriceResponse {
  complex_no: string;
  year: string | null;
  items: OfficialPriceItem[];
}

/**
 * 단지 인근 지하철역 1건.
 * lines = 환승역의 전 노선 (BE 가 역명으로 그룹핑해 배열로 내려줌).
 */
export interface SubwayStationNear {
  station_name: string;
  lines: string[];
  distance_m: number;
}

/** 단지 인근 지하철역 응답 — 거리 오름차순 최대 3개, 3km 이내. 없으면 stations: [] */
export interface SubwayNearResponse {
  stations: SubwayStationNear[];
}

/**
 * 단지 공동주택 관리비 (K-apt, GET /api/complexes/{no}/kapt).
 *
 * 전국 6.4만 단지 중 K-apt 의무관리단지(~1.5만)만 데이터가 존재한다 — 매칭·관리비가
 * 없으면 BE 가 404 로 응답하므로 **404 는 다수의 정상 케이스**이고, FE 래퍼는 이를
 * null 로 변환한다 (getComplexKapt 주석 참조).
 *
 * 금액 단위는 **원**(won) — 화면 표시 시 만원 환산이 필요하다.
 */
export interface KaptInfo {
  kapt_code: string;
  kapt_name: string;
  /** 복도유형 (계단식·복도식·혼합식 등). 미상이면 null */
  corridor_type: string | null;
  /** 관리비 기준월 YYYYMM */
  cost_month: string;
  /** 공용관리비 총액 (원) */
  common_cost: number | null;
  /** 개별사용료 총액 (원) */
  individual_cost: number | null;
  /** 관리비 총액 (원) */
  total_cost: number | null;
  /** 세대당 관리비 (원) */
  cost_per_household: number | null;
  household_count: number | null;
}

/** 동네 재해 위험지도 요약 — 영향 없음이면 `{ affected: false }` 만 온다 */
export interface NeighborhoodDisaster {
  affected: boolean;
  /** 동네 안 영향 구역에 사는 사람 수 */
  pop?: number | null;
  /** 동네 전체 사람 수 */
  pop_total?: number | null;
  year?: number | null;
}

/**
 * 단지가 속한 행정동의 동네 통계 (SGIS, GET /api/complexes/{no}/neighborhood).
 *
 * 단지의 행정동 매핑이나 그 동의 총인구 행이 없으면 BE 가 404 → FE 래퍼가 null 로 변환한다.
 * 값이 없는 칸은 null — 화면은 그 줄을 생략한다. 비율(%)은 서버가 반올림한 값을 그대로 쓴다.
 */
export interface NeighborhoodInfo {
  emd_cd: string;
  /** 행정동 이름 (출처 줄의 "(역삼1동 기준)"). 없으면 null */
  emd_nm: string | null;
  year: number;
  population: number | null;
  avg_age: number | null;
  one_person_pct: number | null;
  households: number | null;
  /** 1인가구 수 — 응답에 없을 수도 있다 */
  one_person_households?: number | null;
  /** 집 종류 비율 (분모 = 거처 전체) */
  house_mix: {
    apt_pct: number;
    officetel_pct: number;
    row_pct: number;
    detached_pct: number;
  } | null;
  old_house_pct: number | null;
  /** 오래된 집 기준 문구 (예: "2004년 이전") */
  old_house_cutoff: string;
  corp_cnt: number | null;
  worker_cnt: number | null;
  /** 화면에는 쓰지 않는다 */
  broker_pct: number | null;
  flood: NeighborhoodDisaster | null;
  landslide: NeighborhoodDisaster | null;
  source: string;
}
