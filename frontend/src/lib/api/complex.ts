/**
 * 단지 검색/조회 API
 */

import type { Complex } from "@/types";
import * as direct from "@/lib/api-direct";
import { fetchApi, isBackendAvailable, LIVE_TIMEOUT_MS } from "./core";

/** 단지 키워드 검색 */
export async function searchComplexes(keyword: string, signal?: AbortSignal, types?: string) {
  if (!isBackendAvailable()) return direct.searchComplexesDirect(keyword);
  try {
    let url = `/api/live/search?q=${encodeURIComponent(keyword)}`;
    if (types) url += `&types=${encodeURIComponent(types)}`;
    return await fetchApi<{ complexes: Complex[]; total: number }>(
      url,
      { signal, timeoutMs: LIVE_TIMEOUT_MS } as RequestInit & { timeoutMs?: number },
    );
  } catch {
    return direct.searchComplexesDirect(keyword);
  }
}

/** 지역별 단지 조회 */
export async function getComplexesByRegion(sido: string, sigungu?: string, dong?: string, signal?: AbortSignal, types?: string) {
  if (!isBackendAvailable()) return direct.getComplexesByRegionDirect(sido, sigungu, dong);
  try {
    // 세종처럼 sido === sigungu인 경우 중복 전달 방지
    const effectiveSigungu = sigungu && sigungu !== sido ? sigungu : undefined;
    let path = `/api/live/region?sido=${encodeURIComponent(sido)}`;
    if (effectiveSigungu) path += `&sigungu=${encodeURIComponent(effectiveSigungu)}`;
    if (dong) path += `&dong=${encodeURIComponent(dong)}`;
    if (types) path += `&types=${encodeURIComponent(types)}`;
    return await fetchApi<{ complexes: Complex[]; total: number }>(path, { signal, timeoutMs: LIVE_TIMEOUT_MS } as RequestInit & { timeoutMs?: number });
  } catch {
    return direct.getComplexesByRegionDirect(sido, sigungu, dong);
  }
}

/** 단지 상세 */
export async function getComplex(complexNo: string) {
  if (!isBackendAvailable()) return direct.getComplexDirect(complexNo);
  try {
    return await fetchApi<Complex>(`/api/complexes/${encodeURIComponent(complexNo)}`);
  } catch {
    return direct.getComplexDirect(complexNo);
  }
}
