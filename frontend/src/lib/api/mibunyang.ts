/**
 * 미분양 (mibunyang) API — 인증 불필요 (공개 데이터)
 */

import type {
  MbApartment,
  MbUnsoldHistory,
  MbRegion,
  MbTrade,
  MbPresaleDetail,
  MbOfficetelRentalItem,
} from "@/types";
import { fetchApi } from "./core";

/** 분양 분류 (BE PRIVATE_TYPES/PUBLIC_TYPES SSOT 짝꿍) */
export type MbPresaleType = "all" | "private" | "public";

/** 시/도 내 시/군/구 목록 (apartments 기준) */
export async function getMbGuList(region: string) {
  return fetchApi<{ region: string; gu_list: string[] }>(
    `/api/mb/gu-list?region=${encodeURIComponent(region)}`,
  );
}

/** 지역별 아파트 목록 */
export async function getMbApartments(region: string, gu?: string, page = 1, pageSize = 50, sortBy?: string, keyword?: string) {
  const params = new URLSearchParams({ region, page: String(page), page_size: String(pageSize) });
  if (gu) params.set("gu", gu);
  if (sortBy) params.set("sort_by", sortBy);
  if (keyword) params.set("keyword", keyword);
  return fetchApi<{ apartments: MbApartment[]; total: number; page: number; page_size: number }>(
    `/api/mb/apartments?${params}`,
  );
}

/** 아파트 상세 (부속 데이터 포함) */
export async function getMbApartmentDetail(id: string) {
  return fetchApi<MbApartment>(`/api/mb/apartments/${encodeURIComponent(id)}`);
}

/** 미분양 아파트 목록 (unsold > 0, 페이지네이션) */
export async function getMbUnsold(
  region: string,
  gu?: string,
  page = 1,
  pageSize = 50,
  sortBy?: string,
  keyword?: string,
) {
  const params = new URLSearchParams({ region, page: String(page), page_size: String(pageSize) });
  if (gu) params.set("gu", gu);
  if (sortBy) params.set("sort_by", sortBy);
  if (keyword) params.set("keyword", keyword);
  return fetchApi<{ unsold: MbApartment[]; total: number }>(`/api/mb/unsold?${params}`);
}

/** 미분양 추이 */
export async function getMbUnsoldHistory(id: string, limit = 24) {
  return fetchApi<{ apartment_id: string; items: MbUnsoldHistory[] }>(
    `/api/mb/unsold/${encodeURIComponent(id)}/history?limit=${limit}`,
  );
}

/** 지역 통계 */
export async function getMbRegions(region: string, gu?: string) {
  const params = new URLSearchParams({ region });
  if (gu) params.set("gu", gu);
  return fetchApi<{ regions: MbRegion[]; total: number }>(`/api/mb/regions?${params}`);
}

/** 지역별 실거래 내역 */
export async function getMbTrades(region: string, gu?: string, dong?: string, page = 1, pageSize = 50, sortBy?: string) {
  const params = new URLSearchParams({ region, page: String(page), page_size: String(pageSize) });
  if (gu) params.set("gu", gu);
  if (dong) params.set("dong", dong);
  if (sortBy) params.set("sort_by", sortBy);
  return fetchApi<{ trades: MbTrade[]; total: number; page: number; page_size: number }>(
    `/api/mb/trades?${params}`,
  );
}

// ── 분양 (청약홈) — BE routers/mb.py /presale·/competition 짝꿍 ──

/** 분양 단지 목록 (민간/공공 분류 + 단계 + 지역 필터) */
export async function getMbPresale(
  presaleType: MbPresaleType = "all",
  region?: string,
  gu?: string,
  page = 1,
  pageSize = 50,
  sortBy?: string,
  keyword?: string,
  stage?: string,
) {
  const params = new URLSearchParams({
    presale_type: presaleType,
    page: String(page),
    page_size: String(pageSize),
  });
  if (region) params.set("region", region);
  if (gu) params.set("gu", gu);
  if (sortBy) params.set("sort_by", sortBy);
  if (keyword) params.set("keyword", keyword);
  if (stage) params.set("stage", stage);
  return fetchApi<{ presale: MbApartment[]; total: number; page: number; page_size: number }>(
    `/api/mb/presale?${params}`,
  );
}

/** 분양 단지 상세 (청약일정 + 평형별 공급 + 요약 집계) */
export async function getMbPresaleDetail(id: string) {
  return fetchApi<MbPresaleDetail>(`/api/mb/presale/${encodeURIComponent(id)}`);
}

/** 오피스텔·민간임대 통합 청약 목록 (이슈 #323) */
export async function getMbOfficetelRental(region?: string, page = 1, pageSize = 50) {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  if (region) params.set("region", region);
  return fetchApi<{
    items: MbOfficetelRentalItem[];
    total: number;
    page: number;
    page_size: number;
  }>(`/api/mb/presale/officetel-rental?${params}`);
}

/** 분양결과 (경쟁률 단지 목록) */
export async function getMbCompetition(
  region?: string,
  gu?: string,
  page = 1,
  pageSize = 50,
  sortBy?: string,
  keyword?: string,
) {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  if (region) params.set("region", region);
  if (gu) params.set("gu", gu);
  if (sortBy) params.set("sort_by", sortBy);
  if (keyword) params.set("keyword", keyword);
  return fetchApi<{ competition: MbApartment[]; total: number; page: number; page_size: number }>(
    `/api/mb/competition?${params}`,
  );
}
