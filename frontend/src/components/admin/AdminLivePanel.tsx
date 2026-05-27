"use client";

import { useQuery } from "@tanstack/react-query";
import { useTokenReady } from "@/hooks/useAdminQuery";
import { queryKeys } from "@/lib/query-keys";
import {
  getAdminCrawlJobs,
  getAdminCrawlFailures,
  getAdminNaverCalls,
} from "@/lib/api";
import type { CrawlJobDetail, PaginatedResponse, CrawlFailuresResponse, NaverCallStats } from "@/types/admin";
import AdminCard from "./AdminCard";

export default function AdminLivePanel() {
  const { token } = useTokenReady();

  const runningQuery = useQuery<PaginatedResponse<CrawlJobDetail>, Error>({
    queryKey: [...queryKeys.admin.crawlJobs(), "running"] as const,
    queryFn: () => getAdminCrawlJobs(token, { status: "running" }),
    enabled: !!token,
    staleTime: 30_000,
  });

  const failuresQuery = useQuery<CrawlFailuresResponse, Error>({
    queryKey: queryKeys.admin.crawlFailures(24),
    queryFn: () => getAdminCrawlFailures(token, 24),
    enabled: !!token,
    staleTime: 30_000,
  });

  const naverQuery = useQuery<NaverCallStats, Error>({
    queryKey: queryKeys.admin.naverCalls(),
    queryFn: () => getAdminNaverCalls(token),
    enabled: !!token,
    staleTime: 30_000,
  });

  const runningJobs = runningQuery.data?.items ?? [];
  const top5Failures = (failuresQuery.data?.items ?? []).slice(0, 5);
  const naverData = naverQuery.data;

  return (
    <aside className="space-y-4 sticky top-20" aria-label="실시간 운영 신호">
      <AdminCard
        title="지금 돌아가는 작업"
        help="현재 서버에서 실행 중인 수집 작업이에요. '처리 / 총 건수'로 진행률을 보여줘요"
      >
        {runningJobs.length === 0 ? (
          <p className="text-sm text-gray-500">실행 중인 작업이 없습니다</p>
        ) : (
          <ul className="space-y-2">
            {runningJobs.map((j) => (
              <li key={j.id} className="flex items-center justify-between text-sm gap-2">
                <span className="text-gray-600 truncate">
                  {j.job_type}
                  {j.target_id ? ` — ${j.target_id}` : ""}
                </span>
                <span className="text-xs text-blue-600 shrink-0">
                  {j.processed_items}/{j.total_items}
                </span>
              </li>
            ))}
          </ul>
        )}
      </AdminCard>

      <AdminCard
        title="최근 실패 5건 (24h)"
        help="최근 24시간 안에 실패한 크롤 작업을 유형별로 묶었어요"
      >
        {top5Failures.length === 0 ? (
          <p className="text-sm text-gray-500">최근 실패가 없습니다</p>
        ) : (
          <ul className="space-y-2">
            {top5Failures.map((item) => (
              <li key={item.job_type} className="text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-gray-700 font-medium truncate">{item.job_type}</span>
                  <span className="text-xs text-red-600 shrink-0">{item.count}건</span>
                </div>
                {item.last_error && (
                  <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">{item.last_error}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </AdminCard>

      <AdminCard
        title="네이버 호출 24h"
        help="네이버 부동산 API 호출량이에요. 1시간 안에 너무 많으면 IP 차단 위험이 있어요"
      >
        {!naverData ? (
          <p className="text-sm text-gray-500">불러오는 중...</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            <li className="flex justify-between">
              <span className="text-gray-600">10분</span>
              <span className="font-medium">{naverData.totals["10m"].toLocaleString()}</span>
            </li>
            <li className="flex justify-between">
              <span className="text-gray-600">1시간</span>
              <span className="font-medium">{naverData.totals["1h"].toLocaleString()}</span>
            </li>
            <li className="flex justify-between">
              <span className="text-gray-600">24시간</span>
              <span className="font-medium">{naverData.totals["24h"].toLocaleString()}</span>
            </li>
          </ul>
        )}
      </AdminCard>
    </aside>
  );
}
