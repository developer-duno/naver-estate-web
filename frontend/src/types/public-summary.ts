/**
 * 단지 공개 요약 (GET /api/complexes/{no}/public-summary — 인증 없음, 세션 483 PR 3a).
 * 서버 렌더(ISR)가 한 번에 받는 재료. 칸 = backend/services/public_pages.py public_summary 의 dict 키 그대로.
 * 금액 단위: 면적 범위·카드 범위 = 만원 · 공시가격·관리비 = 원.
 */
import type { OfficialPriceItem, SubwayStationNear } from "./analytics";

export interface PublicSummaryRange {
  min: number;
  max: number;
  count: number;
}

export interface PublicSummaryAreaRange {
  area_key: number;
  exclusive_area: number;
  /** 최근 6개월 범위(직거래 제외) — 없으면 null */
  recent6: PublicSummaryRange | null;
  /** 최근 2년 범위 — 없으면 null */
  recent24: PublicSummaryRange | null;
}

export interface PublicSummaryBreadcrumb {
  sido: string | null;
  sigungu_code: string;
  sigungu_name: string | null;
  dong_code: string;
  dong_name: string | null;
  /** 동 페이지가 있나 — 백엔드 dong_flags 한 곳 판정(화면이 다시 계산하지 않는다) */
  dong_has_page: boolean;
}

export interface PublicSummaryCard {
  complex_no: string;
  name: string;
  grade: "A" | "B" | "C";
  household_count: number | null;
  rep_area_key: number | null;
  recent6_min: number | null;
  recent6_max: number | null;
  /** 대표 면적 공시가격(원) */
  official_price: number | null;
  /** 이 단지에서의 직선거리(m) — nearby_scope "near" 일 때(결정 27). 옛 응답엔 없다 → 거리만 빼고 그린다 */
  distance_m?: number | null;
}

export type TitleSuffix = "none" | "dong" | "dong_households" | "dong_year" | "dong_no";

export interface PublicSummary {
  complex_no: string;
  name: string;
  real_estate_type: string | null;
  household_count: number | null;
  building_count: number | null;
  parking_count: number | null;
  use_approve_year: number | null;
  rep_area_key: number | null;
  grade: "A" | "B" | "C";
  indexable: boolean;
  has_region: boolean;
  breadcrumb: PublicSummaryBreadcrumb | null;
  name_dup_scope: "none" | "sigungu" | "dong";
  title_suffix: TitleSuffix;
  /** 서버 기준월 "YYYY-MM" */
  basis_ym: string;
  /** 정부 실거래 자료 마지막 달 "YYYYMM" — 없으면 null */
  data_last_ym: string | null;
  area_ranges: PublicSummaryAreaRange[];
  official_price: { year: string | null; items: OfficialPriceItem[] } | null;
  kapt_cost: { ym: string; monthly_total: number } | null;
  subway: SubwayStationNear[];
  nearby: PublicSummaryCard[];
  /** "near" = 가까운 순(결정 27) · "dong"/"sigungu" = 좌표 없는 단지의 대체(같은 동 → 같은 시군구) */
  nearby_scope: "near" | "dong" | "sigungu" | null;
  nearby_total: number;
}

/** 서버가 클라이언트 화면에 넘기는 재료 — 화면에 쓰는 칸만(lib/server/public-summary.ts clientSeedOf) */
export type ClientSeed = Pick<PublicSummary, "basis_ym" | "breadcrumb" | "official_price" | "subway"> & {
  complex_no: string;
  /** 서버가 그린 시각(ms) — initialDataUpdatedAt */
  at: number;
};
