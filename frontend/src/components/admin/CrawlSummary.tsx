"use client";

/** /admin/crawl 최상단 — 현재 크롤 작업 한 줄 요약. queryKey 는 page.tsx 와 캐시 공유 */

import { useQueries } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { getAdminCrawlJobs } from "@/lib/api";
import type { CrawlJobDetail, PaginatedResponse } from "@/types/admin";

interface Props {
  token: string;
  /** 실패 N건 클릭 시 호출 — 부모에서 필터를 "failed" 로 바꾸고 작업 표로 스크롤 */
  onJumpToFailed?: () => void;
}

const STATUSES = ["running", "pending", "failed"] as const;

export default function CrawlSummary({ token, onJumpToFailed }: Props) {
  const queries = useQueries({
    queries: STATUSES.map((status) => ({
      queryKey: queryKeys.admin.crawlJobs({ status }),
      queryFn: () => getAdminCrawlJobs(token, { status }),
      enabled: !!token,
      staleTime: 30_000,
      refetchInterval: 30_000,
    })),
  });

  const isLoading = queries.some((q) => q.isLoading);
  const data = queries.map((q) => q.data) as (PaginatedResponse<CrawlJobDetail> | undefined)[];

  if (isLoading || data.some((d) => !d)) {
    return (
      <div
        className="bg-white border rounded-lg p-3 mb-4 h-12 animate-pulse"
        aria-label="크롤 요약 로딩 중"
      />
    );
  }

  const [running, pending, failed] = data.map((d) => d?.total ?? 0);
  const containerClass =
    failed > 0
      ? "bg-red-50 border-red-200"
      : pending > 10
        ? "bg-yellow-50 border-yellow-200"
        : "bg-white border-gray-200";

  return (
    <div
      className={`border rounded-lg p-3 mb-4 text-sm flex flex-wrap gap-x-3 gap-y-1 ${containerClass}`}
      aria-label="현재 크롤 작업 요약"
    >
      <span className="font-medium text-gray-700">현재 크롤:</span>
      <span className="text-gray-700">실행중 {running}</span>
      <span className={pending > 10 ? "text-yellow-800 font-medium" : "text-gray-700"}>
        대기 {pending}
      </span>
      {failed > 0 && onJumpToFailed ? (
        <button
          type="button"
          onClick={onJumpToFailed}
          className="text-red-700 font-medium underline-offset-2 hover:underline cursor-pointer"
          aria-label={`실패 ${failed}건 — 클릭 시 실패 작업만 표시`}
        >
          실패 {failed}건 (전체 기간) ↓
        </button>
      ) : (
        <span className={failed > 0 ? "text-red-700 font-medium" : "text-gray-700"}>
          실패 {failed}건 (전체 기간)
        </span>
      )}
    </div>
  );
}
