/**
 * 지역 페이지 재료(세션 483 PR 3a 백엔드 창구 · 세션 484 PR 3c-1b 화면) — 칸 = backend/services/public_pages.py 의 dict 키 그대로.
 * GET /api/regions/sitemap-codes · /api/regions/{sgg5}/hub · /api/regions/{sgg5}/dongs/{dong10} (인증 없음).
 * 금액 단위: recent6_min/max = 만원 · official_price = 원.
 */
import type { NeighborhoodInfo, RegionTrend } from "./analytics";

export interface RegionComplexCard {
  complex_no: string;
  name: string;
  grade: "A" | "B" | "C";
  household_count: number | null;
  /** 대표 면적(㎡) — 없으면 null */
  rep_area_key: number | null;
  /** 대표 면적 최근 6개월 실거래 최저·최고(만원) — 없으면 null */
  recent6_min: number | null;
  recent6_max: number | null;
  /** 대표 면적 공시가격(원) */
  official_price: number | null;
  use_approve_year?: number | null;
}

export interface RegionSitemapCodes {
  /** 색인 대상 시군구 5자리 */
  hubs: string[];
  /** 색인 대상 동 페이지 10자리 */
  dongs: string[];
}

export interface RegionHubDong {
  dong_code: string;
  dong_name: string;
  has_page: boolean;
  indexable: boolean;
  complex_count: number;
  complexes: RegionComplexCard[];
}

export interface RegionHub {
  sigungu_code: string;
  sido: string | null;
  sigungu_name: string;
  indexable: boolean;
  complex_count: number;
  region_trend: RegionTrend | null;
  dongs: RegionHubDong[];
}

/** 동 페이지의 행정동 하나 — NeighborhoodInfo 모양 + 행정동 코드·이름 */
export type DongNeighborhood = NeighborhoodInfo & { emd_name?: string | null };

export interface DongPage {
  dong_code: string;
  dong_name: string;
  sido: string | null;
  sigungu_code: string;
  sigungu_name: string;
  indexable: boolean;
  complexes: RegionComplexCard[];
  neighborhood: DongNeighborhood[];
  sibling_dongs: { dong_code: string; dong_name: string }[];
}
