"use client";

import {
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LineChart, Line,
} from "recharts";
import type { PriceHistoryItem } from "@/types";

function formatPrice(value: number): string {
  if (value == null || isNaN(value)) return "-";
  if (value >= 10000) {
    const e = Math.floor(value / 10000);
    const r = value % 10000;
    return r > 0 ? `${e}억${r}` : `${e}억`;
  }
  return `${value.toLocaleString()}만`;
}

function formatMonth(ym: string): string {
  if (!ym || ym.length < 6) return ym;
  return `${ym.slice(2, 4)}.${ym.slice(4, 6)}`;
}

interface ChartRow {
  month: string;
  매매?: number | null;
  전세?: number | null;
}

interface Props {
  items: PriceHistoryItem[];
}

export default function PriceHistoryChart({ items }: Props) {
  if (!items || items.length === 0) {
    return (
      <p className="text-gray-500 text-sm py-8 text-center">
        가격 추이 데이터가 아직 없습니다. 데이터 수집 후 표시됩니다.
      </p>
    );
  }

  const monthMap = new Map<string, ChartRow>();
  for (const item of items) {
    const key = item.base_month;
    if (!monthMap.has(key)) {
      monthMap.set(key, { month: formatMonth(key) });
    }
    const row = monthMap.get(key)!;
    const label = item.trade_type_label;
    if (item.price_avg != null) {
      row[label as keyof Omit<ChartRow, "month">] = item.price_avg;
    }
  }

  const data = Array.from(monthMap.values());
  const hasMaemae = data.some((d) => d["매매"] != null);
  const hasJeonse = data.some((d) => d["전세"] != null);

  return (
    <div role="img" aria-label="단지 가격 추이 차트">
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" fontSize={11} />
          <YAxis tickFormatter={formatPrice} fontSize={11} width={68} />
          <Tooltip formatter={(value) => [formatPrice(Number(value))]} />
          <Legend />
          {hasMaemae && (
            <Line
              type="monotone"
              dataKey="매매"
              name="매매 평균"
              stroke="#ef4444"
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
            />
          )}
          {hasJeonse && (
            <Line
              type="monotone"
              dataKey="전세"
              name="전세 평균"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
