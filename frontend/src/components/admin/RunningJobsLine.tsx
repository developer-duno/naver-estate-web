"use client";

/**
 * 대시보드 1층 "지금 상태" 카드 안의 한 줄 — 지금 서버에서 돌고 있는 수집 작업.
 *
 * 창을 다시 눌러도 새로 받지 않는 설정이라(refetchOnWindowFocus=false, lib/query-client.ts)
 * 15초마다 저절로 다시 받는 것 말고는 새로 받을 길이 없다. 끄면 끝난 작업이 계속 "도는 중"으로 남는다.
 */

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { getAdminCrawlJobs } from "@/lib/api";
import { jobTypeLabel } from "@/lib/crawl-job-labels";
import type { CrawlJobDetail, PaginatedResponse } from "@/types/admin";

export const RUNNING_JOBS_REFETCH_MS = 15_000;

interface Props {
  token: string;
}

function progressText(j: CrawlJobDetail): string {
  const done = (j.processed_items ?? 0).toLocaleString("ko");
  if ((j.total_items ?? 0) > 0) {
    return `${j.total_items.toLocaleString("ko")}건 중 ${done}건 처리`;
  }
  return `${done}건 처리`;
}

function startedText(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // h23 = "PM 01:05" 대신 "13:05" (영문 AM/PM 표기를 피한다). 한국 시각으로 고정.
  return `${d.toLocaleTimeString("ko", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Seoul" })} 시작`;
}

export default function RunningJobsLine({ token }: Props) {
  const { data, isLoading, error } = useQuery<PaginatedResponse<CrawlJobDetail>, Error>({
    queryKey: [...queryKeys.admin.crawlJobs(), "running"] as const,
    queryFn: () => getAdminCrawlJobs(token, { status: "running" }),
    enabled: !!token,
    staleTime: 10_000,
    refetchInterval: RUNNING_JOBS_REFETCH_MS,
  });

  if (error) {
    return <p className="text-sm text-red-700">지금 돌아가는 작업을 불러오지 못했어요.</p>;
  }
  if (isLoading || !data) {
    return <div className="h-5 bg-gray-100 rounded animate-pulse" aria-label="지금 돌아가는 작업 불러오는 중" />;
  }

  const jobs = data.items ?? [];
  if (jobs.length === 0) {
    return <p className="text-sm text-gray-500">지금 돌아가는 작업 없음</p>;
  }

  return (
    <div className="text-sm">
      <p className="font-medium text-gray-700 mb-1">지금 돌아가는 작업 {jobs.length}건</p>
      <ul className="space-y-1">
        {jobs.map((j) => (
          <li key={j.id} className="flex flex-wrap items-baseline gap-x-2 text-gray-600">
            <span className="text-gray-800" title={j.job_type}>
              {jobTypeLabel(j.job_type)}
              {j.target_id ? ` — 단지 ${j.target_id}` : ""}
            </span>
            <span className="text-xs text-blue-700 tabular-nums">{progressText(j)}</span>
            {j.started_at && <span className="text-xs text-gray-500">{startedText(j.started_at)}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
