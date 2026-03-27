"use client";

import {
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ComposedChart, Line, Area,
} from "recharts";
import type { PriceHistoryItem } from "@/types";

function formatPrice(value: number): string {
  if (value == null || isNaN(value)) return "-";
  if (value >= 10000) {
    const e = Math.floor(value / 10000);
    const r = value % 10000;
    return r > 0 ? `${e}억${r}만` : `${e}억`;
  }
  return `${value.toLocaleString()}만`;
}

function formatMonth(ym: string): string {
  if (!ym || ym.length < 6) return ym;
  return `${ym.slice(2, 4)}.${ym.slice(4, 6)}`;
}

interface ChartRow {
  month: string;
  매매?: number | null;
  매매_상한?: number | null;
  매매_하한?: number | null;
  매매_범위?: [number, number];
  전세?: number | null;
  전세_상한?: number | null;
  전세_하한?: number | null;
  전세_범위?: [number, number];
}

interface Props {
  items: PriceHistoryItem[];
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ dataKey: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;

  const findVal = (key: string) => {
    const item = payload.find((p) => p.dataKey === key);
    return item?.value != null ? formatPrice(item.value) : null;
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
  if (!items || items.length === 0) {
    return (
      <p className="text-gray-500 text-sm py-8 text-center">
        가격 추이 데이터가 아직 없습니다.<br />
        토요일 자동 수집 또는 데이터 갱신 후 표시됩니다.
      </p>
    );
  }

  const monthMap = new Map<string, ChartRow>();
  for (const item of items) {
    const key = item.base_month;
    if (!monthMap.has(key)) {
      monthMap.set(key, { month: formatMonth(key) });
    }
    const row = monthMap.get(key)!;
    const label = item.trade_type_label as "매매" | "전세";
    if (item.price_avg != null) row[label] = item.price_avg;
    if (item.price_upper != null) row[`${label}_상한`] = item.price_upper;
    if (item.price_lower != null) row[`${label}_하한`] = item.price_lower;
    if (item.price_upper != null && item.price_lower != null) {
      row[`${label}_범위`] = [item.price_lower, item.price_upper];
    }
  }

  const data = Array.from(monthMap.values());
  const hasMaemae = data.some((d) => d["매매"] != null);
  const hasJeonse = data.some((d) => d["전세"] != null);

  return (
    <div role="img" aria-label="단지 가격 추이 차트">
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" fontSize={11} />
          <YAxis tickFormatter={formatPrice} fontSize={11} width={68} />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          {hasMaemae && (
            <>
              <Area
                type="monotone"
                dataKey="매매_범위"
                fill="#ef444420"
                stroke="none"
                connectNulls
                legendType="none"
              />
              <Line type="monotone" dataKey="매매_상한" stroke="#ef444460" strokeWidth={1} strokeDasharray="3 3" dot={false} connectNulls legendType="none" />
              <Line type="monotone" dataKey="매매_하한" stroke="#ef444460" strokeWidth={1} strokeDasharray="3 3" dot={false} connectNulls legendType="none" />
              <Line type="monotone" dataKey="매매" name="매매 평균" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} connectNulls />
            </>
          )}
          {hasJeonse && (
            <>
              <Area
                type="monotone"
                dataKey="전세_범위"
                fill="#3b82f620"
                stroke="none"
                connectNulls
                legendType="none"
              />
              <Line type="monotone" dataKey="전세_상한" stroke="#3b82f660" strokeWidth={1} strokeDasharray="3 3" dot={false} connectNulls legendType="none" />
              <Line type="monotone" dataKey="전세_하한" stroke="#3b82f660" strokeWidth={1} strokeDasharray="3 3" dot={false} connectNulls legendType="none" />
              <Line type="monotone" dataKey="전세" name="전세 평균" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} connectNulls />
            </>
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
