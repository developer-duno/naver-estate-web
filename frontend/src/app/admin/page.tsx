"use client";

/**
 * 관리자 대시보드 — 세로 한 열 4층 (세션 419 리뉴얼, 사장님 지시 "뭐가 이리 난잡해?")
 *
 *  1층 지금 상태 : 데이터 상태 한 줄 + 지금 돌아가는 작업 / 이번 주 챙길 일
 *  2층 숫자      : 핵심 숫자 4칸 / 공공데이터 하루 사용량
 *  3층 원인      : 접힌 절 5개(펼쳤을 때만 불러온다 — AdminSection)
 *  4층 작업      : 외부 데이터 받아오기 / 오래된 단지 다시 수집 → 최근 활동
 *
 * 24시간 오류·채워진 비율·가치 점수는 /admin/data 에서 본다(한 화면에 같은 숫자는 한 번만).
 * 단 24시간 실패 건수는 3층 "실패 자세히" 절 제목 옆 칩으로도 알린다(접힌 채로 보이게).
 */

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
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
import TrafficCard from "@/components/admin/TrafficCard";
import QuotaStatusCard from "@/components/admin/QuotaStatusCard";
import FailureBreakdown from "@/components/admin/FailureBreakdown";
import AdminCard from "@/components/admin/AdminCard";
import AdminSection from "@/components/admin/AdminSection";
import RunningJobsLine from "@/components/admin/RunningJobsLine";
import { getAdminDetailedStats, getAdminAuditLogs } from "@/lib/api";
import { getActionLabel, getTargetLabel } from "@/lib/admin-labels";
import type { DetailedStats, AuditLog } from "@/types/admin";
import type { PaginatedResponse } from "@/types/admin";

export default function AdminDashboard() {
  const { token, getToken } = useTokenReady();
  const router = useRouter();

  /** 실패 유형을 누르면 수집 작업 목록을 "실패 + 그 유형" 으로 걸러 연다 (원칙 2: 다음 행동으로 잇기) */
  const jumpToFailed = (jobType?: string) => {
    const qs = new URLSearchParams({ status: "failed" });
    if (jobType) qs.set("job_type", jobType);
    router.push(`/admin/crawl?${qs.toString()}`);
  };

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

      {/* 1층 — 지금 상태 */}
      <div className="grid gap-4 lg:grid-cols-2 mb-4 items-start">
        <AdminCard title="지금 상태">
          <HealthSummary token={token} />
          <RunningJobsLine token={token} />
        </AdminCard>
        <WeeklyIssuesCard token={token} />
      </div>

      {/* 2층 — 숫자 (핵심 4칸만) */}
      <div className="grid gap-4 lg:grid-cols-[1fr_320px] mb-4 items-start">
        <div className="min-w-0">
          <StatsCards stats={stats} loading={loading} compact />
        </div>
        <QuotaStatusCard token={token} />
      </div>

      {/* 3층 — 원인 (기본 접힘, 펼쳤을 때만 불러온다) */}
      <div className="space-y-3 mb-4">
        <AdminSection id="scheduler" title="자동 작업 현황">
          <SchedulerMonitor token={token} />
        </AdminSection>
        <AdminSection id="freshness" title="데이터 신선도">
          <DataFreshnessCard token={token} />
        </AdminSection>
        {/* 24시간 실패가 있으면 절을 안 열어도 제목 옆 칩으로 건수를 보인다(없으면 칩 없음) */}
        <AdminSection
          id="failure"
          title="실패 자세히 (최근 24시간)"
          badge={stats && stats.error_count_24h > 0 ? `${stats.error_count_24h}건` : undefined}
        >
          <FailureBreakdown token={token} onJumpToFailed={jumpToFailed} />
        </AdminSection>
        <AdminSection id="naver-calls" title="네이버 호출 횟수">
          <NaverCallsCard getToken={getToken} />
        </AdminSection>
        <AdminSection id="traffic" title="방문·요청 통계">
          <TrafficCard getToken={getToken} />
        </AdminSection>
      </div>

      {/* 4층 — 작업 */}
      <div className="grid gap-4 lg:grid-cols-2 mb-4 items-start">
        <CollectorTrigger getToken={getToken} />
        <BulkRecrawlCard getToken={getToken} />
      </div>

      <AdminCard title="최근 활동" help="관리자가 직접 누른 작업이나 자동으로 실행된 트리거 기록이에요 (최근 5건). 누가 언제 무슨 작업을 시작했는지 한눈에 볼 수 있어요">
        {recentLogs.length === 0 ? (
          <p className="text-sm text-gray-500">활동 기록이 없습니다</p>
        ) : (
          <ul className="space-y-2">
            {recentLogs.map((l) => (
              <li key={l.id} className="flex items-center justify-between text-sm">
                <span className="text-gray-600">
                  <span className="bg-gray-100 text-xs px-1.5 py-0.5 rounded mr-1">{getActionLabel(l.action)}</span>
                  {/* 사용자 대상은 36자 UUID 대신 앞 8자 + "…" (전체는 마우스를 올리면) */}
                  {l.target_type === "user" && l.target_id && l.target_id.length > 8 ? (
                    <span title={l.target_id}>{getTargetLabel("user", `${l.target_id.slice(0, 8)}…`)}</span>
                  ) : l.target_type ? (
                    getTargetLabel(l.target_type, l.target_id)
                  ) : (
                    ""
                  )}
                </span>
                <span className="text-xs text-gray-500">
                  {l.created_at ? new Date(l.created_at).toLocaleString("ko") : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </AdminCard>
    </>
  );
}
