/**
 * e2e 가짜 지역 응답(GET /api/regions/sitemap-codes · /{sgg5}/hub · /{sgg5}/dongs/{dong10}) — 세션 484 PR 3c-1b.
 * 지역 장은 서버 렌더(ISR)라 Next 서버가 직접 부른다 → page.route 로 못 가로챈다 → fake-api-server.mjs 가 이 값을 돌려준다.
 * 전부 가짜 자료다(단지 이름 "햇살마을" 계열 — 실제 단지명 금지). 플레인 JS(.mjs)인 이유는 public-summary-mocks.mjs 와 같다.
 */

function card(no, name, over = {}) {
  return {
    complex_no: no,
    name,
    grade: "A",
    household_count: 500,
    rep_area_key: 84,
    recent6_min: 40000,
    recent6_max: 44000,
    official_price: 310000000,
    use_approve_year: 2010,
    ...over,
  };
}

/** 동 페이지 있는 동(봉명동) 13곳 — 허브에선 12곳 + 전체 링크 */
const BIG = Array.from({ length: 13 }, (_, i) =>
  card(String(900100 + i), `햇살마을${i + 1}단지`, {
    household_count: 1300 - i * 100,
    grade: ["A", "B", "C"][i % 3],
    recent6_min: i % 3 === 0 ? 40000 + i * 100 : null,
    recent6_max: i % 3 === 0 ? 44000 + i * 100 : null,
  }),
);

const SMALL = [
  card("900201", "달빛마을1단지", { grade: "C", household_count: 120, recent6_min: null, recent6_max: null, official_price: null }),
  card("900202", "달빛마을2단지", { grade: "B", household_count: 300, recent6_min: null, recent6_max: null }),
];

const TREND = {
  region_code: "30200",
  region_name: "유성구",
  source: "한국부동산원 전국주택가격동향조사",
  items: [
    { period: "202410", jeonse_ratio: 69.2, sale_price_median: 40000 },
    { period: "202609", jeonse_ratio: 69.5, sale_price_median: 40600 },
  ],
};

export const SITEMAP_CODES = { hubs: ["30200"], dongs: ["3020011800"] };

/** 시군구 5자리 → 허브(없으면 404) */
export const HUBS = {
  "30200": {
    sigungu_code: "30200",
    sido: "대전",
    sigungu_name: "유성구",
    indexable: true,
    complex_count: BIG.length + SMALL.length,
    region_trend: TREND,
    dongs: [
      { dong_code: "3020011800", dong_name: "봉명동", has_page: true, indexable: true, complex_count: BIG.length, complexes: BIG },
      { dong_code: "3020012300", dong_name: "달빛동", has_page: false, indexable: false, complex_count: SMALL.length, complexes: SMALL },
    ],
  },
};

/** 동 10자리 → 동 페이지(없으면 404 — 동 페이지 없는 작은 동 포함) */
export const DONGS = {
  "3020011800": {
    dong_code: "3020011800",
    dong_name: "봉명동",
    sido: "대전",
    sigungu_code: "30200",
    sigungu_name: "유성구",
    indexable: true,
    complexes: BIG,
    neighborhood: [
      {
        emd_cd: "25040640", emd_nm: "햇살1동", emd_name: "햇살1동", year: 2024, population: 27454, avg_age: 43.1,
        one_person_pct: 68, households: 17416, house_mix: { apt_pct: 49, officetel_pct: 8, row_pct: 6, detached_pct: 33 },
        old_house_pct: 27, old_house_cutoff: "2004년 이전", corp_cnt: 5294, worker_cnt: 20816, broker_pct: 3.36,
        flood: { affected: true }, landslide: null, source: "가짜 동네 통계(e2e)",
      },
    ],
    sibling_dongs: [],
  },
};
