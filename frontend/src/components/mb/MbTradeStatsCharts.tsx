"use client";

import { useMemo } from "react";
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar,
} from "recharts";
import type { MbTradeStats } from "@/types";

const BAR_CHART_HEIGHT = 240;
const BAR_CHART_MARGIN = { top: 16, right: 8, left: 0, bottom: 4 } as const;
const EUK_THRESHOLD = 10000;

/** 만원 → 읽기 좋은 형식 */
function fmtPrice(v: number): string {
  if (v >= EUK_THRESHOLD) return `${(v / EUK_THRESHOLD).toFixed(1)}억`;
  return `${v.toLocaleString()}만`;
}

/** JSON 객체 → 차트 데이터 배열 (key 순서 유지) */
function dictToChartData(dict: Record<string, unknown> | null | undefined): { label: string; value: number }[] {
  if (!dict || typeof dict !== "object") return [];
  return Object.entries(dict)
    .filter(([, v]) => typeof v === "number" && v > 0)
    .map(([label, v]) => ({ label, value: v as number }));
}

interface Props {
  tradeStats: MbTradeStats;
}

/** TradeStats 면적별·층별 평균가 BarChart 2종 — price_by_area + price_by_floor 시각화 */
export default function MbTradeStatsCharts({ tradeStats }: Props) {
  const areaData = useMemo(() => dictToChartData(tradeStats.price_by_area), [tradeStats.price_by_area]);
  const floorData = useMemo(() => dictToChartData(tradeStats.price_by_floor), [tradeStats.price_by_floor]);

  const hasArea = areaData.length > 0;
  const hasFloor = floorData.length > 0;

  if (!hasArea && !hasFloor) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {hasArea && (
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">면적별 평균 거래가</h4>
          <ResponsiveContainer width="100%" height={BAR_CHART_HEIGHT}>
            <BarChart data={areaData} margin={BAR_CHART_MARGIN}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" fontSize={11} />
              <YAxis tickFormatter={fmtPrice} fontSize={11} width={56} />
              <Tooltip formatter={(value) => fmtPrice(value as number)} />
              <Bar dataKey="value" name="평균가" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {hasFloor && (
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">층별 평균 거래가</h4>
          <ResponsiveContainer width="100%" height={BAR_CHART_HEIGHT}>
            <BarChart data={floorData} margin={BAR_CHART_MARGIN}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" fontSize={11} />
              <YAxis tickFormatter={fmtPrice} fontSize={11} width={56} />
              <Tooltip formatter={(value) => fmtPrice(value as number)} />
              <Bar dataKey="value" name="평균가" fill="#10b981" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
