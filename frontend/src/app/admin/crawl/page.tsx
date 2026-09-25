"use client";

import { Suspense, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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

/** URL 의 ?status= 값 — 목록에 있는 상태만 받고 나머지(오타·임의 값)는 "전체" 로 */
function parseStatus(raw: string | null): string {
  const s = raw ?? "";
  return STATUS_OPTIONS.some((o) => o.value === s) ? s : "";
}

/** URL 의 ?page= 값 — 1 이상 정수만, 아니면 1쪽 */
function parsePage(raw: string | null): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

interface ListFilter {
  status: string;
  jobType: string;
  page: number;
}

/** 목록 조건 → 주소 쿼리 (빈 조건·1쪽은 주소에 안 남겨 짧게) */
function filterToQuery({ status, jobType, page }: ListFilter): string {
  const qs = new URLSearchParams();
  if (status) qs.set("status", status);
  if (jobType) qs.set("job_type", jobType);
  if (page > 1) qs.set("page", String(page));
  return qs.toString();
}

const CANCEL_HELP =
  "취소는 되돌릴 수 없어요. 취소하면 작업 기록이 '취소됨'으로 바뀌지만, 이미 돌고 있던 수집을 그 자리에서 멈추지는 않아요 — 그때까지 받은 자료는 그대로 저장되고, 작업이 끝나도 기록은 '취소됨'으로 남아요";

function AdminCrawlContent() {
  // 대시보드의 "실패 자세히" 행·"7일 실패" 링크가 /admin/crawl?status=failed&job_type=<유형> 으로 보낸다.
  // 목록 조건(상태·유형·쪽)은 주소와 양방향으로 맞춘다 — 조건을 바꾸면 주소가 바뀌고(공유·새로고침해도
  // 같은 화면), 뒤로가기·주소 붙여넣기로 주소가 바뀌면 조건이 따라온다.
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname() || "/admin/crawl";
  const urlKey = searchParams.toString();
  const [filterStatus, setFilterStatus] = useState(() => parseStatus(searchParams.get("status")));
  const [filterJobType, setFilterJobType] = useState(() => searchParams.get("job_type") ?? "");
  const [page, setPage] = useState(() => parsePage(searchParams.get("page")));

  // 주소 → 조건: 주소가 바뀐 렌더에서 곧바로 맞춘다(effect 가 아니라 렌더 중 조정 — React 권장 방식).
  // 우리가 replace 한 주소가 돌아와도 같은 값이라 한 번 더 그릴 뿐 반복되지 않는다.
  const [syncedUrlKey, setSyncedUrlKey] = useState(urlKey);
  if (urlKey !== syncedUrlKey) {
    setSyncedUrlKey(urlKey);
    setFilterStatus(parseStatus(searchParams.get("status")));
    setFilterJobType(searchParams.get("job_type") ?? "");
    setPage(parsePage(searchParams.get("page")));
  }

  /** 조건 → 화면 + 주소. 조건을 바꾸는 곳은 전부 이 함수를 거친다 */
  const applyFilter = (next: ListFilter) => {
    setFilterStatus(next.status);
    setFilterJobType(next.jobType);
    setPage(next.page);
    const qs = filterToQuery(next);
    if (qs !== urlKey) router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const { token, getToken } = useTokenReady();
  const queryClient = useQueryClient();

  // 유형 조건은 BE(/api/admin/crawl-jobs?job_type=)가 전체 이력에서 걸러 쪽 번호와 함께 돌려준다
  const params = {
    status: filterStatus || undefined,
    job_type: filterJobType || undefined,
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
    applyFilter({ status: "failed", jobType: jobType ?? "", page: 1 });
    requestAnimationFrame(() => {
      document.getElementById("crawl-jobs-list")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const fetchedJobs = jobsQuery.data?.items ?? [];
  // 안전망 — 재시작 전 옛 BE 는 job_type 을 모르고 전체를 돌려주므로, 고른 유형과 다른 행은 한 번 더 거른다
  const visibleJobs = filterJobType
    ? fetchedJobs.filter((j) => j.job_type === filterJobType)
    : fetchedJobs;
  const listTitle = filterJobType
    ? `수집 작업 목록 (${jobTypeLabel(filterJobType)} 총 ${jobsQuery.data?.total ?? 0}건)`
    : `수집 작업 목록 (총 ${jobsQuery.data?.total ?? 0}건)`;

  return (
    <>
      <h2 className="text-lg font-semibold mb-2">자료 수집 관리</h2>
      <p className="text-sm text-gray-600 mb-4 leading-relaxed">
        <strong className="text-gray-800">자료 수집이란?</strong>{" "}
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
                onChange={(e) => applyFilter({ status: e.target.value, jobType: filterJobType, page: 1 })}
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
                onChange={(e) => applyFilter({ status: filterStatus, jobType: e.target.value, page: 1 })}
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

      {(jobsQuery.data?.total ?? 0) > 20 && (
        <div className="flex justify-center gap-2 mt-4">
          <button
            onClick={() => applyFilter({ status: filterStatus, jobType: filterJobType, page: Math.max(1, page - 1) })}
            disabled={page === 1}
            className="text-sm px-3 py-1 border rounded disabled:opacity-30"
          >
            이전
          </button>
          <span className="text-sm text-gray-500 py-1">{page} / {Math.ceil((jobsQuery.data?.total ?? 0) / 20)} 쪽</span>
          <button
            onClick={() => applyFilter({ status: filterStatus, jobType: filterJobType, page: page + 1 })}
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
