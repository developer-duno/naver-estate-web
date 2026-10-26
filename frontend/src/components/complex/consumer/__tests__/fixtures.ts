/**
 * 소비자 화면 시험 자료 — 설계서 예시값(단지 6139 「자연」 59㎡, 대전 유성구)을 본뜬 **가짜 자료**(세션 482 PR 1b).
 * 실제 운영 값을 복사한 것이 아니다. 시험 기대값: 1억 5,700만~1억 8,000만 · 3건 · 2년 1억 4,700만~2억 ·
 * 공시 1억 1,300만 "63~72%" · 관리비 약 19만 원 · 유성구 비규제 70% = 1억 990만.
 */
import type {
  Complex,
  KaptInfo,
  NeighborhoodInfo,
  OfficialPriceResponse,
  PublicPriceHistory,
  RegionTrend,
  SubwayNearResponse,
} from "@/types";

export const END_YM = "202610";

export function makeComplex(overrides: Partial<Complex> = {}): Complex {
  return {
    complex_no: "6139",
    complex_name: "자연",
    cortar_no: "3020012300",
    real_estate_type_name: "아파트",
    sido: "대전",
    sigungu: "유성구",
    address: "대전 유성구 봉명동",
    use_approve_ymd: "19970101",
    total_household_count: 199,
    total_dong_count: 1,
    rep_area_m2: 59,
    region_name: "유성구",
    area_price_range_source: "정부 실거래 최근 6개월 최저~최고(중개거래 기준), 전용 59㎡ 대는 소수점을 버린 같은 크기끼리",
    area_prices: [
      { area_m2: 59, households: 116, price_median: 17200, trade_count: 3, price_min: 15700, price_max: 18000, trades: [] },
      { area_m2: 84, households: 71, price_median: 22500, trade_count: 2, price_min: 22000, price_max: 23000, trades: [] },
      { area_m2: 42, households: 12, price_median: null, trade_count: null, price_min: null, price_max: null, trades: [] },
    ],
    ...overrides,
  };
}

export function makeHistory(area = 59): PublicPriceHistory {
  return {
    area_m2: area,
    months: [
      { month: "202411", trade_count: 2, price_min: 15200, price_max: 18000, price_median: 16000 },
      { month: "202512", trade_count: 1, price_min: 14700, price_max: 14700, price_median: 14700 },
      { month: "202602", trade_count: 1, price_min: 16000, price_max: 16000, price_median: 16000 },
      { month: "202604", trade_count: 2, price_min: 16500, price_max: 17000, price_median: 16700 },
      { month: "202605", trade_count: 2, price_min: 17500, price_max: 20000, price_median: 18000 },
      { month: "202606", trade_count: 2, price_min: 15700, price_max: 17200, price_median: 16500 },
      { month: "202607", trade_count: 2, price_min: 16000, price_max: 16500, price_median: 16200 },
    ],
    two_year: { min: 14700, max: 20000, count: 12 },
    basis: `최근 2년 전용 ${area}㎡ 대 정부 실거래 최저~최고(달마다 직거래 제외) · 국토교통부 실거래`,
  };
}

export function makeTrend(): RegionTrend {
  const items = Array.from({ length: 24 }, (_, i) => {
    const t = 2024 * 12 + 9 + i; // 202410 부터
    return {
      period: `${Math.floor(t / 12)}${String((t % 12) + 1).padStart(2, "0")}`,
      jeonse_ratio: i === 0 ? 69.2 : i === 23 ? 69.5454 : 68 + (i % 3),
      sale_price_median: i === 0 ? 40000 : i === 23 ? 40600 : 39500 + i * 20,
    };
  });
  return { region_code: "30200", region_name: "유성구", source: "한국부동산원 전국주택가격동향조사", items };
}

export const OFFICIAL: OfficialPriceResponse = {
  complex_no: "6139",
  year: "2026",
  items: [
    { prvuse_ar: 59.9, price_median: 113_000_000, ho_count: 116 },
    { prvuse_ar: 84.9, price_median: 160_000_000, ho_count: 71 },
  ],
};

export const KAPT: KaptInfo = {
  kapt_code: "A1",
  kapt_name: "자연",
  corridor_type: "계단식",
  cost_month: "202607",
  common_cost: null,
  individual_cost: null,
  total_cost: null,
  cost_per_household: 190_000,
  household_count: 199,
};

export const SUBWAY: SubwayNearResponse = {
  stations: [
    { station_name: "갑천", lines: ["대전1호선"], distance_m: 1100 },
    { station_name: "유성온천", lines: ["대전1호선"], distance_m: 1400 },
    { station_name: "월평", lines: ["대전1호선"], distance_m: 1420 },
  ],
};

export const HOOD: NeighborhoodInfo = {
  emd_cd: "3020054000",
  emd_nm: "온천2동",
  year: 2024,
  population: 54325,
  avg_age: 36.2,
  one_person_pct: 55,
  households: 30000,
  house_mix: { apt_pct: 40, officetel_pct: 1, row_pct: 2, detached_pct: 52 },
  old_house_pct: 56,
  old_house_cutoff: "2004년 이전",
  corp_cnt: 4819,
  worker_cnt: 20000,
  broker_pct: null,
  flood: { affected: true, pop: 100 },
  landslide: { affected: true, pop: 10 },
  source: "국가데이터처 SGIS 센서스 2024 (온천2동 기준)",
};
