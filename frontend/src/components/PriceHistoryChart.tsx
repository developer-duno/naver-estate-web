"use client";

import { useMemo, useState } from "react";
import {
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ComposedChart, Line, Area,
} from "recharts";
import type { PriceHistoryItem } from "@/types";
import { formatChartPrice } from "@/lib/format";

function formatMonth(ym: string): string {
  if (!ym || ym.length < 6) return ym;
  return `${ym.slice(2, 4)}.${ym.slice(4, 6)}`;
}

interface ChartRow {
  month: string;
  [key: string]: string | number | [number, number] | null | undefined;
}

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

interface Props {
  items: PriceHistoryItem[];
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ dataKey: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;

  const findVal = (key: string) => {
    const item = payload.find((p) => p.dataKey === key);
    return item?.value != null ? formatChartPrice(item.value) : null;
  };

  const maemae = findVal("매매");
  const maemaeUpper = findVal("매매_상한");
  const maemaeLower = findVal("매매_하한");
  const jeonse = findVal("전세");
  const jeonseUpper = findVal("전세_상한");
  const jeonseLower = findVal("전세_하한");

  return (
    <div className="bg-white border rounded shadow-sm px-3 py-2 text-xs">
      <p className="font-medium mb-1">{label}</p>
      {maemae && (
        <div className="text-red-500">
          <span className="font-medium">매매</span> {maemae}
          {maemaeUpper && maemaeLower && (
            <span className="text-gray-400 ml-1">({maemaeLower}~{maemaeUpper})</span>
          )}
        </div>
      )}
      {jeonse && (
        <div className="text-blue-500">
          <span className="font-medium">전세</span> {jeonse}
          {jeonseUpper && jeonseLower && (
            <span className="text-gray-400 ml-1">({jeonseLower}~{jeonseUpper})</span>
          )}
        </div>
      )}
    </div>
  );
}

export default function PriceHistoryChart({ items }: Props) {
  const [period, setPeriod] = useState<PeriodKey>("ALL");

  const filteredItems = useMemo(() => {
    const sel = PERIODS.find((p) => p.key === period);
    if (!sel?.months || !items?.length) return items;
    const cutoff = getCutoffMonth(sel.months);
    return items.filter((item) => item.base_month >= cutoff);
  }, [items, period]);

  const { data, hasMaemae, hasJeonse } = useMemo(() => {
    if (!filteredItems || filteredItems.length === 0) return { data: [], hasMaemae: false, hasJeonse: false };

    const monthMap = new Map<string, ChartRow>();
    for (const item of filteredItems) {
      const key = item.base_month;
      if (!monthMap.has(key)) {
        monthMap.set(key, { month: formatMonth(key) });
      }
      const row = monthMap.get(key)!;
      const label = item.trade_type_label;
      if (item.price_avg != null) row[label] = item.price_avg;
      if (item.price_upper != null) row[`${label}_상한`] = item.price_upper;
      if (item.price_lower != null) row[`${label}_하한`] = item.price_lower;
      if (item.price_upper != null && item.price_lower != null) {
        row[`${label}_범위`] = [item.price_lower, item.price_upper];
      }
    }

    const rows = Array.from(monthMap.values());
    return {
      data: rows,
      hasMaemae: rows.some((d) => d["매매"] != null),
      hasJeonse: rows.some((d) => d["전세"] != null),
    };
  }, [filteredItems]);

  if (data.length === 0) {
    return (
      <p className="text-gray-500 text-sm py-8 text-center">
        가격 추이 데이터가 아직 없습니다.<br />
        자동 수집 또는 데이터 갱신 후 표시됩니다.
      </p>
    );
  }

  return (
    <div role="img" aria-label="단지 가격 추이 차트">
      <div className="flex gap-1 mb-2 justify-end">
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
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" fontSize={11} />
          <YAxis tickFormatter={formatChartPrice} fontSize={11} width={68} />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          {hasMaemae && (
            <>
              <Area type="monotone" dataKey="매매_범위" fill="#ef444420" stroke="none" connectNulls legendType="none" />
              <Line type="monotone" dataKey="매매_상한" stroke="#ef444460" strokeWidth={1} strokeDasharray="3 3" dot={false} connectNulls legendType="none" />
              <Line type="monotone" dataKey="매매_하한" stroke="#ef444460" strokeWidth={1} strokeDasharray="3 3" dot={false} connectNulls legendType="none" />
              <Line type="monotone" dataKey="매매" name="매매 평균" stroke="#ef4444" strokeWidth={2} dot={{ r: 5, fill: "#ef4444" }} activeDot={{ r: 7, stroke: "#ef4444", strokeWidth: 2, fill: "#fff" }} connectNulls />
            </>
          )}
          {hasJeonse && (
            <>
              <Area type="monotone" dataKey="전세_범위" fill="#3b82f620" stroke="none" connectNulls legendType="none" />
              <Line type="monotone" dataKey="전세_상한" stroke="#3b82f660" strokeWidth={1} strokeDasharray="3 3" dot={false} connectNulls legendType="none" />
              <Line type="monotone" dataKey="전세_하한" stroke="#3b82f660" strokeWidth={1} strokeDasharray="3 3" dot={false} connectNulls legendType="none" />
              <Line type="monotone" dataKey="전세" name="전세 평균" stroke="#3b82f6" strokeWidth={2} dot={{ r: 5, fill: "#3b82f6" }} activeDot={{ r: 7, stroke: "#3b82f6", strokeWidth: 2, fill: "#fff" }} connectNulls />
            </>
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
