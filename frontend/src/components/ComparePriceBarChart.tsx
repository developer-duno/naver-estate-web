"use client";

import { useMemo } from "react";
import {
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, BarChart, Bar,
} from "recharts";
import { formatChartPrice } from "@/lib/format";
import type { PriceStats } from "@/types";

interface Dataset {
  complexNo: string;
  complexName: string;
  priceStats: PriceStats;
}

interface Props {
  datasets: Dataset[];
}

/** by_area에서 거래유형별 가중 평균 계산 */
function weightedAvg(
  areas: { val?: number; cnt?: number }[],
): number | null {
  let sumVal = 0;
  let sumCnt = 0;
  for (const a of areas) {
    if (a.val != null && a.cnt != null && a.cnt > 0) {
      sumVal += a.val * a.cnt;
      sumCnt += a.cnt;
    }
  }
  return sumCnt > 0 ? Math.round(sumVal / sumCnt) : null;
}

export default function ComparePriceBarChart({ datasets }: Props) {
  // 단지 간 "가장 비싼 ★" 판정은 지웠다(세션 472 PR 3) — 막대는 값만 보여 준다
  const chartData = useMemo(
    () =>
      datasets.map((ds) => {
        const maemae = weightedAvg(
          ds.priceStats.by_area.map((a) => ({ val: a.maemae, cnt: a.maemae_count })),
        );
        const jeonse = weightedAvg(
          ds.priceStats.by_area.map((a) => ({ val: a.jeonse, cnt: a.jeonse_count })),
        );
        const wolse = weightedAvg(
          ds.priceStats.by_area.map((a) => ({ val: a.wolse, cnt: a.wolse_count })),
        );
        return { name: ds.complexName, maemae, jeonse, wolse };
      }),
    [datasets],
  );

  const hasData = chartData.some((r) => r.maemae != null || r.jeonse != null || r.wolse != null);
  if (!hasData) {
    return <p className="text-gray-500 text-sm py-8 text-center">가격 통계 데이터가 부족합니다.</p>;
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={chartData} margin={{ top: 20, right: 8, left: 0, bottom: 4 }} barGap={4}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" fontSize={11} />
          <YAxis tickFormatter={formatChartPrice} fontSize={11} width={68} />
          <Tooltip formatter={(value) => formatChartPrice(value as number)} />
          <Legend />
          <Bar dataKey="maemae" name="매매 평균" fill="#ef4444" />
          <Bar dataKey="jeonse" name="전세 평균" fill="#3b82f6" />
          <Bar dataKey="wolse" name="월세 평균" fill="#22c55e" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
