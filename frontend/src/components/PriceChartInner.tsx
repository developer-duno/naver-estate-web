"use client";

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, BarChart, Bar,
} from "recharts";
import type { PriceStat } from "@/types";

function formatPrice(value: number): string {
  if (value == null || isNaN(value)) return "-";
  if (value >= 10000) {
    const e = Math.floor(value / 10000);
    const r = value % 10000;
    return r > 0 ? `${e}억${r}` : `${e}억`;
  }
  return `${value.toLocaleString()}만`;
}

interface TrendData { month: string; "최고가격"?: number; "최저가격"?: number; "평균금액"?: number; }

interface Props {
  type: "trend" | "area";
  data: TrendData[] | PriceStat[];
}

export default function PriceChartInner({ type, data }: Props) {
  if (type === "trend") {
    return (
      <div role="img" aria-label="시세 추이 차트">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data as TrendData[]}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" fontSize={12} />
            <YAxis tickFormatter={formatPrice} fontSize={12} width={70} />
            <Tooltip formatter={(v) => formatPrice(Number(v))} labelFormatter={(l) => `20${l}`} />
            <Legend />
            <Line type="monotone" dataKey="최고가격" stroke="#ef4444" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="평균금액" stroke="#3b82f6" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="최저가격" stroke="#22c55e" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <div role="img" aria-label="면적별 가격 분포 차트">
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={data as PriceStat[]}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="label" fontSize={12} />
          <YAxis tickFormatter={formatPrice} fontSize={12} width={70} />
          <Tooltip formatter={(v) => formatPrice(Number(v))} />
          <Legend />
          <Bar dataKey="min" name="최저가격" fill="#22c55e" />
          <Bar dataKey="avg" name="평균금액" fill="#3b82f6" />
          <Bar dataKey="max" name="최고가격" fill="#ef4444" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
