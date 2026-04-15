"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { getAdminErrorStats, type ErrorStatsRow } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import AdminCard from "./AdminCard";

// Recharts 는 SSR 에서 window 참조 문제 + 번들 크기가 커서 dynamic import
const BarChart = dynamic(() => import("recharts").then((m) => m.BarChart), { ssr: false });
const Bar = dynamic(() => import("recharts").then((m) => m.Bar), { ssr: false });
const XAxis = dynamic(() => import("recharts").then((m) => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import("recharts").then((m) => m.YAxis), { ssr: false });
const Tooltip = dynamic(() => import("recharts").then((m) => m.Tooltip), { ssr: false });
const Legend = dynamic(() => import("recharts").then((m) => m.Legend), { ssr: false });
const ResponsiveContainer = dynamic(
  () => import("recharts").then((m) => m.ResponsiveContainer),
  { ssr: false },
);

interface Props {
  getToken: () => Promise<string>;
}

type Days = 7 | 14 | 30;

const STATUS_COLORS: Record<string, string> = {
  completed: "#10b981", // green
  failed: "#ef4444", // red
  paused: "#f59e0b", // amber
  cancelled: "#9ca3af", // gray
};

/**
 * 최근 N일 크롤 잡의 status 분포를 stacked bar 로 시각화.
 * 7/14/30일 토글, 일자별 completed/failed/paused/cancelled 4축 스택.
 */
export default function ErrorRateChart({ getToken }: Props) {
  const [days, setDays] = useState<Days>(14);

  const { data, isLoading, error } = useQuery<{ days: number; rows: ErrorStatsRow[] }, Error>({
    queryKey: queryKeys.admin.errorStats(days),
    queryFn: async () => {
      const token = await getToken();
      return getAdminErrorStats(token, days);
    },
    staleTime: 60_000,
  });

  const rows = data?.rows ?? [];
  const hasData = rows.some(
    (r) => r.completed + r.failed + r.paused + r.cancelled > 0,
  );

  const daysToggle = (
    <div className="flex gap-1">
      {([7, 14, 30] as const).map((d) => (
        <button
          key={d}
          onClick={() => setDays(d)}
          className={`px-2 py-1 text-xs rounded border ${
            days === d
              ? "bg-blue-600 text-white border-blue-600"
              : "bg-white text-gray-700 border-gray-300"
          }`}
        >
          {d}일
        </button>
      ))}
    </div>
  );

  return (
    <AdminCard title="크롤 에러율 추이" action={daysToggle}>
      {isLoading && (
        <div className="h-[240px] bg-gray-100 animate-pulse rounded" />
      )}

      {error && (
        <p className="text-xs text-red-700">
          에러율 데이터를 불러오지 못했습니다: {error.message}
        </p>
      )}

      {!isLoading && !error && !hasData && (
        <div className="h-[240px] flex items-center justify-center text-xs text-gray-500">
          데이터가 없습니다
        </div>
      )}

      {!isLoading && !error && hasData && (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={rows} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="completed" stackId="a" fill={STATUS_COLORS.completed} name="완료" />
            <Bar dataKey="failed" stackId="a" fill={STATUS_COLORS.failed} name="실패" />
            <Bar dataKey="paused" stackId="a" fill={STATUS_COLORS.paused} name="일시정지" />
            <Bar dataKey="cancelled" stackId="a" fill={STATUS_COLORS.cancelled} name="취소" />
          </BarChart>
        </ResponsiveContainer>
      )}

      <p className="mt-2 text-[11px] text-gray-500">
        KST 기준 일자별 status 집계. running/pending은 생략 (최종 상태만 표시).
      </p>
    </AdminCard>
  );
}
