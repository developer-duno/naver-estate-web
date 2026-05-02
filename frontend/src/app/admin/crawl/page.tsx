"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTokenReady } from "@/hooks/useAdminQuery";
import { queryKeys } from "@/lib/query-keys";
import AdminCard from "@/components/admin/AdminCard";
import CrawlJobTable from "@/components/admin/CrawlJobTable";
import CrawlSummary from "@/components/admin/CrawlSummary";
import FailureBreakdown from "@/components/admin/FailureBreakdown";
import SingleRecrawlCard from "@/components/admin/SingleRecrawlCard";
import ErrorRateChart from "@/components/admin/ErrorRateChart";
import {
  getAdminCrawlJobs,
  cancelAdminCrawlJob,
  pauseAdminCrawlJob,
  resumeAdminCrawlJob,
} from "@/lib/api";
import type { CrawlJobDetail, PaginatedResponse } from "@/types/admin";

export default function AdminCrawlPage() {
  const [filterStatus, setFilterStatus] = useState("");
  const [page, setPage] = useState(1);

  const { token, getToken } = useTokenReady();
  const queryClient = useQueryClient();

  const params = {
    status: filterStatus || undefined,
    page,
  };

  const jobsQuery = useQuery<PaginatedResponse<CrawlJobDetail>, Error>({
    queryKey: queryKeys.admin.crawlJobs(params as Record<string, unknown>),
    queryFn: () => getAdminCrawlJobs(token, params),
    enabled: !!token,
    staleTime: 0,
  });

  const cancelMutation = useMutation<{ status: string }, Error, number>({
    mutationFn: async (jobId) => {
      const t = await getToken();
      return cancelAdminCrawlJob(t, jobId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.crawlJobs() });
    },
  });

  const pauseMutation = useMutation<{ status: string }, Error, number>({
    mutationFn: async (jobId) => {
      const t = await getToken();
      return pauseAdminCrawlJob(t, jobId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.crawlJobs() });
    },
  });

  const resumeMutation = useMutation<{ status: string }, Error, number>({
    mutationFn: async (jobId) => {
      const t = await getToken();
      return resumeAdminCrawlJob(t, jobId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.crawlJobs() });
    },
  });

  const error =
    jobsQuery.error?.message ??
    cancelMutation.error?.message ??
    pauseMutation.error?.message ??
    resumeMutation.error?.message ??
    "";

  const handleCancel = async (jobId: number) => {
    if (!confirm("이 작업을 취소하시겠습니까?")) return;
    await cancelMutation.mutateAsync(jobId);
  };

  const handlePause = async (jobId: number) => {
    if (!confirm("이 작업을 일시정지하시겠습니까?")) return;
    await pauseMutation.mutateAsync(jobId);
  };

  const handleResume = async (jobId: number) => {
    await resumeMutation.mutateAsync(jobId);
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.admin.crawlJobs(params as Record<string, unknown>) });
  };

  const handleJumpToFailed = (_jobType?: string) => {
    // jobType 인자는 향후 유형별 추가 필터를 위해 받아두지만, 현재 BE 의 /crawl-jobs 는 status 필터만
    // 지원하므로 일단 status="failed" 만 적용. (유형별 필터는 후속 BE 작업 시 확장)
    setFilterStatus("failed");
    setPage(1);
    requestAnimationFrame(() => {
      document.getElementById("crawl-jobs-list")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  return (
    <>
      <h2 className="text-lg font-semibold mb-2">크롤링 관리</h2>
      <p className="text-sm text-gray-600 mb-4 leading-relaxed">
        <strong className="text-gray-800">크롤링이란?</strong>{" "}
        네이버 부동산·국토교통부·에어코리아 등 외부 사이트에서 매물·시세·환경 정보를 자동으로 가져오는 작업이에요.
        이 페이지에서는 그 작업들이 잘 돌고 있는지, 어디서 멈췄는지 확인하고 직접 다시 돌릴 수 있어요.
      </p>

      {token && <CrawlSummary token={token} onJumpToFailed={handleJumpToFailed} />}

      {token && (
        <div className="mt-2 mb-4">
          <FailureBreakdown token={token} onJumpToFailed={handleJumpToFailed} />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <SingleRecrawlCard getToken={getToken} />
        <ErrorRateChart getToken={getToken} />
      </div>

      <div className="mt-6">
        <AdminCard
          title="필터"
          help="작업 상태(실행 중·대기·완료·실패 등)로 좁혀서 볼 수 있어요. '새로고침'을 누르면 표를 즉시 다시 불러와요"
          action={
            <button
              onClick={handleRefresh}
              className="text-sm px-3 py-1 border rounded hover:bg-gray-50"
            >
              새로고침
            </button>
          }
        >
          <select
            value={filterStatus}
            onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
            className="text-sm border rounded px-2 py-1"
          >
            <option value="">상태 전체</option>
            <option value="running">실행 중</option>
            <option value="pending">대기</option>
            <option value="paused">일시정지</option>
            <option value="completed">완료</option>
            <option value="failed">실패</option>
            <option value="cancelled">취소</option>
          </select>
        </AdminCard>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 mt-4">{error}</div>
      )}

      <div id="crawl-jobs-list" className="mt-6 scroll-mt-4">
        <AdminCard
          title={`크롤 작업 목록 (총 ${jobsQuery.data?.total ?? 0}건)`}
          help="지금까지 실행됐거나 대기 중인 모든 자동 수집 작업이에요. 실행 중이거나 대기 중인 작업은 직접 일시정지·취소할 수 있어요"
        >
          {jobsQuery.isLoading ? (
            <div className="text-sm text-gray-500 py-8 text-center" role="status">로딩 중...</div>
          ) : (
            <CrawlJobTable
              jobs={jobsQuery.data?.items ?? []}
              onCancel={handleCancel}
              onPause={handlePause}
              onResume={handleResume}
            />
          )}
        </AdminCard>
      </div>

      {(jobsQuery.data?.total ?? 0) > 20 && (
        <div className="flex justify-center gap-2 mt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="text-sm px-3 py-1 border rounded disabled:opacity-30"
          >
            이전
          </button>
          <span className="text-sm text-gray-500 py-1">{page} / {Math.ceil((jobsQuery.data?.total ?? 0) / 20)}</span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= Math.ceil((jobsQuery.data?.total ?? 0) / 20)}
            className="text-sm px-3 py-1 border rounded disabled:opacity-30"
          >
            다음
          </button>
        </div>
      )}
    </>
  );
}
