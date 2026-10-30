"use client";

import { useMemo, useState } from "react";
import {
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ComposedChart, Line, Area, Scatter,
} from "recharts";
import type { AreaTrade, PriceHistoryItem } from "@/types";
import { formatChartPrice, formatChartMonth, getCutoffMonth, CHART_PERIODS, type PeriodKey } from "@/lib/format";
import { tradeLineText } from "@/lib/range-price";

interface ChartRow {
  month: string;
  [key: string]: string | number | [number, number] | null | undefined;
}

interface Props {
  items: PriceHistoryItem[];
  /** 범례 뒤에 붙는 면적 표시 — "전용 59㎡ 대"(세션 474 B27). 없으면 옛 범례 그대로 */
  areaLabel?: string;
}

/** 거래 점 하나 — x = 그 달(차트 달 글자), y = 가격(만원) */
interface TradePoint {
  month: string;
  거래: number;
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ dataKey: string; value: number; color: string }>;
  label?: string;
  /** 차트 달 글자("26.06") → 그 달 정부 실거래 거래들(세션 479 B29 — 설명창에 한 줄씩) */
  tradesByMonth?: Map<string, AreaTrade[]>;
}

export function CustomTooltip({ active, payload, label, tradesByMonth }: TooltipProps) {
  if (!active || !payload?.length) return null;

  const findVal = (key: string) => {
    const item = payload.find((p) => p.dataKey === key);
    return item?.value != null ? formatChartPrice(item.value) : null;
  };

  const maemae = findVal("매매");
  const maemaeNaver = findVal("매매_네이버");
  const maemaeUpper = findVal("매매_상한");
  const maemaeLower = findVal("매매_하한");
  // 정부 실거래 매매는 중위 선 없이 범위 띠만(세션 479 B29) — 설명창도 최저~최고 + 그 달 거래 줄
  const govRange = !maemae && maemaeUpper && maemaeLower;
  const trades = (label && tradesByMonth?.get(label)) || [];
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
      {govRange && (
        <div className="text-red-500">
          <span className="font-medium">매매 정부 실거래 최저~최고</span> {maemaeLower === maemaeUpper ? maemaeLower : `${maemaeLower}~${maemaeUpper}`}
        </div>
      )}
      {trades.map((t, i) => (
        <div key={i} className="text-red-400" data-testid="tooltip-trade">
          {tradeLineText(t)}{t.direct ? " · 직거래" : ""}
        </div>
      ))}
      {maemaeNaver && (
        <div className="text-orange-500">
          <span className="font-medium">매매 네이버 시세</span> {maemaeNaver}
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

export default function PriceHistoryChart({ items, areaLabel }: Props) {
  const legendSuffix = areaLabel ? ` (${areaLabel})` : "";
  const [period, setPeriod] = useState<PeriodKey>("ALL");

  const filteredItems = useMemo(() => {
    const sel = CHART_PERIODS.find((p) => p.key === period);
    if (!sel?.months || !items?.length) return items;
    const cutoff = getCutoffMonth(sel.months);
    return items.filter((item) => item.base_month >= cutoff);
  }, [items, period]);

  const { data, points, tradesByMonth, hasMaemae, hasMaemaeLine, hasJeonse, hasMaemaeNaver, hasGovSeries } = useMemo(() => {
    const points: TradePoint[] = [];
    const tradesByMonth = new Map<string, AreaTrade[]>();
    if (!filteredItems || filteredItems.length === 0) {
      return { data: [], points, tradesByMonth, hasMaemae: false, hasMaemaeLine: false, hasJeonse: false, hasMaemaeNaver: false, hasGovSeries: false };
    }
    // 평형을 고르면 BE 가 같은 달 매매를 정부 실거래·네이버 시세 두 계열로 준다 — 합치지 않고 따로 그린다(세션 474 B27)
    const govSeries = filteredItems.some((it) => it.trade_type === "A1" && it.series === "정부 실거래");

    const monthMap = new Map<string, ChartRow>();
    for (const item of filteredItems) {
      const key = item.base_month;
      if (!monthMap.has(key)) {
        monthMap.set(key, { month: formatChartMonth(key) });
      }
      const row = monthMap.get(key)!;
      if (govSeries && item.trade_type === "A1" && item.series === "네이버 시세") {
        if (item.price_avg != null) row["매매_네이버"] = item.price_avg;
        continue;
      }
      // 정부 실거래 매매 = 그 달 최저~최고 띠(직거래 제외 range_lower/upper) + 거래 하나 = 점 하나(세션 479 B29).
      // 중위(price_avg) 선은 그리지 않는다. 점은 trades 가 있는 달만 — BE 가 최근 2년 밖 달엔 [] 를 준다
      if (govSeries && item.trade_type === "A1" && item.series === "정부 실거래") {
        const lo = item.range_lower ?? null;
        const hi = item.range_upper ?? null;
        if (hi != null) row["매매_상한"] = hi;
        if (lo != null) row["매매_하한"] = lo;
        if (lo != null && hi != null) row["매매_범위"] = [lo, hi];
        const trades = item.trades ?? [];
        if (trades.length > 0) {
          tradesByMonth.set(row.month, [...(tradesByMonth.get(row.month) ?? []), ...trades]);
          for (const t of trades) points.push({ month: row.month, 거래: t.price });
        }
        continue;
      }
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
      points,
      tradesByMonth,
      hasMaemae: rows.some((d) => d["매매"] != null || d["매매_범위"] != null),
      hasMaemaeLine: rows.some((d) => d["매매"] != null),
      hasJeonse: rows.some((d) => d["전세"] != null),
      hasMaemaeNaver: rows.some((d) => d["매매_네이버"] != null),
      hasGovSeries: govSeries,
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
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" />
          {/* 같은 달 거래 점을 한 x 에 모은다 — 기본값(true)이면 점마다 범주가 새로 생긴다(PriceHistoryChart.scatter.test) */}
          <XAxis dataKey="month" fontSize={11} allowDuplicatedCategory={false} />
          <YAxis tickFormatter={formatChartPrice} fontSize={11} width={68} />
          <Tooltip content={<CustomTooltip tradesByMonth={tradesByMonth} />} />
          <Legend />
          {hasMaemae && (
            <>
              {hasGovSeries ? (
                <Area type="monotone" dataKey="매매_범위" name={`매매 정부 실거래 최저~최고${legendSuffix}`} fill="#ef444420" stroke="none" connectNulls legendType="square" />
              ) : (
                <Area type="monotone" dataKey="매매_범위" fill="#ef444420" stroke="none" connectNulls legendType="none" />
              )}
              <Line type="monotone" dataKey="매매_상한" stroke="#ef444460" strokeWidth={1} strokeDasharray="3 3" dot={false} connectNulls legendType="none" />
              <Line type="monotone" dataKey="매매_하한" stroke="#ef444460" strokeWidth={1} strokeDasharray="3 3" dot={false} connectNulls legendType="none" />
              {/* 옛 응답(계열 없음 — 네이버 시세 평균)만 선. 정부 실거래는 중위 선 없음(세션 479 B29) */}
              {hasMaemaeLine && (
                <Line type="monotone" dataKey="매매" name={`매매 평균${legendSuffix}`} stroke="#ef4444" strokeWidth={2} dot={{ r: 5, fill: "#ef4444" }} activeDot={{ r: 7, stroke: "#ef4444", strokeWidth: 2, fill: "#fff" }} connectNulls />
              )}
            </>
          )}
          {points.length > 0 && (
            <Scatter data={points} dataKey="거래" name="매매 실거래(거래 1건 = 점 1개)" fill="#ef4444" isAnimationActive={false} />
          )}
          {hasMaemaeNaver && (
            <Line type="monotone" dataKey="매매_네이버" name="매매 네이버 시세(이 평형)" stroke="#f97316" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 4, fill: "#f97316" }} connectNulls />
          )}
          {hasJeonse && (
            <>
              <Area type="monotone" dataKey="전세_범위" fill="#3b82f620" stroke="none" connectNulls legendType="none" />
              <Line type="monotone" dataKey="전세_상한" stroke="#3b82f660" strokeWidth={1} strokeDasharray="3 3" dot={false} connectNulls legendType="none" />
              <Line type="monotone" dataKey="전세_하한" stroke="#3b82f660" strokeWidth={1} strokeDasharray="3 3" dot={false} connectNulls legendType="none" />
              <Line type="monotone" dataKey="전세" name={`전세 평균${legendSuffix}`} stroke="#3b82f6" strokeWidth={2} dot={{ r: 5, fill: "#3b82f6" }} activeDot={{ r: 7, stroke: "#3b82f6", strokeWidth: 2, fill: "#fff" }} connectNulls />
            </>
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
