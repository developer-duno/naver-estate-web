/**
 * FastAPI 백엔드 호출 래퍼
 */

import type { Complex, Article, PyeongDetail, ArticleFilters, DbStats, Regions, PriceStats, CrawlProgress } from "@/types";
import * as direct from "@/lib/api-direct";
import type { UserProfile, AuditLog, AdminSetting, DetailedStats, PaginatedResponse, UserUpdatePayload, CrawlJobDetail } from "@/types/admin";

export class ApiError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
  }
}

function getApiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL || "";
}

const HAS_BACKEND = !!process.env.NEXT_PUBLIC_API_URL;

const DEFAULT_TIMEOUT_MS = 15_000;
const LIVE_TIMEOUT_MS = 120_000; // live crawling takes longer

let _isLoggingOut = false;


// 동일 URL 요청 중복 방지 (in-flight deduplication)
const _inflightRequests = new Map<string, Promise<unknown>>();

async function _fetchApiImpl<T>(path: string, options?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const url = `${getApiBase()}${path}`;
  const externalSignal = options?.signal;
  const controller = externalSignal ? null : new AbortController();
  const timeoutMs = (options as any)?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetch(url, {
      ...options,
      signal: externalSignal ?? controller!.signal,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      // P1-1: 인증 실패 시 자동 로그아웃 (토큰 만료, 사용자 정지 등)
      if ((res.status === 401 || res.status === 403) && !_isLoggingOut) {
        if (typeof window !== "undefined") {
          _isLoggingOut = true;
          const { createClient } = await import("@/lib/supabase");
          const supabase = createClient();
          await supabase.auth.signOut();
          window.location.href = "/login";
        }
      }
      // Rate limit 사용자 피드백
      if (res.status === 429) {
        const retryAfter = res.headers.get("Retry-After");
        const seconds = retryAfter ? parseInt(retryAfter, 10) : 60;
        throw new ApiError(
          `요청 한도를 초과했습니다. ${seconds}초 후 다시 시도해주세요.`,
          429,
        );
      }
      throw new ApiError(body.detail || `API 오류: ${res.status}`, res.status);
    }
    return res.json();
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("서버 응답 시간이 초과되었습니다");
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);

  }
}



/** fetchApi — GET 요청 중복 제거 래퍼 */
function fetchApi<T>(path: string, options?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const method = options?.method ?? "GET";
  if (method !== "GET") return _fetchApiImpl<T>(path, options);

  const url = `${getApiBase()}${path}`;
  const existing = _inflightRequests.get(url);
  if (existing) return existing as Promise<T>;

  const promise = _fetchApiImpl<T>(path, options).finally(() => {
    _inflightRequests.delete(url);
  });
  _inflightRequests.set(url, promise);
  return promise;
}
/** 단지 키워드 검색 */
export async function searchComplexes(keyword: string, limit = 50, signal?: AbortSignal, types?: string) {
  if (!HAS_BACKEND) return direct.searchComplexesDirect(keyword);
  let url = `/api/live/search?q=${encodeURIComponent(keyword)}`;
  if (types) url += `&types=${encodeURIComponent(types)}`;
  return fetchApi<{ complexes: Complex[]; total: number }>(
    url,
    { signal, timeoutMs: LIVE_TIMEOUT_MS } as RequestInit & { timeoutMs?: number },
  );
}

/** 지역별 단지 조회 */
export async function getComplexesByRegion(sido: string, sigungu?: string, dong?: string, signal?: AbortSignal, types?: string) {
  if (!HAS_BACKEND) return direct.getComplexesByRegionDirect(sido, sigungu, dong);
  let path = `/api/live/region?sido=${encodeURIComponent(sido)}`;
  if (sigungu) path += `&sigungu=${encodeURIComponent(sigungu)}`;
  if (dong) path += `&dong=${encodeURIComponent(dong)}`;
  if (types) path += `&types=${encodeURIComponent(types)}`;
  return fetchApi<{ complexes: Complex[]; total: number }>(path, { signal, timeoutMs: LIVE_TIMEOUT_MS } as any);
}

/** 단지 상세 */
export async function getComplex(complexNo: string) {
  if (!HAS_BACKEND) return direct.getComplexDirect(complexNo);
  return fetchApi<Complex>(`/api/complexes/${complexNo}`);
}

/** 단지별 매물 조회 */
export async function getArticles(complexNo: string, filters?: ArticleFilters) {
  if (!HAS_BACKEND) return direct.getArticlesDirect(complexNo, filters as any);
  const params = new URLSearchParams();
  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        params.set(key, String(value));
      }
    });
  }
  const qs = params.toString();
  return fetchApi<{ articles: Article[]; total: number; page: number; page_size: number }>(
    `/api/complexes/${complexNo}/articles${qs ? `?${qs}` : ""}`
  );
}


/** 실시간 매물 크롤링 (네이버 API에서 직접 가져옴) */
export async function liveArticles(complexNo: string) {
  if (!HAS_BACKEND) {
    const result = await direct.getArticlesDirect(complexNo, {});
    return { ...result, complex: null };
  }
  return fetchApi<{ articles: Article[]; total: number; page: number; page_size: number; complex: Complex | null }>(
    `/api/live/${complexNo}/articles`,
    { timeoutMs: LIVE_TIMEOUT_MS } as RequestInit & { timeoutMs?: number },
  );
}


/** 백그라운드 크롤링 시작 (즉시 반환) */
export async function startLiveCrawl(complexNo: string) {
  return fetchApi<CrawlProgress>(
    `/api/live/${complexNo}/articles/start-crawl`,
    { method: "POST", timeoutMs: DEFAULT_TIMEOUT_MS } as RequestInit & { timeoutMs?: number },
  );
}

/** 크롤링 진행률 폴링 */
export async function getCrawlStatus(complexNo: string) {
  return fetchApi<CrawlProgress>(
    `/api/live/${complexNo}/articles/crawl-status`,
    { timeoutMs: DEFAULT_TIMEOUT_MS } as any,
  );
}

/** 면적별 상세 */
export async function getPyeongDetails(complexNo: string) {
  if (!HAS_BACKEND) return { pyeong_details: [] };
  return fetchApi<{ pyeong_details: PyeongDetail[] }>(`/api/complexes/${complexNo}/pyeong-details`);
}


/** 매물 상세 실시간 (네이버 API 직접 조회 + DB 저장) */
export async function getArticleLive(articleNo: string) {
  if (!HAS_BACKEND) return direct.getArticleDirect(articleNo);
  return fetchApi<Article>(`/api/live/article/${articleNo}/detail`, { timeoutMs: 30_000 } as RequestInit & { timeoutMs?: number });
}

/** DB 통계 */
export async function getStats() {
  if (!HAS_BACKEND) return direct.getStatsDirect();
  return fetchApi<DbStats>(`/api/stats`);
}

/** 지역 목록 */
export async function getRegions() {
  if (!HAS_BACKEND) return direct.getRegionsDirect();
  return fetchApi<Regions>(`/api/regions`);
}

/** 엑셀 다운로드 (현재 필터 적용) */
export async function exportArticles(complexNo: string, filters?: ArticleFilters, accessToken?: string) {
  const params = new URLSearchParams({ complex_no: complexNo });
  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        params.set(key, String(value));
      }
    });
  }
  const url = `${getApiBase()}/api/articles/export?${params.toString()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  const headers: HeadersInit = {};
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  try {
    const res = await fetch(url, { method: "POST", signal: controller.signal, headers });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail || "엑셀 내보내기 실패");
    }
    const blob = await res.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = `매물_${complexNo}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(downloadUrl);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("엑셀 내보내기 시간이 초과되었습니다");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** 크롤링 트리거 (인증 필요) */
export async function triggerComplexCrawl(complexNo: string, accessToken: string) {
  return fetchApi<{ status: string; complex_no: string }>(
    `/api/crawl/complex/${complexNo}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
}

// ── 관리자 API ──

function adminHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/** 관리자: 사용자 목록 */
export async function getAdminUsers(token: string, params?: { status?: string; role?: string; page?: number }) {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.role) qs.set("role", params.role);
  if (params?.page) qs.set("page", String(params.page));
  return fetchApi<PaginatedResponse<UserProfile>>(`/api/admin/users?${qs}`, { headers: adminHeaders(token) });
}

/** 관리자: 사용자 역할/상태 변경 */
export async function updateAdminUser(token: string, userId: string, payload: UserUpdatePayload) {
  return fetchApi<{ status: string; changes: Record<string, unknown> }>(`/api/admin/users/${userId}`, {
    method: "PATCH",
    headers: { ...adminHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

/** 관리자: 사용자 정지 */
export async function suspendAdminUser(token: string, userId: string) {
  return fetchApi<{ status: string }>(`/api/admin/users/${userId}`, {
    method: "DELETE",
    headers: adminHeaders(token),
  });
}

/** 관리자: 크롤 작업 목록 */
export async function getAdminCrawlJobs(token: string, params?: { status?: string; page?: number }) {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.page) qs.set("page", String(params.page));
  return fetchApi<PaginatedResponse<CrawlJobDetail>>(`/api/admin/crawl-jobs?${qs}`, { headers: adminHeaders(token) });
}

/** 관리자: 크롤 작업 취소 */
export async function cancelAdminCrawlJob(token: string, jobId: number) {
  return fetchApi<{ status: string }>(`/api/admin/crawl-jobs/${jobId}/cancel`, {
    method: "POST",
    headers: adminHeaders(token),
  });
}

/** 관리자: 상세 통계 */
export async function getAdminDetailedStats(token: string) {
  return fetchApi<DetailedStats>(`/api/admin/stats/detailed`, { headers: adminHeaders(token) });
}

/** 관리자: 감사 로그 */
export async function getAdminAuditLogs(token: string, params?: { user_id?: string; action?: string; page?: number }) {
  const qs = new URLSearchParams();
  if (params?.user_id) qs.set("user_id", params.user_id);
  if (params?.action) qs.set("action", params.action);
  if (params?.page) qs.set("page", String(params.page));
  return fetchApi<PaginatedResponse<AuditLog>>(`/api/admin/audit-logs?${qs}`, { headers: adminHeaders(token) });
}

/** 관리자: 설정 목록 */
export async function getAdminSettings(token: string) {
  return fetchApi<{ items: AdminSetting[] }>(`/api/admin/settings`, { headers: adminHeaders(token) });
}

/** 관리자: 설정 변경 */
export async function updateAdminSetting(token: string, key: string, value: Record<string, unknown>) {
  return fetchApi<{ status: string }>(`/api/admin/settings/${key}`, {
    method: "PATCH",
    headers: { ...adminHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ value }),
  });
}

/** 가격 통계 (면적별/층수별, 거래유형 구분 포함) */
export async function getPriceStats(complexNo: string) {
  if (!HAS_BACKEND) return { complex_no: complexNo, total_articles: 0, by_area: [], by_floor: [] } as PriceStats;
  return fetchApi<PriceStats>(`/api/complexes/${complexNo}/price-stats`);
}

/** 관리자: 오래된 데이터 삭제 */
export async function deleteStaleData(token: string, days: number) {
  return fetchApi<{ deleted: number }>(`/api/admin/data/stale?days=${days}`, {
    method: "DELETE",
    headers: adminHeaders(token),
  });
}
