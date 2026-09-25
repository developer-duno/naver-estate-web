"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTokenReady } from "@/hooks/useAdminQuery";
import { queryKeys } from "@/lib/query-keys";
import AdminCard from "@/components/admin/AdminCard";
import CrawlJobTable from "@/components/admin/CrawlJobTable";
import CrawlSummary from "@/components/admin/CrawlSummary";
import FailureBreakdown from "@/components/admin/FailureBreakdown";
import SingleRecrawlCard from "@/components/admin/SingleRecrawlCard";
import ErrorRateChart from "@/components/admin/ErrorRateChart";
import { CRAWL_JOB_LABELS, jobTypeLabel } from "@/lib/crawl-job-labels";
import {
  getAdminCrawlJobs,
  cancelAdminCrawlJob,
  pauseAdminCrawlJob,
  resumeAdminCrawlJob,
} from "@/lib/api";
import type { CrawlJobDetail, PaginatedResponse } from "@/types/admin";

/** 목록 상태 필터에 쓸 수 있는 값 (URL 쿼리 ?status= 도 이 안에서만 받는다) */
const STATUS_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "running", label: "실행 중" },
  { value: "pending", label: "대기" },
  { value: "paused", label: "일시정지" },
  { value: "completed", label: "완료" },
  { value: "failed", label: "실패" },
  { value: "cancelled", label: "취소" },
];

/**
 * 유형으로 거를 때 한 번에 받아 오는 최근 작업 수.
 * BE /api/admin/crawl-jobs 는 아직 job_type 조건을 받지 않아서(상태·쪽 번호만), 유형 조건은
 * 최근 작업을 BE 상한(page_size 100)만큼 받아 화면에서 거른다 — 그 한계를 화면에도 밝힌다.
 */
const JOB_TYPE_SCAN_SIZE = 100;

const CANCEL_HELP =
  "취소는 되돌릴 수 없어요. 취소하면 작업 기록이 '취소됨'으로 바뀌지만, 이미 돌고 있던 수집을 그 자리에서 멈추지는 않아요 — 그때까지 받은 자료는 그대로 저장되고, 작업이 끝나도 기록은 '취소됨'으로 남아요";

function AdminCrawlContent() {
  // 대시보드의 "실패 자세히" 행·"7일 실패" 링크가 /admin/crawl?status=failed&job_type=<유형> 으로 보낸다
  const searchParams = useSearchParams();
  const [filterStatus, setFilterStatus] = useState(() => {
    const s = searchParams.get("status") ?? "";
    return STATUS_OPTIONS.some((o) => o.value === s) ? s : "";
  });
  const [filterJobType, setFilterJobType] = useState(() => searchParams.get("job_type") ?? "");
  const [page, setPage] = useState(1);

  const { token, getToken } = useTokenReady();
  const queryClient = useQueryClient();

  const params = filterJobType
    ? { status: filterStatus || undefined, page: 1, page_size: JOB_TYPE_SCAN_SIZE }
    : { status: filterStatus || undefined, page };

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
    if (
      !confirm(
        "이 작업을 취소할까요? 되돌릴 수 없어요. 기록만 '취소됨'으로 바뀌고, 이미 돌고 있는 수집은 그 자리에서 멈추지 않아요.",
      )
    )
      return;
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

  const handleJumpToFailed = (jobType?: string) => {
    // 실패 잡 목록으로 점프 + 부드러운 스크롤. 유형을 받으면 버리지 않고 유형 조건도 건다
    setFilterStatus("failed");
    setFilterJobType(jobType ?? "");
    setPage(1);
    requestAnimationFrame(() => {
      document.getElementById("crawl-jobs-list")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const fetchedJobs = jobsQuery.data?.items ?? [];
  const visibleJobs = filterJobType
    ? fetchedJobs.filter((j) => j.job_type === filterJobType)
    : fetchedJobs;
  const listTitle = filterJobType
    ? `수집 작업 목록 (${jobTypeLabel(filterJobType)} ${visibleJobs.length}건 · 최근 ${fetchedJobs.length}건 중)`
    : `수집 작업 목록 (총 ${jobsQuery.data?.total ?? 0}건)`;

  return (
    <>
      <h2 className="text-lg font-semibold mb-2">크롤링 관리</h2>
      <p className="text-sm text-gray-600 mb-4 leading-relaxed">
        <strong className="text-gray-800">크롤링이란?</strong>{" "}
        네이버 부동산·국토교통부·에어코리아 등 외부 사이트에서 매물·시세·환경 정보를 자동으로 가져오는 작업이에요.
        이 페이지에서는 그 작업들이 잘 돌고 있는지, 어디서 멈췄는지 확인하고 직접 다시 돌릴 수 있어요.
      </p>

      {token && <CrawlSummary token={token} onJumpToFailed={() => handleJumpToFailed()} />}

      {token && (
        <div className="mt-2 mb-4">
          <FailureBreakdown token={token} onJumpToFailed={handleJumpToFailed} />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <SingleRecrawlCard getToken={getToken} />
        <ErrorRateChart getToken={getToken} />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 mt-4">{error}</div>
      )}

      <div id="crawl-jobs-list" className="mt-6 scroll-mt-4">
        <AdminCard
          title={listTitle}
          help={`지금까지 실행됐거나 대기 중인 모든 자동 수집 작업이에요. 실행 중이거나 대기 중인 작업은 직접 일시정지·취소할 수 있어요. '진행률'은 (처리한 건수)/(할 일 건수) 예요 — 0/0건은 그날 할 일이 없었다는 뜻이라 문제가 아니에요. ${CANCEL_HELP}`}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="상태로 거르기"
                value={filterStatus}
                onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
                className="text-sm border rounded px-2 py-1"
              >
                <option value="">상태 전체</option>
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <select
                aria-label="유형으로 거르기"
                value={filterJobType}
                onChange={(e) => { setFilterJobType(e.target.value); setPage(1); }}
                className="text-sm border rounded px-2 py-1 max-w-[12rem]"
              >
                <option value="">유형 전체</option>
                {filterJobType && !CRAWL_JOB_LABELS[filterJobType] && (
                  <option value={filterJobType}>{jobTypeLabel(filterJobType)}</option>
                )}
                {Object.entries(CRAWL_JOB_LABELS).map(([code, { label }]) => (
                  <option key={code} value={code}>{label}</option>
                ))}
              </select>
              <button
                onClick={handleRefresh}
                className="text-sm px-3 py-1 border rounded hover:bg-gray-50"
              >
                새로고침
              </button>
            </div>
          }
        >
          {filterJobType && (
            <p className="mb-2 text-xs text-gray-500">
              유형으로 거르기는 가장 최근 작업 {JOB_TYPE_SCAN_SIZE}건 안에서만 찾아요. 더 오래된 작업은 유형 전체로 바꿔 쪽을 넘겨 보세요.
            </p>
          )}
          {jobsQuery.isLoading ? (
            <div className="text-sm text-gray-500 py-8 text-center" role="status">로딩 중...</div>
          ) : (
            <CrawlJobTable
              jobs={visibleJobs}
              onCancel={handleCancel}
              onPause={handlePause}
              onResume={handleResume}
            />
          )}
        </AdminCard>
      </div>

      {!filterJobType && (jobsQuery.data?.total ?? 0) > 20 && (
        <div className="flex justify-center gap-2 mt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="text-sm px-3 py-1 border rounded disabled:opacity-30"
          >
            이전
          </button>
          <span className="text-sm text-gray-500 py-1">{page} / {Math.ceil((jobsQuery.data?.total ?? 0) / 20)} 쪽</span>
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

export default function AdminCrawlPage() {
  // useSearchParams 는 Suspense 경계가 필요하다 (compare/page.tsx 와 같은 방식)
  return (
    <Suspense fallback={<div className="text-sm text-gray-500 py-8 text-center" role="status">로딩 중...</div>}>
      <AdminCrawlContent />
    </Suspense>
  );
}
