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
      <AdminCard title="데이터 신선도" help="단지·매물·시세 같은 각 종류의 데이터가 제때 갱신되고 있는지 보여줘요. 빨간색은 너무 오래 됐다는 뜻(원래 주기보다 3배 이상 늦음). '헛바퀴 의심'은 작업은 돌긴 돌았는데 실제로 새로 들어온 데이터가 0건이라는 뜻이에요">
        <p className="text-sm text-red-600">불러오기 실패: {error.message}</p>
      </AdminCard>
    );
  }

  if (isLoading || !data) {
    return (
      <AdminCard title="데이터 신선도" help="단지·매물·시세 같은 각 종류의 데이터가 제때 갱신되고 있는지 보여줘요. 빨간색은 너무 오래 됐다는 뜻(원래 주기보다 3배 이상 늦음). '헛바퀴 의심'은 작업은 돌긴 돌았는데 실제로 새로 들어온 데이터가 0건이라는 뜻이에요">
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
      <AdminCard title="데이터 신선도" help="단지·매물·시세 같은 각 종류의 데이터가 제때 갱신되고 있는지 보여줘요. 빨간색은 너무 오래 됐다는 뜻(원래 주기보다 3배 이상 늦음). '헛바퀴 의심'은 작업은 돌긴 돌았는데 실제로 새로 들어온 데이터가 0건이라는 뜻이에요">
        <p className="text-sm text-gray-500">데이터 없음</p>
      </AdminCard>
    );
  }

  return (
    <AdminCard title="데이터 신선도" help="단지·매물·시세 같은 각 종류의 데이터가 제때 갱신되고 있는지 보여줘요. 빨간색은 너무 오래 됐다는 뜻(원래 주기보다 3배 이상 늦음). '헛바퀴 의심'은 작업은 돌긴 돌았는데 실제로 새로 들어온 데이터가 0건이라는 뜻이에요">
      <p className="text-xs text-gray-500 mb-2">
        <span className="font-medium text-gray-600">처리 N/M</span> = 이번 작업이 끝낸 건수 / 처리 대상이었던 전체 건수 ·{" "}
        <span className="font-medium text-gray-600">신규 K건</span> = 그중 진짜로 새로 들어온 데이터 수
      </p>
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
