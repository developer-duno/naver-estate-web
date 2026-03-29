"use client";

import { useState, useMemo } from "react";
import {
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import type { MbUnsoldHistory } from "@/types";

const PERIODS = [
  { label: "6M", months: 6 },
  { label: "1Y", months: 12 },
  { label: "2Y", months: 24 },
  { label: "ALL", months: 9999 },
] as const;

interface Props {
  items: MbUnsoldHistory[];
}

export default function MbUnsoldTrendChart({ items }: Props) {
  const [period, setPeriod] = useState<number>(24);

  const chartData = useMemo(() => {
    const sorted = [...items].sort((a, b) => a.base_month.localeCompare(b.base_month));
    const sliced = period < 9999 ? sorted.slice(-period) : sorted;
    return sliced.map((d) => ({
      month: d.base_month.length >= 6 ? `${d.base_month.slice(2, 4)}.${d.base_month.slice(4, 6)}` : d.base_month,
      unsold: d.unsold_count ?? 0,
      postCompletion: d.post_completion_unsold ?? 0,
      change: d.change ?? 0,
    }));
  }, [items, period]);

  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        미분양 추이 데이터가 없습니다.
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

      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip
            formatter={(value, name) => {
              const labels: Record<string, string> = {
                unsold: "미분양",
                postCompletion: "준공후 미분양",
                change: "증감",
              };
              return [Number(value).toLocaleString(), labels[String(name)] ?? name];
            }}
          />
          <Legend
            formatter={(value: string) => {
              const labels: Record<string, string> = {
                unsold: "미분양",
                postCompletion: "준공후 미분양",
                change: "증감",
              };
              return labels[value] ?? value;
            }}
          />
          <Line type="monotone" dataKey="unsold" stroke="#3b82f6" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="postCompletion" stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 5" dot={false} />
          <Bar dataKey="change" fill="#10b981" opacity={0.6} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
