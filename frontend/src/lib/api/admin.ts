/**
 * 관리자 API — 모든 호출에 Bearer 토큰 필수
 */

import type { UserProfile, AuditLog, AdminSetting, DetailedStats, PaginatedResponse, UserUpdatePayload, CrawlJobDetail, SchedulerStatusResponse } from "@/types/admin";
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
export type CollectorName = "crime-stats" | "air-quality" | "emergency" | "childcare";

export async function triggerCollection(token: string, name: CollectorName) {
  return fetchApi<{ status: string; collector: string }>(
    `/api/admin/collect/${encodeURIComponent(name)}`,
    { method: "POST", headers: adminHeaders(token), timeoutMs: LIVE_TIMEOUT_MS } as RequestInit & { timeoutMs?: number },
  );
}
