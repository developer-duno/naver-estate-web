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
