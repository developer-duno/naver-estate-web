"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTokenReady } from "@/hooks/useAdminQuery";
import { queryKeys } from "@/lib/query-keys";
import AdminCard from "@/components/admin/AdminCard";
import CrawlJobTable from "@/components/admin/CrawlJobTable";
import CrawlSummary from "@/components/admin/CrawlSummary";
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

  const handleJumpToFailed = () => {
    setFilterStatus("failed");
    setPage(1);
    requestAnimationFrame(() => {
      document.getElementById("crawl-jobs-list")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  return (
    <>
      <h2 className="text-lg font-semibold mb-4">크롤링 관리</h2>

      {token && <CrawlSummary token={token} onJumpToFailed={handleJumpToFailed} />}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <SingleRecrawlCard getToken={getToken} />
        <ErrorRateChart getToken={getToken} />
      </div>

      <div className="mt-6">
        <AdminCard
          title="필터"
          help="크롤 작업 상태별 필터링. 새로고침 버튼으로 즉시 갱신"
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
          help="현재 큐에 등록된 크롤 작업. 실행 중/대기 상태에서 일시정지·취소 가능"
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
