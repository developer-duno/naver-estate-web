"use client";

import {
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, BarChart, Bar,
} from "recharts";
import type { AreaPriceStat } from "@/types";

function formatPrice(value: number): string {
  if (value == null || isNaN(value)) return "-";
  if (value >= 10000) {
    const e = Math.floor(value / 10000);
    const r = value % 10000;
    return r > 0 ? `${e}억${r}` : `${e}억`;
  }
  return `${value.toLocaleString()}만`;
}

interface Props {
  type: "area";
  data: AreaPriceStat[];
}

export default function PriceChartInner({ data }: Props) {
  const hasMaemae = data.some((d) => d.매매 != null);
  const hasJeonse = data.some((d) => d.전세 != null);
  const hasWolse  = data.some((d) => d.월세 != null);

  return (
    <div role="img" aria-label="거래유형별 면적 가격 차트">
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="label" fontSize={11} />
          <YAxis tickFormatter={formatPrice} fontSize={11} width={68} />
          <Tooltip
            formatter={(value, name) => [formatPrice(Number(value)), name]}
          />
          <Legend />
          {hasMaemae && <Bar dataKey="매매" name="매매 평균" fill="#ef4444" />}
          {hasJeonse && <Bar dataKey="전세" name="전세 평균" fill="#3b82f6" />}
          {hasWolse  && <Bar dataKey="월세" name="월세 평균" fill="#22c55e" />}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
