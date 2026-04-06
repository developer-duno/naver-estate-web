/**
 * 통계/분석 API (DB 통계, 지역, 면적, 가격)
 */

import type { DbStats, Regions, PyeongDetail, PriceStats, PriceHistoryResponse } from "@/types";
import * as direct from "@/lib/api-direct";
import { fetchApi, isBackendAvailable } from "./core";

/** DB 통계 */
export async function getStats() {
  if (!isBackendAvailable()) return direct.getStatsDirect();
  try {
    return await fetchApi<DbStats>(`/api/stats`);
  } catch {
    return direct.getStatsDirect();
  }
}

/** 지역 목록 */
export async function getRegions() {
  if (!isBackendAvailable()) return direct.getRegionsDirect();
  try {
    return await fetchApi<Regions>(`/api/regions`);
  } catch {
    return direct.getRegionsDirect();
  }
}

/** 면적별 상세 */
export async function getPyeongDetails(complexNo: string) {
  if (!isBackendAvailable()) return { pyeong_details: [] };
  try {
    return await fetchApi<{ pyeong_details: PyeongDetail[] }>(`/api/complexes/${encodeURIComponent(complexNo)}/pyeong-details`);
  } catch {
    return { pyeong_details: [] };
  }
}

/** 가격 통계 (면적별/층수별, 거래유형 구분 포함) */
export async function getPriceStats(complexNo: string) {
  const empty = { complex_no: complexNo, total_articles: 0, by_area: [], by_floor: [] } as PriceStats;
  if (!isBackendAvailable()) return empty;
  try {
    return await fetchApi<PriceStats>(`/api/complexes/${encodeURIComponent(complexNo)}/price-stats`);
  } catch {
    return empty;
  }
}

/** 단지 가격 추이 (실거래가 + 시세) */
export async function getPriceHistory(complexNo: string, tradeType?: string, areaNo?: string) {
  const empty: PriceHistoryResponse = { complex_no: complexNo, items: [] };
  if (!isBackendAvailable()) return empty;
  try {
    const params = new URLSearchParams();
    if (tradeType) params.set("trade_type", tradeType);
    if (areaNo) params.set("area_no", areaNo);
    const qs = params.toString();
    return await fetchApi<PriceHistoryResponse>(`/api/complexes/${encodeURIComponent(complexNo)}/price-history${qs ? `?${qs}` : ""}`);
  } catch {
    return empty;
  }
}
