"use client";

/** 데이터 신선도 카드 — 8개 종목별 행 수 + 갱신 시각 + 작업 메타 + 헛바퀴 감지 */

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

function JobSummary({ item }: { item: DataFreshnessItem }) {
  if (!item.last_job) {
    return <span className="text-gray-400">정기 작업 없음</span>;
  }
  const { processed_items, total_items, completed_at } = item.last_job;
  const ratio = total_items > 0 ? `${processed_items}/${total_items}` : `${processed_items}건`;
  return (
    <span className="tabular-nums">
      {formatRelativeKo(completed_at)} · 처리 {ratio}
      {item.new_rows !== null && (
        <>
          {" · "}
          <span className={item.new_rows === 0 ? "text-red-600 font-medium" : "text-gray-600"}>
            신규 {item.new_rows.toLocaleString()}건
          </span>
        </>
      )}
    </span>
  );
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
            <li key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
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
          <li key={item.key} className="py-2 text-sm">
            <div className="flex items-center gap-3">
              <span
                className={`w-2.5 h-2.5 rounded-full shrink-0 ${DOT_CLASS[item.status]}`}
                aria-label={STATUS_LABEL[item.status]}
                title={STATUS_LABEL[item.status]}
              />
              <span className="font-medium text-gray-700 w-32 shrink-0">{item.label}</span>
              <span className="text-gray-500 tabular-nums">{item.count.toLocaleString()}</span>
              {item.spinning && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200">
                  헛바퀴 의심
                </span>
              )}
              <span className="ml-auto text-xs text-gray-500">
                갱신 {formatRelativeKo(item.last_updated)}
              </span>
            </div>
            <div className="text-xs text-gray-500 ml-[1.625rem] mt-1">
              <JobSummary item={item} />
            </div>
          </li>
        ))}
      </ul>
      <div className="text-xs text-gray-400 mt-3 space-y-0.5">
        <p>● 정상 = 작업 주기 이내 · ● 주의 = 1.5배 초과 · ● 지연 = 3배 초과</p>
        <p>헛바퀴 의심 = 작업은 돌았는데 처리 0건 또는 신규 0건</p>
      </div>
    </AdminCard>
  );
}
