import type { Page } from "@playwright/test";
import type { Complex, PriceStats, PriceHistoryResponse, PyeongDetail } from "../../src/types";

const COMPLEX_A: Complex = {
  complex_no: "100000",
  complex_name: "테스트단지A",
  real_estate_type_name: "아파트",
  cortar_address: "서울시 강남구 역삼동",
  road_address: "서울시 강남구 테헤란로 100",
  total_household_count: 520,
  total_dong_count: 6,
  low_floor: 3,
  high_floor: 25,
  use_approve_ymd: "20100315",
  min_supply_area_m2: 59.5,
  max_supply_area_m2: 84.8,
  total_parking_count: 780,
  parking_count_by_household: 1.5,
  heat_method_type: "지역난방",
  heat_fuel_type: "열병합",
  construction_company: "A건설",
  floor_area_ratio: "250%",
  building_coverage_ratio: "18%",
  article_count: 42,
  nearby_median_price: 120000,
  jeonse_rate: 62, // BE 저장 단위 = 퍼센트 (세션278 H2) — 옛 칸, 화면은 아래 범위 칸을 읽는다(세션 489 B29)
  recent_trades_6m: 12,
  // 대표 면적 단지(세션 479 B29 · 489 PR b2) — 최저~최고 + (N건) N = 거래 목록 길이 · 전세가율 범위
  rep_area_m2: 84,
  price_basis: "rep_area",
  area_prices: [
    {
      area_m2: 84, households: 300, price_median: 120000, trade_count: 3, price_min: 115000, price_max: 128000,
      trades: [
        { price: 128000, date: "2026-07-18", floor: 21, direct: false },
        { price: 99000, date: "2026-06-30", floor: 2, direct: true },
        { price: 115000, date: "2026-06-02", floor: 7, direct: false },
      ],
    },
  ],
  jeonse_rate_min: 58.6,
  jeonse_rate_max: 65.2,
  area_price_range_source: "정부 실거래 최근 6개월 최저~최고(중개거래 기준), 전용 84㎡ 대는 소수점을 버린 같은 크기끼리 · 전세가율 = 네이버 전세 시세(같은 면적, 최신 주) ÷ 정부 실거래 최저~최고",
  legacy_range: null,
  has_pool: false,
  management_office_tel: "02-555-1234",
};

const COMPLEX_B: Complex = {
  complex_no: "200000",
  complex_name: "테스트단지B",
  real_estate_type_name: "아파트",
  cortar_address: "서울시 서초구 반포동",
  road_address: "서울시 서초구 반포대로 200",
  total_household_count: 340,
  total_dong_count: 4,
  low_floor: 2,
  high_floor: 18,
  use_approve_ymd: "20160820",
  min_supply_area_m2: 84.8,
  max_supply_area_m2: 114.6,
  total_parking_count: 500,
  parking_count_by_household: 1.4,
  heat_method_type: "개별난방",
  heat_fuel_type: "도시가스",
  construction_company: "B건설",
  floor_area_ratio: "220%",
  building_coverage_ratio: "20%",
  article_count: 28,
  nearby_median_price: 180000,
  jeonse_rate: 55, // BE 저장 단위 = 퍼센트 (세션278 H2) — 옛 칸
  recent_trades_6m: 7,
  // 옛 값 단지(대표 면적 없음, 세션 479 B29 A') — 마지막 정부 섞인 줄 범위 + 그 달 · 전세가율 비움
  rep_area_m2: null,
  price_basis: "legacy_mixed",
  area_prices: [],
  jeonse_rate_min: null,
  jeonse_rate_max: null,
  area_price_range_source: null,
  legacy_range: { lower: 170000, upper: 186000, month: "202503" },
  has_pool: true,
  management_office_tel: "02-555-5678",
};

const EMPTY_STATS = (id: string): PriceStats => ({
  complex_no: id,
  total_articles: 0,
  by_area: [],
  by_floor: [],
});

const STATS_A: PriceStats = {
  complex_no: "100000",
  total_articles: 42,
  by_area: [
    { label: "59m²", maemae: 95000, jeonse: 58000, maemae_count: 8, jeonse_count: 5 },
    { label: "84m²", maemae: 130000, jeonse: 80000, maemae_count: 12, jeonse_count: 7 },
  ],
  by_floor: [
    { label: "저층", maemae_avg: 100000, maemae_min: 90000, maemae_max: 110000, maemae_count: 5 },
    { label: "고층", maemae_avg: 135000, maemae_min: 120000, maemae_max: 150000, maemae_count: 8 },
  ],
};

const STATS_B: PriceStats = {
  complex_no: "200000",
  total_articles: 28,
  by_area: [
    { label: "84m²", maemae: 180000, jeonse: 100000, maemae_count: 6, jeonse_count: 3 },
    { label: "114m²", maemae: 240000, jeonse: 130000, maemae_count: 4, jeonse_count: 2 },
  ],
  by_floor: [
    { label: "저층", maemae_avg: 170000, maemae_min: 160000, maemae_max: 185000, maemae_count: 3 },
    { label: "고층", maemae_avg: 230000, maemae_min: 210000, maemae_max: 250000, maemae_count: 5 },
  ],
};

const EMPTY_HISTORY = (id: string): PriceHistoryResponse => ({
  complex_no: id,
  items: [],
  basis_range: null,
});

const EMPTY_PYEONG: { pyeong_details: PyeongDetail[] } = { pyeong_details: [] };

async function fulfillJson(route: import("@playwright/test").Route, body: unknown) {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

export async function applyCompareMocks(page: Page): Promise<void> {
  await page.route("**/api/complexes/**", async (route) => {
    const url = new URL(route.request().url());
    const parts = url.pathname.split("/").filter(Boolean);
    const id = parts[2];
    const sub = parts[3];

    if (sub === "price-stats") {
      if (id === "100000") return fulfillJson(route, STATS_A);
      if (id === "200000") return fulfillJson(route, STATS_B);
      return fulfillJson(route, EMPTY_STATS(id));
    }
    if (sub === "price-history") return fulfillJson(route, EMPTY_HISTORY(id));
    if (sub === "pyeong-details") return fulfillJson(route, EMPTY_PYEONG);
    if (!sub) {
      if (id === "100000") return fulfillJson(route, COMPLEX_A);
      if (id === "200000") return fulfillJson(route, COMPLEX_B);
    }
    await route.fulfill({ status: 404, body: "not found" });
  });
}
