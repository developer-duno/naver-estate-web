"use client";

import { useMemo } from "react";
import {
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, BarChart, Bar,
} from "recharts";
import { COMPARE_COLORS } from "@/lib/constants";
import { formatChartPrice } from "@/lib/format";
import type { PriceStats } from "@/types";

/** 백엔드 "저층(1-5)" → "저층" */
function stripFloorLabel(label: string): string {
  return label.replace(/\(.*\)/, "").trim();
}

/** 층구간 정렬 순서 */
const FLOOR_ORDER: Record<string, number> = { "저층": 0, "중층": 1, "고층": 2 };

interface Dataset {
  complexNo: string;
  complexName: string;
  priceStats: PriceStats;
}

interface Props {
  datasets: Dataset[];
}

export default function CompareFloorChart({ datasets }: Props) {
  const { chartData, bestByFloor } = useMemo(() => {
    // 모든 층구간 수집
    const floorSet = new Set<string>();
    for (const ds of datasets) {
      for (const f of ds.priceStats.by_floor) {
        floorSet.add(stripFloorLabel(f.label));
      }
    }

    const floors = Array.from(floorSet).sort(
      (a, b) => (FLOOR_ORDER[a] ?? 99) - (FLOOR_ORDER[b] ?? 99),
    );

    // 차트 데이터: 각 층구간 × 단지별 매매 avg
    const rows = floors.map((floor) => {
      const row: Record<string, string | number | null> = { floor };
      for (const ds of datasets) {
        const match = ds.priceStats.by_floor.find(
          (f) => stripFloorLabel(f.label) === floor,
        );
        row[ds.complexNo] = match?.maemae_avg ?? null;
      }
      return row;
    });

    // 각 층구간에서 최고가 단지
    const best = new Map<string, string>();
    for (const row of rows) {
      let maxVal = -1;
      let maxName = "";
      for (const ds of datasets) {
        const v = Number(row[ds.complexNo]) || 0;
        if (v > maxVal) {
          maxVal = v;
          maxName = ds.complexName;
        }
      }
      if (maxName) best.set(row.floor as string, maxName);
    }

    return { chartData: rows, bestByFloor: best };
  }, [datasets]);

  const hasData = chartData.some((r) =>
    datasets.some((ds) => r[ds.complexNo] != null),
  );
  if (!hasData) {
    return <p className="text-gray-500 text-sm py-8 text-center">층별 가격 데이터가 부족합니다.</p>;
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }} barGap={4}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="floor" fontSize={11} />
          <YAxis tickFormatter={formatChartPrice} fontSize={11} width={68} />
          <Tooltip formatter={(value: number) => formatChartPrice(value)} />
          <Legend />
          {datasets.map((ds, i) => (
            <Bar
              key={ds.complexNo}
              dataKey={ds.complexNo}
              name={ds.complexName}
              fill={COMPARE_COLORS[i % COMPARE_COLORS.length].main}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
      {bestByFloor.size > 0 && (
        <p className="text-center text-xs text-gray-500 mt-2">
          {Array.from(bestByFloor.entries()).map(([floor, name]) => (
            <span key={floor} className="mr-3">
              <span className="text-green-600 font-bold">★</span> {floor} 최고: {name}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
