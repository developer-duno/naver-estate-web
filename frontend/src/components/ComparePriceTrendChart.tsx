"use client";

import { useMemo, useState } from "react";
import {
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ComposedChart, Line,
} from "recharts";
import { COMPARE_COLORS } from "@/lib/constants";
import { formatChartPrice } from "@/lib/format";
import type { PriceHistoryItem } from "@/types";

type PeriodKey = "6M" | "1Y" | "2Y" | "ALL";
const PERIODS: { key: PeriodKey; label: string; months: number | null }[] = [
  { key: "6M", label: "6개월", months: 6 },
  { key: "1Y", label: "1년", months: 12 },
  { key: "2Y", label: "2년", months: 24 },
  { key: "ALL", label: "전체", months: null },
];

type TradeFilter = "both" | "maemae" | "jeonse";

function getCutoffMonth(monthsBack: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - monthsBack);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonth(ym: string): string {
  if (!ym || ym.length < 6) return ym;
  return `${ym.slice(2, 4)}.${ym.slice(4, 6)}`;
}

interface Dataset {
  complexNo: string;
  complexName: string;
  items: PriceHistoryItem[];
}

interface Props {
  datasets: Dataset[];
}

export default function ComparePriceTrendChart({ datasets }: Props) {
  const [period, setPeriod] = useState<PeriodKey>("ALL");
  const [tradeFilter, setTradeFilter] = useState<TradeFilter>("both");

  const { chartData, seriesKeys, latestBest } = useMemo(() => {
    const sel = PERIODS.find((p) => p.key === period);
    const cutoff = sel?.months ? getCutoffMonth(sel.months) : null;

    // 모든 월 수집 + merge
    const monthMap = new Map<string, Record<string, string | number | null>>();
    for (const ds of datasets) {
      for (const item of ds.items) {
        if (cutoff && item.base_month < cutoff) continue;
        const label = item.trade_type_label;
        if (tradeFilter === "maemae" && label !== "매매") continue;
        if (tradeFilter === "jeonse" && label !== "전세") continue;

        if (!monthMap.has(item.base_month)) {
          monthMap.set(item.base_month, { month: formatMonth(item.base_month) });
        }
        const row = monthMap.get(item.base_month)!;
        const key = `${ds.complexName}_${label}`;
        if (item.price_avg != null) row[key] = item.price_avg;
      }
    }

    const sorted = Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, row]) => row);

    // 시리즈 키 생성
    const keys: { dataKey: string; color: string; dashed: boolean; name: string }[] = [];
    for (let i = 0; i < datasets.length; i++) {
      const color = COMPARE_COLORS[i % COMPARE_COLORS.length].main;
      if (tradeFilter !== "jeonse") {
        keys.push({
          dataKey: `${datasets[i].complexName}_매매`,
          color,
          dashed: false,
          name: `${datasets[i].complexName} 매매`,
        });
      }
      if (tradeFilter !== "maemae") {
        keys.push({
          dataKey: `${datasets[i].complexName}_전세`,
          color,
          dashed: true,
          name: `${datasets[i].complexName} 전세`,
        });
      }
    }

    // 최근 월 우위 (매매 기준)
    let bestName = "";
    if (sorted.length > 0) {
      const last = sorted[sorted.length - 1];
      let bestVal = -1;
      for (const ds of datasets) {
        const v = Number(last[`${ds.complexName}_매매`]) || 0;
        if (v > bestVal) {
          bestVal = v;
          bestName = ds.complexName;
        }
      }
    }

    return { chartData: sorted, seriesKeys: keys, latestBest: bestName };
  }, [datasets, period, tradeFilter]);

  if (chartData.length === 0) {
    return <p className="text-gray-500 text-sm py-8 text-center">가격 추이 데이터가 부족합니다.</p>;
  }

  return (
    <div>
      {/* 컨트롤 */}
      <div className="flex flex-wrap gap-2 mb-3 justify-between items-center">
        <div className="flex gap-1">
          {(["both", "maemae", "jeonse"] as TradeFilter[]).map((tf) => (
            <button
              key={tf}
              onClick={() => setTradeFilter(tf)}
              className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                tradeFilter === tf
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-600 border-gray-300 hover:border-blue-400"
              }`}
            >
              {tf === "both" ? "전체" : tf === "maemae" ? "매매" : "전세"}
            </button>
          ))}
        </div>
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

      <ResponsiveContainer width="100%" height={400}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" fontSize={11} />
          <YAxis tickFormatter={formatChartPrice} fontSize={11} width={68} />
          <Tooltip formatter={(value: number) => formatChartPrice(value)} />
          <Legend />
          {seriesKeys.map((sk) => (
            <Line
              key={sk.dataKey}
              type="monotone"
              dataKey={sk.dataKey}
              name={sk.name}
              stroke={sk.color}
              strokeWidth={2}
              strokeDasharray={sk.dashed ? "5 5" : undefined}
              dot={false}
              connectNulls
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>

      {latestBest && (
        <p className="text-center text-sm mt-2">
          <span className="text-green-600 font-bold">★ 최근 매매 최고: {latestBest}</span>
        </p>
      )}
    </div>
  );
}
