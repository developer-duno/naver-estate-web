"use client";

import { useQuery } from "@tanstack/react-query";
import { useTokenReady } from "@/hooks/useAdminQuery";
import { queryKeys } from "@/lib/query-keys";
import StatsCards from "@/components/admin/StatsCards";
import BulkRecrawlCard from "@/components/admin/BulkRecrawlCard";
import CollectorTrigger from "@/components/admin/CollectorTrigger";
import SchedulerMonitor from "@/components/admin/SchedulerMonitor";
import DataFreshnessCard from "@/components/admin/DataFreshnessCard";
import HealthSummary from "@/components/admin/HealthSummary";
import WeeklyIssuesCard from "@/components/admin/WeeklyIssuesCard";
import NaverCallsCard from "@/components/admin/NaverCallsCard";
import QuotaStatusCard from "@/components/admin/QuotaStatusCard";
import FailureBreakdown from "@/components/admin/FailureBreakdown";
import AdminCard from "@/components/admin/AdminCard";
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

      <HealthSummary token={token} />

      <div className="mb-4"><WeeklyIssuesCard token={token} /></div>

      <StatsCards stats={stats} loading={loading} />

      <div className="mt-6">
        <SchedulerMonitor token={token} />
      </div>

      <div className="mt-6" id="freshness">
        <DataFreshnessCard token={token} />
      </div>

      <div className="mt-6">
        <NaverCallsCard getToken={getToken} />
      </div>

      <div className="mt-6">
        <QuotaStatusCard token={token} />
      </div>

      <div className="mt-6">
        <FailureBreakdown token={token} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        <AdminCard title="지금 돌아가는 작업" help="현재 서버에서 실행 중인 수집 작업이에요. '처리 / 총 건수'로 진행률을 보여줘요. '오래된 단지 한 번에 다시 수집'을 눌러서 시작한 작업도 여기에 표시돼요">
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
        </AdminCard>

        <AdminCard title="최근 활동" help="관리자가 직접 누른 작업이나 자동으로 실행된 트리거 기록이에요 (최근 5건). 누가 언제 무슨 작업을 시작했는지 한눈에 볼 수 있어요">
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
        </AdminCard>
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
