"use client";

import { useMemo } from "react";
import {
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, BarChart, Bar, LabelList,
} from "recharts";
import type { MbApartment } from "@/types";

const BAR_CHART_HEIGHT = 320;
const BAR_CHART_MARGIN = { top: 20, right: 8, left: 0, bottom: 4 } as const;
const BEST_STAR_COLOR = "#16a34a";
const LABEL_OFFSET_Y = -4;
const EUK_THRESHOLD = 10000;

/** 만원 → 읽기 좋은 형식 */
function fmtPrice(v: number): string {
  if (v >= EUK_THRESHOLD) return `${(v / EUK_THRESHOLD).toFixed(1)}억`;
  return `${v.toLocaleString()}만`;
}

/** "최저가" 우위 판정 — 가장 낮은 값의 단지명 반환 */
function findLowestName(
  rows: { name: string; [k: string]: number | string | null }[],
  key: string,
): string {
  let bestIdx = -1;
  let lowestValue = Infinity;
  rows.forEach((r, i) => {
    const v = r[key] as number | null;
    if (v != null && v < lowestValue) { lowestValue = v; bestIdx = i; }
  });
  return bestIdx >= 0 ? rows[bestIdx].name : "";
}

/** ★ 라벨 렌더러 — 우위 단지에만 표시 */
function bestStarLabel(bestName: string, chartData: { name: string }[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, react/display-name
  return (props: any) => {
    const { index, value, x, y, width } = props;
    if (value == null || index == null) return null;
    if (chartData[index as number]?.name !== bestName) return null;
    return (
      <text
        x={(x as number) + (width as number) / 2}
        y={(y as number) + LABEL_OFFSET_Y}
        textAnchor="middle" fontSize={10} fill={BEST_STAR_COLOR}
      >★</text>
    );
  };
}

interface Props {
  apartments: MbApartment[];
}

export default function MbComparePriceChart({ apartments }: Props) {
  const { chartData, bestMin, bestMax, bestPp } = useMemo(() => {
    const rows = apartments.map((a) => ({
      name: a.name,
      min: a.presale_min_price ?? null,
      max: a.presale_max_price ?? null,
      pp: a.presale_pp ?? null,
    }));

    return {
      chartData: rows,
      bestMin: findLowestName(rows, "min"),
      bestMax: findLowestName(rows, "max"),
      bestPp: findLowestName(rows, "pp"),
    };
  }, [apartments]);

  const hasData = chartData.some((r) => r.min != null || r.max != null || r.pp != null);
  if (!hasData) {
    return <p className="text-gray-500 text-sm py-8 text-center">분양가 데이터가 없습니다.</p>;
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">분양가 비교</h3>
      <ResponsiveContainer width="100%" height={BAR_CHART_HEIGHT}>
        <BarChart data={chartData} margin={BAR_CHART_MARGIN} barGap={4}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" fontSize={11} />
          <YAxis tickFormatter={fmtPrice} fontSize={11} width={68} />
          <Tooltip formatter={(value) => fmtPrice(value as number)} />
          <Legend />
          <Bar dataKey="min" name="최저 분양가" fill="#3b82f6">
            <LabelList dataKey="min" position="top" content={bestStarLabel(bestMin, chartData)} />
          </Bar>
          <Bar dataKey="max" name="최고 분양가" fill="#ef4444">
            <LabelList dataKey="max" position="top" content={bestStarLabel(bestMax, chartData)} />
          </Bar>
          <Bar dataKey="pp" name="평당가" fill="#f59e0b">
            <LabelList dataKey="pp" position="top" content={bestStarLabel(bestPp, chartData)} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {(bestMin || bestPp) && (
        <p className="text-center text-sm mt-2 space-x-3">
          {bestMin && <span className="text-blue-500 font-bold">★ 최저가: {bestMin}</span>}
          {bestPp && <span className="text-amber-600 font-bold">★ 평당가: {bestPp}</span>}
        </p>
      )}
    </div>
  );
}
