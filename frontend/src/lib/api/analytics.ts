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

// ⚠ 아래 3개(getPyeongDetails/getPriceStats/getPriceHistory)는 에러를 빈 데이터로 삼키지 말 것 —
// 삼키면 React Query isError 가 prod 에서 영영 발화하지 않아 모든 retry UI 가 dead code 가 된다
// (회귀 가드: lib/__tests__/analytics-error.test.ts).
const BACKEND_DOWN_MSG = "서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.";

/** 면적별 상세 */
export async function getPyeongDetails(complexNo: string) {
  if (!isBackendAvailable()) throw new Error(BACKEND_DOWN_MSG);
  return fetchApi<{ pyeong_details: PyeongDetail[] }>(`/api/complexes/${encodeURIComponent(complexNo)}/pyeong-details`);
}

/** 가격 통계 (면적별/층수별, 거래유형 구분 포함) */
export async function getPriceStats(complexNo: string) {
  if (!isBackendAvailable()) throw new Error(BACKEND_DOWN_MSG);
  return fetchApi<PriceStats>(`/api/complexes/${encodeURIComponent(complexNo)}/price-stats`);
}

/** 단지 가격 추이 (실거래가 + 시세) */
export async function getPriceHistory(complexNo: string, tradeType?: string, areaNo?: string) {
  if (!isBackendAvailable()) throw new Error(BACKEND_DOWN_MSG);
  const params = new URLSearchParams();
  if (tradeType) params.set("trade_type", tradeType);
  if (areaNo) params.set("area_no", areaNo);
  const qs = params.toString();
  return fetchApi<PriceHistoryResponse>(`/api/complexes/${encodeURIComponent(complexNo)}/price-history${qs ? `?${qs}` : ""}`);
}
