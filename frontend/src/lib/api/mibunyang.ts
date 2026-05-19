/**
 * 미분양 (mibunyang) API — 인증 불필요 (공개 데이터)
 */

import type { MbApartment, MbUnsoldHistory, MbRegion, MbTrade } from "@/types";
import { fetchApi } from "./core";

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
