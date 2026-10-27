/**
 * 단지 공개 요약 시험 재료(세션 483 PR 3b) — 가짜 단지 "햇살마을"(대전 유성구 봉명동). 실제 단지 값이 아니다.
 * 금액: 범위 = 만원 · 공시가격·관리비 = 원.
 */
import type { PublicSummary } from "@/types/public-summary";

export function makeSummary(over: Partial<PublicSummary> = {}): PublicSummary {
  return {
    complex_no: "6139",
    name: "햇살마을",
    real_estate_type: "APT",
    household_count: 1200,
    building_count: 12,
    parking_count: 1500,
    use_approve_year: 1998,
    rep_area_key: 84,
    grade: "A",
    indexable: true,
    has_region: true,
    breadcrumb: {
      sido: "대전",
      sigungu_code: "30200",
      sigungu_name: "유성구",
      dong_code: "3020011800",
      dong_name: "봉명동",
      dong_has_page: true,
    },
    name_dup_scope: "none",
    title_suffix: "none",
    basis_ym: "2026-10",
    data_last_ym: "202609",
    area_ranges: [
      { area_key: 59, exclusive_area: 59, recent6: { min: 30000, max: 34000, count: 4 }, recent24: { min: 28000, max: 34500, count: 15 } },
      { area_key: 84, exclusive_area: 84, recent6: { min: 41000, max: 45500, count: 6 }, recent24: { min: 39000, max: 46000, count: 22 } },
      { area_key: 114, exclusive_area: 114, recent6: null, recent24: { min: 52000, max: 56000, count: 3 } },
    ],
    official_price: {
      year: "2026",
      items: [
        { prvuse_ar: 59.9, price_median: 230_000_000, ho_count: 300 },
        { prvuse_ar: 84.6, price_median: 310_000_000, ho_count: 600 },
      ],
    },
    kapt_cost: { ym: "202607", monthly_total: 215_000 },
    subway: [{ station_name: "봉명", lines: ["대전1호선"], distance_m: 650 }],
    nearby: Array.from({ length: 14 }, (_, i) => ({
      complex_no: String(7000 + i),
      name: `이웃단지${i + 1}`,
      grade: i < 10 ? ("A" as const) : ("B" as const),
      household_count: 1000 - i * 10,
      rep_area_key: 84,
      recent6_min: i < 10 ? 40000 + i * 100 : null,
      recent6_max: i < 10 ? 44000 + i * 100 : null,
      official_price: i < 10 ? null : 280_000_000,
    })),
    nearby_scope: "dong",
    nearby_total: 14,
    ...over,
  };
}
