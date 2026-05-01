"use client";

/** 데이터 신선도 카드 — 8개 종목별 행 수 + 마지막 갱신 + 신호등 */

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { getDataFreshness } from "@/lib/api";
import { formatRelativeKo } from "@/lib/format-relative";
import type { DataFreshnessItem } from "@/types/admin";
import AdminCard from "./AdminCard";

const DOT_CLASS: Record<DataFreshnessItem["status"], string> = {
  green: "bg-green-500",
  yellow: "bg-yellow-400",
  red: "bg-red-500",
  unknown: "bg-gray-300",
};

const STATUS_LABEL: Record<DataFreshnessItem["status"], string> = {
  green: "정상",
  yellow: "주의",
  red: "지연",
  unknown: "미수집",
};

interface Props {
  token: string;
}

export default function DataFreshnessCard({ token }: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.admin.dataFreshness(),
    queryFn: () => getDataFreshness(token),
    enabled: !!token,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  if (error) {
    return (
      <AdminCard title="데이터 신선도">
        <p className="text-sm text-red-600">불러오기 실패: {error.message}</p>
      </AdminCard>
    );
  }

  if (isLoading || !data) {
    return (
      <AdminCard title="데이터 신선도">
        <ul className="space-y-2" aria-label="로딩 중">
          {Array.from({ length: 8 }).map((_, i) => (
            <li key={i} className="h-6 bg-gray-100 rounded animate-pulse" />
          ))}
        </ul>
      </AdminCard>
    );
  }

  if (data.items.length === 0) {
    return (
      <AdminCard title="데이터 신선도">
        <p className="text-sm text-gray-500">데이터 없음</p>
      </AdminCard>
    );
  }

  return (
    <AdminCard title="데이터 신선도">
      <ul className="divide-y divide-gray-100">
        {data.items.map((item) => (
          <li key={item.key} className="flex items-center gap-3 py-2 text-sm">
            <span
              className={`w-2.5 h-2.5 rounded-full shrink-0 ${DOT_CLASS[item.status]}`}
              aria-label={STATUS_LABEL[item.status]}
              title={STATUS_LABEL[item.status]}
            />
            <span className="font-medium text-gray-700 w-32 shrink-0">{item.label}</span>
            <span className="text-gray-500 tabular-nums">{item.count.toLocaleString()}</span>
            <span className="ml-auto text-xs text-gray-500">{formatRelativeKo(item.last_updated)}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-gray-400 mt-3">
        ● 정상 = 작업 주기 이내 · ● 주의 = 1.5배 초과 · ● 지연 = 3배 초과
      </p>
    </AdminCard>
  );
}
