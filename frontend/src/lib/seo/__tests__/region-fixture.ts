/**
 * 지역 페이지 시험 재료(세션 484 PR 3c-1b) — 백엔드 /api/regions/* 응답 모양. 단지 이름은 가짜("햇살마을" 계열).
 * 허브 = 대전 유성구(30200): 동 페이지 있는 큰 동 1(13곳 — 12곳 + 전체 링크 시험) · 작은 동 1(3곳 — 전부) .
 */
import type { DongPage, RegionComplexCard, RegionHub } from "@/types/region-pages";
import type { RegionTrend } from "@/types";

export function makeCard(over: Partial<RegionComplexCard> = {}): RegionComplexCard {
  return {
    complex_no: "9000",
    name: "햇살마을",
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

/** 큰 동 13곳 — 세대수 100·200…1300(뒤섞인 순서), 하나는 세대수 없음, 등급 A·B·C 섞음 */
export function bigDongCards(): RegionComplexCard[] {
  const grades: RegionComplexCard["grade"][] = ["A", "B", "C"];
  return Array.from({ length: 13 }, (_, i) => {
    const n = (i * 7) % 13; // 뒤섞기
    return makeCard({
      complex_no: String(9100 + n),
      name: `햇살마을${n + 1}단지`,
      grade: grades[n % 3],
      household_count: n === 12 ? null : (n + 1) * 100,
      recent6_min: n % 3 === 0 ? 40000 + n * 100 : null,
      recent6_max: n % 3 === 0 ? 44000 + n * 100 : null,
      official_price: n % 3 === 2 ? null : 300000000 + n * 1000000,
    });
  });
}

export function makeTrend(over: Partial<RegionTrend> = {}): RegionTrend {
  return {
    region_code: "30200",
    region_name: "유성구",
    source: "한국부동산원 전국주택가격동향조사",
    items: [
      { period: "202410", jeonse_ratio: 69.2, sale_price_median: 40000 },
      { period: "202509", jeonse_ratio: 69.8, sale_price_median: 40300 },
      { period: "202609", jeonse_ratio: 69.5, sale_price_median: 40600 },
    ],
    ...over,
  };
}

export function makeHub(over: Partial<RegionHub> = {}): RegionHub {
  return {
    sigungu_code: "30200",
    sido: "대전",
    sigungu_name: "유성구",
    indexable: true,
    complex_count: 16,
    region_trend: makeTrend(),
    dongs: [
      { dong_code: "3020011800", dong_name: "봉명동", has_page: true, indexable: true, complex_count: 13, complexes: bigDongCards() },
      {
        dong_code: "3020012900",
        dong_name: "달빛동",
        has_page: false,
        indexable: false,
        complex_count: 3,
        complexes: [
          makeCard({ complex_no: "9201", name: "달빛마을1단지", grade: "C", household_count: 120, recent6_min: null, recent6_max: null, official_price: null }),
          makeCard({ complex_no: "9202", name: "달빛마을2단지", grade: "B", household_count: 300, recent6_min: null, recent6_max: null }),
          makeCard({ complex_no: "9203", name: "달빛마을3단지", household_count: 80 }),
        ],
      },
    ],
    ...over,
  };
}

export function makeDong(over: Partial<DongPage> = {}): DongPage {
  return {
    dong_code: "3020011800",
    dong_name: "봉명동",
    sido: "대전",
    sigungu_code: "30200",
    sigungu_name: "유성구",
    indexable: true,
    complexes: bigDongCards(),
    neighborhood: [
      {
        emd_cd: "25040640", emd_nm: "온천1동", emd_name: "온천1동", year: 2024, population: 27454, avg_age: 43.1,
        one_person_pct: 68, households: 17416,
        house_mix: { apt_pct: 49, officetel_pct: 8, row_pct: 6, detached_pct: 33 },
        old_house_pct: 27, old_house_cutoff: "2004년 이전", corp_cnt: 5294, worker_cnt: 20816, broker_pct: 3.36,
        flood: { affected: true }, landslide: { affected: false },
        source: "국가데이터처 통계지리정보 센서스 2024",
      },
      {
        emd_cd: "25040650", emd_nm: "온천2동", emd_name: "온천2동", year: 2024, population: 54325, avg_age: 36.2,
        one_person_pct: 55, households: 30000,
        house_mix: { apt_pct: 40, officetel_pct: 1, row_pct: 2, detached_pct: 52 },
        old_house_pct: 30, old_house_cutoff: "2004년 이전", corp_cnt: 4819, worker_cnt: 15000, broker_pct: 2.1,
        flood: null, landslide: null,
        source: "국가데이터처 통계지리정보 센서스 2024",
      },
    ],
    sibling_dongs: [
      { dong_code: "3020012000", dong_name: "별빛동" },
      { dong_code: "3020012700", dong_name: "구름동" },
    ],
    ...over,
  };
}
