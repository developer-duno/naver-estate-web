"use client";

import { useMemo, useState } from "react";
import {
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ComposedChart, Line,
} from "recharts";
import { COMPARE_COLORS } from "@/lib/constants";
import type { MbUnsoldHistory } from "@/types";

const CHART_HEIGHT = 360;

type PeriodKey = "6M" | "1Y" | "2Y" | "ALL";
const PERIODS: { key: PeriodKey; label: string; months: number | null }[] = [
  { key: "6M", label: "6개월", months: 6 },
  { key: "1Y", label: "1년", months: 12 },
  { key: "2Y", label: "2년", months: 24 },
  { key: "ALL", label: "전체", months: null },
];

function getCutoffMonth(monthsBack: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - monthsBack);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonth(ym: string): string {
  if (!ym || ym.length < 6) return ym;
  return `${ym.slice(2, 4)}.${ym.slice(4, 6)}`;
}

export interface UnsoldDataset {
  apartmentId: string;
  apartmentName: string;
  items: MbUnsoldHistory[];
  isError?: boolean;
}

interface Props {
  datasets: UnsoldDataset[];
  /** 실패한 추이 쿼리만 재조회하는 콜백 — 미주입 시 "다시 시도" 버튼 미노출 */
  onRetry?: () => void;
}

export default function MbCompareUnsoldChart({ datasets, onRetry }: Props) {
  const [period, setPeriod] = useState<PeriodKey>("ALL");

  const { chartData, seriesKeys, latestBest } = useMemo(() => {
    const cutoff = PERIODS.find((p) => p.key === period)?.months;
    const cutoffMonth = cutoff ? getCutoffMonth(cutoff) : null;

    // 모든 월을 머지하여 하나의 row로 만듦
    const monthMap = new Map<string, Record<string, string | number | null>>();
    for (const ds of datasets) {
      for (const item of ds.items) {
        if (cutoffMonth && item.base_month < cutoffMonth) continue;
        if (!monthMap.has(item.base_month)) {
          monthMap.set(item.base_month, { month: formatMonth(item.base_month) });
        }
        const row = monthMap.get(item.base_month)!;
        row[ds.apartmentId] = item.unsold_count ?? null;
      }
    }

    const sorted = Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, row]) => row);

    // 시리즈 키 생성 (단지별 하나씩)
    const keys = datasets.map((ds, i) => ({
      dataKey: ds.apartmentId,
      color: COMPARE_COLORS[i % COMPARE_COLORS.length].main,
      name: ds.apartmentName,
    }));

    // 최근 월 우위 — 미분양 가장 적은 단지
    let bestName = "";
    if (sorted.length > 0) {
      const last = sorted[sorted.length - 1];
      let bestVal = Infinity;
      for (const ds of datasets) {
        const v = Number(last[ds.apartmentId]);
        if (!isNaN(v) && v < bestVal) {
          bestVal = v;
          bestName = ds.apartmentName;
        }
      }
    }

    return { chartData: sorted, seriesKeys: keys, latestBest: bestName };
  }, [datasets, period]);

  const hasData = chartData.length > 0;
  const erroredNames = datasets.filter((d) => d.isError).map((d) => d.apartmentName);
  if (!hasData) {
    if (erroredNames.length > 0) {
      return (
        <div className="py-8 text-center">
          <p className="text-sm text-red-600">
            추이 데이터를 불러오지 못했습니다 (영향 받은 단지: {erroredNames.join(", ")}).
          </p>
          {onRetry && (
            <button
              type="button"
              onClick={() => onRetry()}
              className="text-xs text-blue-600 hover:underline mt-2"
            >
              다시 시도
            </button>
          )}
        </div>
      );
    }
    return <p className="text-gray-500 text-sm py-8 text-center">미분양 추이 데이터가 없습니다.</p>;
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border p-4">
      {erroredNames.length > 0 && (
        <p className="mb-2 text-sm text-red-600">
          추이 데이터를 불러오지 못했습니다 (영향 받은 단지: {erroredNames.join(", ")}).
          {onRetry && (
            <button
              type="button"
              onClick={() => onRetry()}
              className="ml-2 text-xs text-blue-600 hover:underline"
            >
              다시 시도
            </button>
          )}
        </p>
      )}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">미분양 추이 비교</h3>
        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                period === p.key
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-600 border-gray-300 hover:border-blue-400"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" fontSize={11} />
          <YAxis fontSize={11} width={50} />
          <Tooltip formatter={(value, name) => [Number(value).toLocaleString() + "세대", name]} />
          <Legend />
          {seriesKeys.map((sk) => (
            <Line
              key={sk.dataKey}
              type="monotone"
              dataKey={sk.dataKey}
              name={sk.name}
              stroke={sk.color}
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>

      {latestBest && (
        <p className="text-center text-sm mt-2">
          <span className="text-green-600 font-bold">★ 최근 미분양 최소: {latestBest}</span>
        </p>
      )}
    </div>
  );
}
