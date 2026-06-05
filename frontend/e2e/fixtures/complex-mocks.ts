import type { Page, Route } from "@playwright/test";
import type { Article, Complex, CrawlProgress, PriceCollectProgress, PriceHistoryResponse, PriceStats, PyeongDetail } from "../../src/types";

const COMPLEX: Complex = {
  complex_no: "100000",
  complex_name: "테스트단지",
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
  article_count: 2,
  nearby_median_price: 120000,
  jeonse_rate: 62, // BE 저장 단위 = 퍼센트 (세션278 H2)
  recent_trades_6m: 12,
  has_pool: false,
  management_office_tel: "02-555-1234",
  filter_options: {
    building_names: ["101동", "102동"],
    tags: ["역세권", "남향"],
    directions: ["남향", "동향"],
  },
  // last_crawled_at 의도적으로 omit — formatTimeAgo 결정성 확보 (배지 미렌더)
};

const ARTICLES: Article[] = [
  {
    article_no: "A-1001",
    complex_no: "100000",
    trade_type_name: "매매",
    building_name: "101동",
    floor_info: "12/25",
    deal_or_warrant_prc: "12억 5,000",
    area1_m2: 59.5,
    area2_m2: 84.8,
    area2_pyeong: 25.6,
    direction: "남향",
    article_feature_desc: "리모델링 완료, 즉시 입주 가능",
    tags: ["역세권", "남향"],
    realtor_name: "테스트부동산",
    article_confirm_ymd: "20260415",
    numeric_price: 125000,
    price_per_pyeong: 4883,
    room_count: 3,
    bathroom_count: 2,
  },
  {
    article_no: "A-1002",
    complex_no: "100000",
    trade_type_name: "전세",
    building_name: "102동",
    floor_info: "8/25",
    deal_or_warrant_prc: "7억 8,000",
    area1_m2: 59.5,
    area2_m2: 84.8,
    area2_pyeong: 25.6,
    direction: "동향",
    article_feature_desc: "채광 우수, 관리 양호",
    tags: ["남향"],
    realtor_name: "샘플공인중개사",
    article_confirm_ymd: "20260414",
    numeric_price: 78000,
    price_per_pyeong: 3047,
    room_count: 3,
    bathroom_count: 2,
  },
];

const ARTICLES_RESPONSE = {
  articles: ARTICLES,
  total: ARTICLES.length,
  page: 1,
  page_size: 20,
};

const EMPTY_PYEONG: { pyeong_details: PyeongDetail[] } = { pyeong_details: [] };

const EMPTY_STATS: PriceStats = {
  complex_no: "100000",
  total_articles: 0,
  by_area: [],
  by_floor: [],
};

const EMPTY_HISTORY: PriceHistoryResponse = {
  complex_no: "100000",
  items: [],
};

// 크롤 API: auto:true 자동 크롤(page.tsx:157)이 실서버로 새는 것 차단.
// start-crawl → "cached" 반환 시 useCrawlAction.onSuccess (L195-204) 가
// setCrawling(false) + setProgress(null) 즉시 → CrawlProgressBanner 미렌더
// (page.tsx:365 `crawling && type==="info"` 두 조건 모두 거짓).
// last_crawled_at=null 이면 patchLastCrawledAt (L70-82) no-op → Complex mock 의
// last_crawled_at omit 유지, formatTimeAgo 배지 결정성 확보.
const CACHED_CRAWL: CrawlProgress = {
  complex_no: "100000",
  status: "cached",
  last_crawled_at: null,
};

const IDLE_CRAWL: CrawlProgress = {
  complex_no: "100000",
  status: "idle",
};

const IDLE_PRICE: PriceCollectProgress = {
  complex_no: "100000",
  status: "idle",
};

async function fulfillJson(route: Route, body: unknown): Promise<void> {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

export async function applyComplexMocks(page: Page): Promise<void> {
  await page.route("**/api/complexes/**", async (route) => {
    const url = new URL(route.request().url());
    const parts = url.pathname.split("/").filter(Boolean);
    const sub = parts[3]; // undefined | "articles" | "pyeong-details" | "price-stats" | "price-history"

    if (!sub) return fulfillJson(route, COMPLEX);
    if (sub === "articles") return fulfillJson(route, ARTICLES_RESPONSE);
    if (sub === "pyeong-details") return fulfillJson(route, EMPTY_PYEONG);
    if (sub === "price-stats") return fulfillJson(route, EMPTY_STATS);
    if (sub === "price-history") return fulfillJson(route, EMPTY_HISTORY);

    await route.fulfill({ status: 404, body: "not found" });
  });

  await page.route("**/api/live/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p.endsWith("/articles/start-crawl")) return fulfillJson(route, CACHED_CRAWL);
    if (p.endsWith("/articles/crawl-status")) return fulfillJson(route, IDLE_CRAWL);
    if (p.endsWith("/price-history/start-collect")) return fulfillJson(route, IDLE_PRICE);
    if (p.endsWith("/price-history/collect-status")) return fulfillJson(route, IDLE_PRICE);
    await route.fulfill({ status: 404, body: "not found" });
  });

  // Header role 결정성 — fetchProfile 1순위 (백엔드 /api/users/me) mock.
  // 응답이 admin 이면 setUserRole('admin') → "관리자" 뱃지 렌더 (Header.tsx L240·370).
  await page.route("**/api/users/me", async (route) => {
    await fulfillJson(route, { role: "admin", email: "admin@test" });
  });

  // Header role 결정성 — fetchRoleFromSupabase fallback (Supabase PostgREST) mock.
  // supabase-js .single() 은 array[0] 을 추출하므로 PostgREST 응답 형식 그대로.
  await page.route("**/rest/v1/user_profiles**", async (route) => {
    await fulfillJson(route, [{ role: "admin" }]);
  });
}
