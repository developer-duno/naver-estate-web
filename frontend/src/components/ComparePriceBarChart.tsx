"use client";

import { useMemo } from "react";
import {
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, BarChart, Bar, LabelList,
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
  const { chartData, bestMaemae, bestJeonse, bestWolse } = useMemo(() => {
    const rows = datasets.map((ds) => {
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
    });

    function findBestName(key: "maemae" | "jeonse" | "wolse"): string {
      let idx = -1, best = -1;
      rows.forEach((r, i) => {
        const v = r[key];
        if (v != null && v > best) { best = v; idx = i; }
      });
      return idx >= 0 ? rows[idx].name : "";
    }

    return {
      chartData: rows,
      bestMaemae: findBestName("maemae"),
      bestJeonse: findBestName("jeonse"),
      bestWolse: findBestName("wolse"),
    };
  }, [datasets]);

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
          <Bar dataKey="maemae" name="매매 평균" fill="#ef4444">
            <LabelList
              dataKey="maemae"
              position="top"
              content={({ index, value, x, y, width }) => {
                if (value == null || index == null) return null;
                if (chartData[index as number]?.name !== bestMaemae) return null;
                return (
                  <text x={(x as number) + (width as number) / 2} y={(y as number) - 4}
                    textAnchor="middle" fontSize={10} fill="#16a34a">★</text>
                );
              }}
            />
          </Bar>
          <Bar dataKey="jeonse" name="전세 평균" fill="#3b82f6">
            <LabelList
              dataKey="jeonse"
              position="top"
              content={({ index, value, x, y, width }) => {
                if (value == null || index == null) return null;
                if (chartData[index as number]?.name !== bestJeonse) return null;
                return (
                  <text x={(x as number) + (width as number) / 2} y={(y as number) - 4}
                    textAnchor="middle" fontSize={10} fill="#16a34a">★</text>
                );
              }}
            />
          </Bar>
          <Bar dataKey="wolse" name="월세 평균" fill="#22c55e">
            <LabelList
              dataKey="wolse"
              position="top"
              content={({ index, value, x, y, width }) => {
                if (value == null || index == null) return null;
                if (chartData[index as number]?.name !== bestWolse) return null;
                return (
                  <text x={(x as number) + (width as number) / 2} y={(y as number) - 4}
                    textAnchor="middle" fontSize={10} fill="#16a34a">★</text>
                );
              }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {(bestMaemae || bestJeonse || bestWolse) && (
        <p className="text-center text-sm mt-2 space-x-3">
          {bestMaemae && <span className="text-red-500 font-bold">★ 매매: {bestMaemae}</span>}
          {bestJeonse && <span className="text-blue-500 font-bold">★ 전세: {bestJeonse}</span>}
          {bestWolse && <span className="text-green-600 font-bold">★ 월세: {bestWolse}</span>}
        </p>
      )}
    </div>
  );
}
