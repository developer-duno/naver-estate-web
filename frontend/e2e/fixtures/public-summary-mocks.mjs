/**
 * e2e 가짜 공개 요약(GET /api/complexes/{no}/public-summary) — 세션 483 PR 3b.
 * 서버 렌더(ISR)는 Next 서버가 직접 부르므로 page.route 로 못 가로챈다 → fake-api-server.mjs 가 이 값을 돌려준다.
 * 단지 이름·세대수 등은 같은 번호의 브라우저 쪽 mock(complex-mocks.ts COMPLEX · public-flow.spec.ts · complex-detail.spec.ts)과
 * 같은 값으로 맞춘다 — 바꾸면 양쪽을 같이 고친다. 전부 가짜 자료다.
 * 플레인 JS(.mjs)인 이유: CI 는 Node 22 라 .ts 를 node 로 바로 못 돌릴 수 있다.
 */

function base(no, over) {
  return {
    complex_no: no,
    name: "테스트단지",
    real_estate_type: "APT",
    household_count: 520,
    building_count: 6,
    parking_count: 780,
    use_approve_year: 2010,
    rep_area_key: 59,
    grade: "A",
    indexable: true,
    has_region: true,
    breadcrumb: {
      sido: "서울",
      sigungu_code: "11680",
      sigungu_name: "강남구",
      dong_code: "1168010100",
      dong_name: "역삼동",
      dong_has_page: true,
    },
    name_dup_scope: "none",
    title_suffix: "none",
    basis_ym: "2026-10",
    data_last_ym: "202609",
    area_ranges: [],
    official_price: null,
    kapt_cost: null,
    subway: [],
    nearby: [],
    nearby_scope: "dong",
    nearby_total: 0,
    ...over,
  };
}

// 가까운 순(결정 27) — 백엔드가 distance_m 을 붙여 가까운 순으로 준다(nearby_scope "near")
const NEARBY = [
  { complex_no: "100010", name: "이웃단지가", grade: "A", household_count: 900, rep_area_key: 84, recent6_min: 90000, recent6_max: 98000, official_price: null, distance_m: 320 },
  { complex_no: "100011", name: "이웃단지나", grade: "B", household_count: 400, rep_area_key: 59, recent6_min: null, recent6_max: null, official_price: 520000000, distance_m: 1240 },
];

/** 번호 → 요약(없으면 null = 404) */
export const PUBLIC_SUMMARIES = {
  // complex-mocks.ts COMPLEX(중개사 작업 화면 시각 회귀 · complex-visual.spec.ts)
  "100000": base("100000", {
    area_ranges: [
      { area_key: 59, exclusive_area: 59, recent6: { min: 118000, max: 126000, count: 3 }, recent24: { min: 110000, max: 128000, count: 11 } },
      { area_key: 84, exclusive_area: 84, recent6: null, recent24: { min: 150000, max: 162000, count: 4 } },
    ],
    official_price: { year: "2026", items: [{ prvuse_ar: 59.5, price_median: 820000000, ho_count: 300 }] },
    kapt_cost: { ym: "202607", monthly_total: 245000 },
    subway: [{ station_name: "역삼", lines: ["수도권 2호선"], distance_m: 420 }],
    nearby: NEARBY,
    nearby_scope: "near",
    nearby_total: 2,
  }),
  // public-flow.spec.ts 비로그인 소비자 화면(대전 유성구 봉명동)
  "100001": base("100001", {
    name: "공개단지",
    household_count: 199,
    building_count: 1,
    use_approve_year: 1997,
    breadcrumb: {
      sido: "대전", sigungu_code: "30200", sigungu_name: "유성구",
      dong_code: "3020012300", dong_name: "봉명동", dong_has_page: false,
    },
    area_ranges: [
      { area_key: 59, exclusive_area: 59, recent6: { min: 15700, max: 18000, count: 3 }, recent24: { min: 14700, max: 20000, count: 12 } },
    ],
    official_price: { year: "2026", items: [{ prvuse_ar: 59.9, price_median: 113000000, ho_count: 116 }] },
    subway: [{ station_name: "갑천", lines: ["대전1호선"], distance_m: 1100 }],
    nearby: NEARBY,
    nearby_scope: "near",
    nearby_total: 2,
  }),
  // complex-detail.spec.ts 6개월 거래 없는 단지
  "200000": base("200000", {
    name: "거래적은단지",
    grade: "B",
    indexable: false,
    breadcrumb: {
      sido: "대전", sigungu_code: "30200", sigungu_name: "유성구",
      dong_code: "3020012300", dong_name: "봉명동", dong_has_page: false,
    },
    area_ranges: [
      { area_key: 59, exclusive_area: 59, recent6: null, recent24: { min: 14700, max: 20000, count: 2 } },
    ],
    subway: [{ station_name: "갑천", lines: ["대전1호선"], distance_m: 1100 }],
  }),
  // complex-detail.spec.ts·responsive.spec.ts 의 "열리기만 하면 되는" 단지 — 자료 없는 C 등급
  "12345": base("12345", {
    name: "열림확인단지",
    grade: "C",
    indexable: false,
    has_region: false,
    breadcrumb: null,
    rep_area_key: null,
  }),
};
