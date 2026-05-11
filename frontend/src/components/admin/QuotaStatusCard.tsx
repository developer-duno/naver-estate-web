"use client";

import { useQuery } from "@tanstack/react-query";
import { getAdminQuotaStatus } from "@/lib/api";
import type { QuotaStatus } from "@/types/admin";
import { queryKeys } from "@/lib/query-keys";
import AdminCard from "./AdminCard";

interface Props {
  token: string;
}

function statusColor(pct: number): { bg: string; text: string; label: string; bar: string } {
  if (pct < 0) return { bg: "bg-gray-100", text: "text-gray-500", label: "조회 실패", bar: "bg-gray-300" };
  if (pct >= 90) return { bg: "bg-red-50", text: "text-red-700", label: "위험", bar: "bg-red-500" };
  if (pct >= 70) return { bg: "bg-amber-50", text: "text-amber-700", label: "주의", bar: "bg-amber-500" };
  return { bg: "bg-green-50", text: "text-green-700", label: "정상", bar: "bg-green-500" };
}

export default function QuotaStatusCard({ token }: Props) {
  const { data, isLoading, error } = useQuery<QuotaStatus, Error>({
    queryKey: queryKeys.admin.quotaStatus(),
    queryFn: () => getAdminQuotaStatus(token),
    enabled: !!token,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const color = data ? statusColor(data.utilization_pct) : null;
  const showStatusChip = !!(color && data && data.utilization_pct >= 0);

  return (
    <AdminCard
      title="공공데이터 API 쿼터 (오늘 사용량)"
      help="국토교통부·에어코리아 등 공공데이터 API 가 오늘 몇 번 호출됐는지 보여줘요. 하루 한도 10,000회를 넘으면 크롤링이 멈춰요. 매월 10일이 토요일이면 mibunyang 8,500회 + 토요일 실거래가 3,600회 = 12,100회로 한도 초과 위험이라 자동 skip 돼요."
      action={
        showStatusChip ? (
          <span className={`text-xs px-2 py-0.5 rounded border ${color!.bg} ${color!.text}`}>
            {color!.label}
          </span>
        ) : undefined
      }
    >
      {isLoading && !data && <div className="h-[80px] bg-gray-100 animate-pulse rounded" />}
      {error && <p className="text-xs text-red-700">쿼터 조회 실패: {error.message}</p>}
      {data && (
        <div className="space-y-2">
          {data.count < 0 ? (
            <p className="text-sm text-gray-500">쿼터 DB 조회 실패 (in-memory 폴백 사용 중)</p>
          ) : (
            <>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-semibold tabular-nums">{data.count.toLocaleString("ko")}</span>
                <span className="text-sm text-gray-500">/ {data.limit.toLocaleString("ko")}회</span>
              </div>
              <div className="h-2 bg-gray-100 rounded overflow-hidden">
                <div
                  className={`h-full ${color?.bar ?? "bg-gray-300"}`}
                  style={{ width: `${Math.min(100, data.utilization_pct)}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span className="tabular-nums">사용률 {data.utilization_pct}%</span>
                <span className="tabular-nums">남은 호출 {data.remaining.toLocaleString("ko")}회</span>
              </div>
            </>
          )}
        </div>
      )}
    </AdminCard>
  );
}
