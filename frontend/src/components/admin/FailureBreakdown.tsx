"use client";

/**
 * 24시간 이내 실패한 크롤 작업을 유형별로 모아 보여주는 카드.
 * 사용자가 "어떤 작업이 많이 실패했나" 한눈에 파악하도록.
 */

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { getAdminCrawlFailures } from "@/lib/api";
import { jobTypeLabel, jobTypeDesc } from "@/lib/crawl-job-labels";
import AdminCard from "./AdminCard";

interface Props {
  token: string;
  /** 클릭 시 상위에서 필터를 "failed" 로 적용 + 해당 유형으로 점프 (선택) */
  onJumpToFailed?: (jobType?: string) => void;
}

function formatRelative(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "방금";
  if (ms < 3600_000) return `${Math.floor(ms / 60_000)}분 전`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3600_000)}시간 전`;
  return `${Math.floor(ms / 86_400_000)}일 전`;
}

export default function FailureBreakdown({ token, onJumpToFailed }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.admin.crawlFailures(24),
    queryFn: () => getAdminCrawlFailures(token, 24),
    enabled: !!token,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  if (isLoading || !data) {
    return (
      <AdminCard
        title="유형별 실패 분포 (최근 24시간)"
        help="어떤 종류의 작업이 많이 실패했는지 묶어서 보여줘요. 같은 종류가 반복 실패하면 원인을 한 곳에서 잡을 수 있어요"
      >
        <div className="h-20 bg-gray-100 rounded animate-pulse" />
      </AdminCard>
    );
  }

  if (data.total === 0) {
    return (
      <AdminCard
        title="유형별 실패 분포 (최근 24시간)"
        help="어떤 종류의 작업이 많이 실패했는지 묶어서 보여줘요. 같은 종류가 반복 실패하면 원인을 한 곳에서 잡을 수 있어요"
      >
        <p className="text-sm text-gray-500 py-4 text-center">
          최근 24시간 동안 실패한 작업이 없어요. 모두 정상이에요.
        </p>
      </AdminCard>
    );
  }

  return (
    <AdminCard
      title={`유형별 실패 분포 (최근 24시간 · 총 ${data.total}건)`}
      help="어떤 종류의 작업이 많이 실패했는지 묶어서 보여줘요. 같은 종류가 반복 실패하면 원인을 한 곳에서 잡을 수 있어요. 행을 누르면 아래 표에서 그 유형의 실패 작업만 보여줘요"
    >
      <ul className="divide-y">
        {data.items.map((it) => (
          <li key={it.job_type}>
            <button
              type="button"
              onClick={() => onJumpToFailed?.(it.job_type)}
              className="w-full text-left py-3 px-1 hover:bg-gray-50 transition flex flex-wrap gap-x-3 gap-y-1 items-baseline"
              aria-label={`${jobTypeLabel(it.job_type)} ${it.count}건 실패 — 클릭 시 해당 유형 실패 작업으로 이동`}
            >
              <span className="font-medium text-gray-800">
                {jobTypeLabel(it.job_type)}
              </span>
              <span className="text-xs text-gray-400">{it.job_type}</span>
              <span className="text-red-700 font-semibold ml-auto">
                {it.count}건
              </span>
              {it.last_failed_at && (
                <span className="text-xs text-gray-500 w-full sm:w-auto sm:ml-3">
                  마지막 실패 {formatRelative(it.last_failed_at)}
                </span>
              )}
              {jobTypeDesc(it.job_type) && (
                <span className="text-xs text-gray-500 w-full leading-snug">
                  {jobTypeDesc(it.job_type)}
                </span>
              )}
              {it.last_error && (
                <span className="text-xs text-gray-600 w-full bg-gray-50 rounded px-2 py-1 mt-1 leading-snug break-words">
                  최근 오류: {it.last_error}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </AdminCard>
  );
}
