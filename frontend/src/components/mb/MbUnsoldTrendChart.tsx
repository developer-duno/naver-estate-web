"use client";

import { useState, useMemo } from "react";
import {
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import type { MbUnsoldHistory } from "@/types";
import { formatChartMonth } from "@/lib/format";

const SERIES_LABELS: Record<string, string> = {
  unsold: "미분양",
  postCompletion: "준공후 미분양",
  change: "증감",
};

const ALL_MONTHS = Infinity;
const CHART_HEIGHT = 320;

const PERIODS = [
  { label: "6M", months: 6 },
  { label: "1Y", months: 12 },
  { label: "2Y", months: 24 },
  { label: "ALL", months: ALL_MONTHS },
] as const;

interface Props {
  items: MbUnsoldHistory[];
}

/** "202609" → "2026년 9월" (요약 상자의 기준월 글자) */
function formatKoreanMonth(ym: string): string {
  if (!ym || ym.length < 6) return ym;
  return `${ym.slice(0, 4)}년 ${Number(ym.slice(4, 6))}월`;
}

export default function MbUnsoldTrendChart({ items }: Props) {
  const [period, setPeriod] = useState<number>(24);

  const chartData = useMemo(() => {
    const sorted = [...items].sort((a, b) => a.base_month.localeCompare(b.base_month));
    const sliced = Number.isFinite(period) ? sorted.slice(-period) : sorted;
    return sliced.map((d) => ({
      month: formatChartMonth(d.base_month),
      unsold: d.unsold_count ?? 0,
      postCompletion: d.post_completion_unsold ?? 0,
      change: d.change ?? 0,
    }));
  }, [items, period]);

  // 값이 한 달도 없는 시리즈는 그리지 않는다 — 없는 값을 0 으로 그리면 "0세대"로 읽힌다
  const hasPostCompletion = items.some((d) => d.post_completion_unsold != null);
  const hasChange = items.some((d) => d.change != null);

  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        미분양 추이 데이터가 없습니다.
      </div>
    );
  }

  // 한 달치뿐이면 점 하나짜리 그래프 대신 요약 한 줄
  if (items.length === 1) {
    const only = items[0];
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-6 text-center">
        <p className="text-2xl font-bold text-gray-900">
          {only.unsold_count != null ? (
            `${only.unsold_count.toLocaleString()}세대`
          ) : (
            <span className="text-gray-400">미분양 수 비공개</span>
          )}
        </p>
        <p className="mt-1 text-sm text-gray-500">{formatKoreanMonth(only.base_month)} 기준</p>
        <p className="mt-3 text-sm text-gray-500">
          아직 한 달치 자료입니다. 다음 달 자료부터 추이 그래프가 그려집니다.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-1 mb-4">
        {PERIODS.map((p) => (
          <button
            key={p.label}
            onClick={() => setPeriod(p.months)}
            className={`px-3 py-1 text-xs rounded-md border transition-colors ${
              period === p.months
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <ComposedChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip
            formatter={(value, name) => [
              Number(value).toLocaleString(),
              SERIES_LABELS[String(name)] ?? name,
            ]}
          />
          <Legend formatter={(value: string) => SERIES_LABELS[value] ?? value} />
          <Line type="monotone" dataKey="unsold" stroke="#3b82f6" strokeWidth={2} dot={false} />
          {hasPostCompletion && (
            <Line type="monotone" dataKey="postCompletion" stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 5" dot={false} />
          )}
          {hasChange && <Bar dataKey="change" fill="#10b981" opacity={0.6} />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
