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
import AdminLeftNav from "@/components/admin/AdminLeftNav";
import AdminLivePanel from "@/components/admin/AdminLivePanel";
import { getAdminDetailedStats, getAdminAuditLogs } from "@/lib/api";
import { getActionLabel, getTargetLabel } from "@/lib/admin-labels";
import type { DetailedStats, AuditLog } from "@/types/admin";
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

  const loading = statsQuery.isLoading || logsQuery.isLoading;
  const error = statsQuery.error?.message ?? logsQuery.error?.message ?? "";
  const stats = statsQuery.data ?? null;
  const recentLogs = (logsQuery.data?.items ?? []).slice(0, 5);

  return (
    <>
      <h2 className="text-lg font-semibold mb-4">대시보드</h2>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 mb-4 flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => window.location.reload()} className="text-red-700 hover:underline text-xs ml-2">재시도</button>
        </div>
      )}

      <div className="lg:grid lg:grid-cols-[180px_1fr_280px] lg:gap-4">
        {/* 좌측 anchor nav (lg+ 만 노출) */}
        <div className="hidden lg:block lg:self-start"><AdminLeftNav /></div>

        {/* 중앙 본문 (RunningJobs 제거 = 11 카드 + 최근 활동 단독 렌더링) */}
        <div className="min-w-0">
          <div id="health"><HealthSummary token={token} /></div>

          <div id="weekly-issues" className="mb-4"><WeeklyIssuesCard token={token} /></div>

          <div id="stats"><StatsCards stats={stats} loading={loading} /></div>

          <div id="scheduler" className="mt-6">
            <SchedulerMonitor token={token} />
          </div>

          <div id="freshness" className="mt-6">
            <DataFreshnessCard token={token} />
          </div>

          <div id="naver-calls" className="mt-6">
            <NaverCallsCard getToken={getToken} />
          </div>

          <div id="quota" className="mt-6">
            <QuotaStatusCard token={token} />
          </div>

          <div id="failure" className="mt-6">
            <FailureBreakdown token={token} />
          </div>

          <div className="mt-6">
            <AdminCard title="최근 활동" help="관리자가 직접 누른 작업이나 자동으로 실행된 트리거 기록이에요 (최근 5건). 누가 언제 무슨 작업을 시작했는지 한눈에 볼 수 있어요">
              {recentLogs.length === 0 ? (
                <p className="text-sm text-gray-500">활동 기록이 없습니다</p>
              ) : (
                <ul className="space-y-2">
                  {recentLogs.map((l) => (
                    <li key={l.id} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">
                        <span className="bg-gray-100 text-xs px-1.5 py-0.5 rounded mr-1">{getActionLabel(l.action)}</span>
                        {l.target_type ? getTargetLabel(l.target_type, l.target_id) : ""}
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
        </div>

        {/* 우측 라이브 패널 (lg+ 만 노출) */}
        <div className="hidden lg:block lg:self-start"><AdminLivePanel /></div>
      </div>
    </>
  );
}
