/**
 * 관리자 API — 모든 호출에 Bearer 토큰 필수
 */

import type { UserProfile, AuditLog, AdminSetting, AgentVerification, DetailedStats, PaginatedResponse, UserUpdatePayload, CrawlJobDetail, SchedulerStatusResponse } from "@/types/admin";
import { fetchApi, adminHeaders, LIVE_TIMEOUT_MS } from "./core";

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
  return fetchApi<{ status: string; changes: Record<string, unknown> }>(`/api/admin/users/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    headers: { ...adminHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

/** 관리자: 사용자 정지 */
export async function suspendAdminUser(token: string, userId: string) {
  return fetchApi<{ status: string }>(`/api/admin/users/${encodeURIComponent(userId)}`, {
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
  return fetchApi<{ status: string }>(`/api/admin/crawl-jobs/${encodeURIComponent(String(jobId))}/cancel`, {
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
  return fetchApi<{ status: string }>(`/api/admin/settings/${encodeURIComponent(key)}`, {
    method: "PATCH",
    headers: { ...adminHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ value }),
  });
}

/** 관리자: 오래된 데이터 삭제 */
export async function deleteStaleData(token: string, days: number) {
  return fetchApi<{ deleted: number }>(`/api/admin/data/stale?days=${days}`, {
    method: "DELETE",
    headers: adminHeaders(token),
  });
}

/** 관리자: 스케줄러 모니터링 상태 조회 */
export async function getSchedulerStatus(token: string) {
  return fetchApi<SchedulerStatusResponse>(`/api/admin/scheduler-status`, { headers: adminHeaders(token) });
}

/** 관리자: 데이터 수집 트리거 (동기 블로킹, 최대 120초) */
export type CollectorName = "crime-stats" | "air-quality" | "emergency" | "childcare" | "backfill-price";

export async function triggerCollection(token: string, name: CollectorName) {
  return fetchApi<{ status: string; collector: string }>(
    `/api/admin/collect/${encodeURIComponent(name)}`,
    { method: "POST", headers: adminHeaders(token), timeoutMs: LIVE_TIMEOUT_MS } as RequestInit & { timeoutMs?: number },
  );
}

/** 관리자: 검증 신청 목록 */
export async function getAdminVerifications(token: string, params?: { status?: string; page?: number }) {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.page) qs.set("page", String(params.page));
  return fetchApi<PaginatedResponse<AgentVerification>>(`/api/admin/verifications?${qs}`, { headers: adminHeaders(token) });
}

/** 관리자: 검증 승인 */
export async function approveVerification(token: string, id: number) {
  return fetchApi<{ status: string }>(`/api/admin/verifications/${id}/approve`, {
    method: "PATCH",
    headers: adminHeaders(token),
  });
}

/** 관리자: 검증 거부 */
export async function rejectVerification(token: string, id: number, reason: string) {
  return fetchApi<{ status: string }>(`/api/admin/verifications/${id}/reject`, {
    method: "PATCH",
    headers: { ...adminHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
}

/** 관리자: 매물 일괄 재크롤 — 지금 실행 안전도 조회 */
export interface RecrawlStatus {
  level: "safe" | "warn" | "danger";
  message: string;
  current_kst_hour: number;
  running_jobs_count: number;
  running_jobs: Array<{ id: number; job_type: string; scheduler_job_id: string | null; started_at: string | null }>;
  recrawl_in_progress: boolean;
  recommended_window_kst: string;
  estimated_seconds_per_100: number;
}

export async function getRecrawlStatus(token: string) {
  return fetchApi<RecrawlStatus>("/api/admin/recrawl/status", { headers: adminHeaders(token) });
}

/** 관리자: 매물 일괄 재크롤 즉시 실행 */
export async function runRecrawlArticles(token: string, batchSize: number, force: boolean = false) {
  return fetchApi<{ status: string; batch_size: number; level: string; message: string; parent_job_id: number }>(
    "/api/admin/recrawl/articles",
    {
      method: "POST",
      headers: { ...adminHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({ batch_size: batchSize, force }),
    },
  );
}

/** 관리자: 매물 일괄 재크롤 진행률 (부모 job) */
export interface RecrawlProgress {
  job: {
    id: number;
    status: string;
    total_items: number;
    processed_items: number;
    started_at: string | null;
    completed_at: string | null;
    error_message: string | null;
  } | null;
}

export async function getRecrawlProgress(token: string) {
  return fetchApi<RecrawlProgress>("/api/admin/recrawl/progress", { headers: adminHeaders(token) });
}

/** 관리자: 단건 강제 재크롤 (특정 단지 1개 즉시 트리거) */
export interface SingleRecrawlResponse {
  status: string;
  complex_no: string;
  complex_name: string;
}

export async function triggerSingleRecrawl(
  token: string,
  complexNo: string,
  force: boolean = false,
) {
  return fetchApi<SingleRecrawlResponse>("/api/admin/recrawl/single", {
    method: "POST",
    headers: { ...adminHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ complex_no: complexNo, force }),
  });
}

/** 관리자: 크롤 잡 일시정지 */
export async function pauseAdminCrawlJob(token: string, jobId: number) {
  return fetchApi<{ status: string }>(
    `/api/admin/crawl-jobs/${encodeURIComponent(String(jobId))}/pause`,
    { method: "POST", headers: adminHeaders(token) },
  );
}

/** 관리자: 크롤 잡 재개 */
export async function resumeAdminCrawlJob(token: string, jobId: number) {
  return fetchApi<{ status: string }>(
    `/api/admin/crawl-jobs/${encodeURIComponent(String(jobId))}/resume`,
    { method: "POST", headers: adminHeaders(token) },
  );
}

/** 관리자: 에러율 차트 데이터 — 일자별 status 분포 */
export interface ErrorStatsRow {
  date: string;
  completed: number;
  failed: number;
  paused: number;
  pending: number;
  running: number;
  cancelled: number;
}

export async function getAdminErrorStats(token: string, days: 7 | 14 | 30 = 14) {
  return fetchApi<{ days: number; rows: ErrorStatsRow[] }>(
    `/api/admin/error-stats?days=${days}`,
    { headers: adminHeaders(token) },
  );
}

export interface NaverCallWindowCounts {
  "10m": number;
  "1h": number;
  "24h": number;
}

export interface NaverCallStats {
  labels: Record<string, NaverCallWindowCounts>;
  totals: NaverCallWindowCounts;
}

/** 네이버 API 호출 계측 — 라벨별 10분/1시간/24시간 슬라이딩 윈도우 */
export async function getAdminNaverCalls(token: string) {
  return fetchApi<NaverCallStats>(`/api/admin/naver-calls`, {
    headers: adminHeaders(token),
  });
}
