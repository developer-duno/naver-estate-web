"use client";

import { useMemo, useState } from "react";
import {
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ComposedChart, Line,
} from "recharts";
import { COMPARE_COLORS } from "@/lib/constants";
import { formatChartPrice, formatChartMonth, getCutoffMonth, CHART_PERIODS, type PeriodKey } from "@/lib/format";
import type { PriceHistoryItem } from "@/types";

type TradeFilter = "both" | "maemae" | "jeonse";

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
    const sel = CHART_PERIODS.find((p) => p.key === period);
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
          monthMap.set(item.base_month, { month: formatChartMonth(item.base_month) });
        }
        const row = monthMap.get(item.base_month)!;
        const key = `${ds.complexNo}_${label}`;
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
          dataKey: `${datasets[i].complexNo}_매매`,
          color,
          dashed: false,
          name: `${datasets[i].complexName} 매매`,
        });
      }
      if (tradeFilter !== "maemae") {
        keys.push({
          dataKey: `${datasets[i].complexNo}_전세`,
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
        const v = Number(last[`${ds.complexNo}_매매`]) || 0;
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
          {CHART_PERIODS.map((p) => (
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
          <Tooltip formatter={(value) => formatChartPrice(value as number)} />
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
