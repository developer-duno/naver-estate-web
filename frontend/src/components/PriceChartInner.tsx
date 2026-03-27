"use client";

import {
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, BarChart, Bar,
} from "recharts";
import type { AreaPriceStat } from "@/types";
import { formatChartPrice } from "@/lib/format";

interface Props {
  type: "area";
  data: AreaPriceStat[];
  onAreaClick?: (label: string) => void;
}

export default function PriceChartInner({ data, onAreaClick }: Props) {
  const hasMaemae = data.some((d) => d.maemae != null);
  const hasJeonse = data.some((d) => d.jeonse != null);
  const hasWolse  = data.some((d) => d.wolse  != null);

  const handleClick = (chartData: Record<string, unknown>) => {
    const label = chartData?.activeLabel;
    if (onAreaClick && typeof label === "string") {
      onAreaClick(label);
    }
  };

  return (
    <div role="img" aria-label="거래유형별 면적 가격 차트">
      <ResponsiveContainer width="100%" height={280}>
        <BarChart
          data={data}
          margin={{ top: 4, right: 8, left: 0, bottom: 4 }}
          barSize={40}
          onClick={onAreaClick ? handleClick : undefined}
          style={onAreaClick ? { cursor: "pointer" } : undefined}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="label" fontSize={11} />
          <YAxis tickFormatter={formatChartPrice} fontSize={11} width={68} />
          <Tooltip formatter={(value, name) => [formatChartPrice(Number(value)), name]} />
          <Legend />
          {hasMaemae && <Bar dataKey="maemae" name="매매 평균" fill="#ef4444" />}
          {hasJeonse && <Bar dataKey="jeonse" name="전세 평균" fill="#3b82f6" />}
          {hasWolse  && <Bar dataKey="wolse"  name="월세 평균" fill="#22c55e" />}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
