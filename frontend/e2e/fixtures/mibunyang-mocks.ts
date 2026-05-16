import type { Page, Route } from "@playwright/test";
import type { MbApartment, MbUnsoldHistory } from "../../src/types";

const APARTMENT: MbApartment = {
  id: "test-apt-001",
  name: "테스트미분양단지",
  region: "경기도",
  gu: "고양시",
  dong: "식사동",
  address: "경기도 고양시 일산동구 식사동 123",
  road_address: "경기도 고양시 일산동구 식사로 45",
  // latitude/longitude 의도적으로 omit → 지도 섹션 미렌더 (Naver Maps SDK 결정성 회피)
  builder: "테스트건설",
  units: 480,
  unsold: 35,
  unsold_rate: 7.3,
  completion: "202512",
  heating: "지역난방",
  max_floor: 29,
  parking_ratio: 1.3,
  floor_area_ratio: 230,
  building_coverage_ratio: 19,
  discount_pct: 10,
  balcony_free: true,
  option_free: false,
  cashback: 5000,
  presale_min_price: 48000,
  presale_max_price: 72000,
  presale_pp: 2100,
  presale_type: "분양",
  presale_stage: "3순위",
  presale_move_in: "202601",
  naver_nearby_median: 65000,
  naver_jeonse_rate: 0.58,
  naver_sell_count: 12,
  naver_build_year: 2020,
  naver_school_walk_min: 7,
  is_regulated: false,
  builder_info: {
    name: "테스트건설",
    debt_ratio: 180,
    credit_grade: "A",
    hug_guarantee: true,
  },
  infra: {
    hospital: 3,
    hospital_dist: 850,
    mart: 2,
    mart_dist: 420,
    conv: 8,
    conv_dist: 150,
    bank: 4,
    bank_dist: 380,
    pharmacy: 5,
    pharmacy_dist: 210,
    park: 2,
    park_dist: 620,
    subway_dist: 1200,
  },
  school: {
    school_score: 72,
    school_grade: "B",
  },
  transport: {
    bus_routes: 15,
    subway_dist: 1200,
    subway_name: "식사역",
    subway_lines: "GTX-A",
  },
  trade_stats: {
    apartment_id: "test-apt-001",
    nearby_median: 65000,
    recent_trades_6m: 8,
    jeonse_rate: 0.58,
    pir: 12.4,
    psr: 0.85,
    avg_floor: 15,
    floor_range: "3~29",
    cancel_ratio_6m: 0.12,
  },
  prices: [
    {
      id: 1,
      apartment_id: "test-apt-001",
      area: 59.5,
      supply_area: 84.8,
      price: 48000,
      pp: 1800,
      house_type: "59A",
      supply_count: 120,
    },
    {
      id: 2,
      apartment_id: "test-apt-001",
      area: 84.8,
      supply_area: 114.6,
      price: 72000,
      pp: 2100,
      house_type: "84A",
      supply_count: 240,
    },
  ],
};

const UNSOLD_HISTORY: MbUnsoldHistory[] = [
  { id: 1, apartment_id: "test-apt-001", base_month: "202506", unsold_count: 80, post_completion_unsold: 0, change: 0 },
  { id: 2, apartment_id: "test-apt-001", base_month: "202507", unsold_count: 72, post_completion_unsold: 0, change: -8 },
  { id: 3, apartment_id: "test-apt-001", base_month: "202508", unsold_count: 60, post_completion_unsold: 0, change: -12 },
  { id: 4, apartment_id: "test-apt-001", base_month: "202509", unsold_count: 52, post_completion_unsold: 0, change: -8 },
  { id: 5, apartment_id: "test-apt-001", base_month: "202510", unsold_count: 45, post_completion_unsold: 0, change: -7 },
  { id: 6, apartment_id: "test-apt-001", base_month: "202511", unsold_count: 40, post_completion_unsold: 0, change: -5 },
  { id: 7, apartment_id: "test-apt-001", base_month: "202512", unsold_count: 35, post_completion_unsold: 0, change: -5 },
];

async function fulfillJson(route: Route, body: unknown): Promise<void> {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

export async function applyMibunyangDetailMocks(page: Page): Promise<void> {
  await page.route("**/api/mb/apartments/**", async (route) => {
    const url = new URL(route.request().url());
    const parts = url.pathname.split("/").filter(Boolean);
    // /api/mb/apartments/{id}
    if (parts[3]) return fulfillJson(route, APARTMENT);
    await route.fulfill({ status: 404, body: "not found" });
  });

  await page.route("**/api/mb/unsold/**", async (route) => {
    const url = new URL(route.request().url());
    const parts = url.pathname.split("/").filter(Boolean);
    // /api/mb/unsold/{id}/history
    if (parts[4] === "history") {
      return fulfillJson(route, { apartment_id: parts[3], items: UNSOLD_HISTORY });
    }
    await route.fulfill({ status: 404, body: "not found" });
  });

  // Header role 결정성 — 147 답습 (98f1f94). 공개 페이지이므로 role="user".
  await page.route("**/api/users/me", async (route) => {
    await fulfillJson(route, { role: "user", email: "test@example.com" });
  });
  await page.route("**/rest/v1/user_profiles**", async (route) => {
    await fulfillJson(route, [{ role: "user" }]);
  });
}
