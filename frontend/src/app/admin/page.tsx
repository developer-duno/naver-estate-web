"use client";

import { useQuery } from "@tanstack/react-query";
import { useTokenReady } from "@/hooks/useAdminQuery";
import { queryKeys } from "@/lib/query-keys";
import StatsCards from "@/components/admin/StatsCards";
import BulkRecrawlCard from "@/components/admin/BulkRecrawlCard";
import CollectorTrigger from "@/components/admin/CollectorTrigger";
import SchedulerMonitor from "@/components/admin/SchedulerMonitor";
import { getAdminDetailedStats, getAdminAuditLogs, getAdminCrawlJobs } from "@/lib/api";
import type { DetailedStats, AuditLog, CrawlJobDetail } from "@/types/admin";
import type { PaginatedResponse } from "@/types/admin";

export default function AdminDashboard() {
  const { token, getToken } = useTokenReady();

  const statsQuery = useQuery<DetailedStats, Error>({
    queryKey: queryKeys.admin.stats(),
    queryFn: () => getAdminDetailedStats(token),
    enabled: !!token,
    staleTime: 30_000,
  });

  const logsQuery = useQuery<PaginatedResponse<AuditLog>, Error>({
    queryKey: [...queryKeys.admin.auditLogs(), "dashboard"] as const,
    queryFn: () => getAdminAuditLogs(token, { page: 1 }),
    enabled: !!token,
    staleTime: 30_000,
  });

  const jobsQuery = useQuery<PaginatedResponse<CrawlJobDetail>, Error>({
    queryKey: [...queryKeys.admin.crawlJobs(), "running"] as const,
    queryFn: () => getAdminCrawlJobs(token, { status: "running" }),
    enabled: !!token,
    staleTime: 30_000,
  });

  const loading = statsQuery.isLoading || logsQuery.isLoading || jobsQuery.isLoading;
  const error = statsQuery.error?.message ?? logsQuery.error?.message ?? jobsQuery.error?.message ?? "";
  const stats = statsQuery.data ?? null;
  const recentLogs = (logsQuery.data?.items ?? []).slice(0, 5);
  const runningJobs = jobsQuery.data?.items ?? [];

  return (
    <>
      <h2 className="text-lg font-semibold mb-4">대시보드</h2>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 mb-4 flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => window.location.reload()} className="text-red-700 hover:underline text-xs ml-2">재시도</button>
        </div>
      )}

      <StatsCards stats={stats} loading={loading} />

      <div className="mt-6">
        <SchedulerMonitor token={token} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        {/* 실행 중인 크롤링 */}
        <div className="bg-white border rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">실행 중인 크롤링</h3>
          {runningJobs.length === 0 ? (
            <p className="text-sm text-gray-500">실행 중인 작업이 없습니다</p>
          ) : (
            <ul className="space-y-2">
              {runningJobs.map((j) => (
                <li key={j.id} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">{j.job_type} — {j.target_id || "전체"}</span>
                  <span className="text-xs text-blue-600">{j.processed_items}/{j.total_items}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 최근 활동 */}
        <div className="bg-white border rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">최근 활동</h3>
          {recentLogs.length === 0 ? (
            <p className="text-sm text-gray-500">활동 기록이 없습니다</p>
          ) : (
            <ul className="space-y-2">
              {recentLogs.map((l) => (
                <li key={l.id} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">
                    <span className="bg-gray-100 text-xs px-1.5 py-0.5 rounded mr-1">{l.action}</span>
                    {l.target_type ? `${l.target_type}:${l.target_id || ""}` : ""}
                  </span>
                  <span className="text-xs text-gray-500">
                    {l.created_at ? new Date(l.created_at).toLocaleString("ko") : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-6">
        <CollectorTrigger getToken={getToken} />
      </div>

      <div className="mt-6">
        <BulkRecrawlCard getToken={getToken} />
      </div>
    </>
  );
}
