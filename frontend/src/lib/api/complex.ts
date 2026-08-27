/**
 * 단지 검색/조회 API
 */

import type { Complex, KaptInfo, OfficialPriceResponse, SubwayNearResponse } from "@/types";
import * as direct from "@/lib/api-direct";
import { ApiError, fetchApi, isBackendAvailable } from "./core";

/** 검색 응답 — BE 가 네이버 쿨다운으로 DB 폴백 시 source/notice 포함 */
export interface SearchResponse {
  complexes: Complex[];
  total: number;
  source?: "db_fallback";
  notice?: string;
}

// 네이버 실시간 검색 FE 측 상한 — BE 는 15s wall-timeout + DB 폴백 내장.
// 기존 120s 는 2분 대기 후 에러 유발. 30s 로 낮춰 FE direct 폴백까지의 체감 절감.
const SEARCH_TIMEOUT_MS = 30_000;

/** 단지 키워드 검색 */
export async function searchComplexes(keyword: string, signal?: AbortSignal, types?: string) {
  if (!isBackendAvailable()) return direct.searchComplexesDirect(keyword);
  try {
    let url = `/api/live/search?q=${encodeURIComponent(keyword)}`;
    if (types) url += `&types=${encodeURIComponent(types)}`;
    return await fetchApi<SearchResponse>(
      url,
      { signal, timeoutMs: SEARCH_TIMEOUT_MS } as RequestInit & { timeoutMs?: number },
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
    return await fetchApi<SearchResponse>(path, { signal, timeoutMs: SEARCH_TIMEOUT_MS } as RequestInit & { timeoutMs?: number });
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

// ⚠ 공시가격은 direct(Supabase) 폴백 경로가 없다 — 에러를 삼키지 말고 그대로 throw
// (error-propagation.md 룰, 회귀 가드: lib/__tests__/official-price-error.test.ts).
const BACKEND_DOWN_MSG = "서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.";

/** 단지 공동주택 공시가격 (무료 공개, 게이트 없음) */
export async function getOfficialPrices(complexNo: string): Promise<OfficialPriceResponse> {
  if (!isBackendAvailable()) throw new Error(BACKEND_DOWN_MSG);
  return fetchApi<OfficialPriceResponse>(`/api/complexes/${encodeURIComponent(complexNo)}/official-prices`);
}

/**
 * 단지 인근 지하철역 (GET /api/complexes/{no}/subway — 거리순 최대 3개, 3km 이내)
 *
 * ⚠ 공시가격과 동일하게 direct(Supabase) 폴백 경로가 없다 — 에러를 빈 stations 로
 * 삼키면 React Query isError 가 prod 에서 발화하지 않는다 (error-propagation.md,
 * 회귀 가드: lib/__tests__/complex-subway-error.test.ts).
 * 데이터 없음·좌표 없음은 BE 가 200 + stations:[] 로 내려주므로 에러가 아니다.
 */
export async function getComplexSubway(complexNo: string): Promise<SubwayNearResponse> {
  if (!isBackendAvailable()) throw new Error(BACKEND_DOWN_MSG);
  return fetchApi<SubwayNearResponse>(`/api/complexes/${encodeURIComponent(complexNo)}/subway`);
}

/**
 * 단지 공동주택 관리비 (GET /api/complexes/{no}/kapt — K-apt 의무관리단지)
 *
 * ⚠ 404 는 "데이터 없음"의 **확정 답변**이라 null 로 변환한다. 전국 6.4만 단지 중 K-apt
 * 의무관리단지는 ~1.5만뿐이라 404 가 다수의 정상 케이스이고, 이를 에러로 전파하면 관리비가
 * 원래 없는 대부분의 단지에서 React Query 가 isError 로 뜬다(정상 상태를 장애로 표시).
 *
 * ⚠ 그 외 상태(5xx·429 등)는 절대 삼키지 않고 그대로 throw — 삼키면 "서버 장애"가
 * "관리비 없음"으로 위장돼 React Query isError 가 prod 에서 영영 발화하지 않는다
 * (error-propagation.md §1·§2, 회귀 가드: lib/__tests__/complex-kapt-error.test.ts).
 * 공시가격·지하철과 마찬가지로 direct(Supabase) 폴백 경로는 없다.
 */
export async function getComplexKapt(complexNo: string): Promise<KaptInfo | null> {
  if (!isBackendAvailable()) throw new Error(BACKEND_DOWN_MSG);
  try {
    return await fetchApi<KaptInfo>(`/api/complexes/${encodeURIComponent(complexNo)}/kapt`);
  } catch (err) {
    // 404 만 "데이터 없음"으로 흡수. 나머지는 원본 에러 그대로 전파(타입 보존).
    if (err instanceof ApiError && err.statusCode === 404) return null;
    throw err;
  }
}

/**
 * 단지명 DB 검색 (GET /api/complexes/search — ILIKE, 네이버 호출 0, 무게이트)
 *
 * searchComplexes 와 달리 실시간 네이버 크롤(/api/live/search)을 타지 않는다.
 * 공개 페이지(계산기 등)에서 단지를 고를 때 쓴다 — IP 차단 위험 0.
 * ⚠ 폴백 금지: 에러를 삼키면 React Query isError 가 prod 에서 발화하지 않는다
 * (error-propagation.md §4, 회귀 가드: lib/__tests__/official-price-error.test.ts).
 */
export async function searchComplexesDb(
  keyword: string,
  signal?: AbortSignal,
  limit?: number,
): Promise<SearchResponse> {
  if (!isBackendAvailable()) throw new Error(BACKEND_DOWN_MSG);
  let url = `/api/complexes/search?q=${encodeURIComponent(keyword)}`;
  if (limit) url += `&limit=${limit}`;
  return fetchApi<SearchResponse>(url, { signal });
}
