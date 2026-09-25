"use client";

/** 관리자 대시보드 최상단 — 데이터 신선도 한 줄 요약. 캐시는 DataFreshnessCard 와 공유 */

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { getDataFreshness } from "@/lib/api";
import { tally } from "@/lib/admin/status-derivation";
import { openAdminSection } from "./AdminSection";

interface Props {
  token: string;
}

export default function HealthSummary({ token }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.admin.dataFreshness(),
    queryFn: () => getDataFreshness(token),
    enabled: !!token,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  if (isLoading || !data) {
    return (
      <div className="bg-white border rounded-lg p-3 mb-4 h-12 animate-pulse" aria-label="건강 요약 로딩 중" />
    );
  }

  const c = tally(data.items);
  const hasIssue = c.red > 0 || c.spinning > 0;
  const containerClass = hasIssue
    ? "bg-red-50 border-red-200"
    : c.yellow > 0
      ? "bg-yellow-50 border-yellow-200"
      : "bg-white border-gray-200";

  return (
    <button
      type="button"
      onClick={() => openAdminSection("freshness")}
      className={`w-full text-left border rounded-lg p-3 mb-4 text-sm transition hover:brightness-95 ${containerClass}`}
      aria-label="데이터 상태 요약 — 누르면 아래 '데이터 신선도' 절이 열려요"
    >
      <span className="font-medium text-gray-700 mr-2">오늘 데이터 상태:</span>
      <span className="inline-flex items-center gap-1 mr-3">
        <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
        <span className="text-gray-700">정상 {c.green}</span>
      </span>
      <span className="inline-flex items-center gap-1 mr-3">
        <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" />
        <span className="text-gray-700">주의 {c.yellow}</span>
      </span>
      <span className="inline-flex items-center gap-1 mr-3">
        <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
        <span className={c.red > 0 ? "text-red-700 font-medium" : "text-gray-700"}>지연 {c.red}</span>
      </span>
      <span
        className={c.spinning > 0 ? "text-red-700 font-medium mr-3" : "text-gray-500 mr-3"}
        title="헛바퀴 = 작업은 돌았는데 새로 들어온 자료가 0건"
      >
        ⚠ 헛바퀴(돌았는데 새 자료 0건) {c.spinning}
      </span>
      {c.unknown > 0 && (
        <span className="text-gray-500 mr-3">미수집 {c.unknown}</span>
      )}
      <span className="text-xs text-gray-400 ml-auto">상세 보기 ↓</span>
    </button>
  );
}
