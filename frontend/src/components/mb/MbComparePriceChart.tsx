"use client";

import { useMemo } from "react";
import {
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, BarChart, Bar,
} from "recharts";
import type { MbApartment } from "@/types";
import { normalizePp } from "@/lib/mb-format";

const BAR_CHART_HEIGHT = 320;
const BAR_CHART_MARGIN = { top: 20, right: 8, left: 0, bottom: 4 } as const;
const EUK_THRESHOLD = 10000;

/** 만원 → 읽기 좋은 형식 */
function fmtPrice(v: number): string {
  if (v >= EUK_THRESHOLD) return `${(v / EUK_THRESHOLD).toFixed(1)}억`;
  return `${v.toLocaleString()}만`;
}

interface Props {
  apartments: MbApartment[];
}

export default function MbComparePriceChart({ apartments }: Props) {
  // 단지 간 "최저가 ★" 판정은 지웠다(세션 472 PR 3) — 막대는 값만 보여 준다
  const chartData = useMemo(
    () =>
      apartments.map((a) => ({
        name: a.name,
        min: a.presale_min_price ?? null,
        max: a.presale_max_price ?? null,
        pp: normalizePp(a.presale_pp), // 0/미공개 → null (막대 미렌더, 세션 300)
      })),
    [apartments],
  );

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
          <Bar dataKey="min" name="최저 분양가" fill="#3b82f6" />
          <Bar dataKey="max" name="최고 분양가" fill="#ef4444" />
          <Bar dataKey="pp" name="평당가" fill="#f59e0b" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
