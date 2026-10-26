"use client";

import type { PublicPriceHistory, RegionTrend, RegionTrendItem } from "@/types";
import { Card } from "@/components/ui/card";
import { formatChartPrice, formatKoreanPrice } from "@/lib/format";
import { monthsEndingAt, ymDot, ymShort } from "./consumer-format";

interface Props {
  history: PublicPriceHistory | null | undefined;
  trend: RegionTrend | null | undefined;
  /** 띠 그래프 마지막 달 "YYYYMM"(오늘 달) — 시험은 고정값 */
  endYm: string;
}

const W = 340;
const BAND_H = 130;
const TOP = 12;
const BOTTOM = 108;

/** 이 단지 면적 하나의 월별 최저~최고 띠 24개월 — 1건(최저=최고)이면 점, 거래 없는 달은 비움 */
function MonthBands({ history, endYm }: { history: PublicPriceHistory; endYm: string }) {
  const slots = monthsEndingAt(endYm, 24);
  const byMonth = new Map(history.months.map((m) => [m.month, m]));
  const lo = history.two_year?.min ?? 0;
  const hi = history.two_year?.max ?? 0;
  const y = (v: number) => (hi > lo ? BOTTOM - ((v - lo) / (hi - lo)) * (BOTTOM - TOP) : (TOP + BOTTOM) / 2);
  const step = W / slots.length;
  const label = `${history.area_m2}제곱미터 월별 거래 범위 띠`;
  return (
    <svg viewBox={`0 0 ${W} ${BAND_H}`} className="w-full h-auto" role="img" aria-label={label} data-testid="consumer-bands">
      <line x1="0" y1={BOTTOM + 2} x2={W} y2={BOTTOM + 2} stroke="#e5e7eb" />
      {slots.map((ym, i) => {
        const m = byMonth.get(ym);
        if (!m) return null;
        const cx = i * step + step / 2;
        if (m.price_max === m.price_min) {
          return <circle key={ym} data-month={ym} cx={cx} cy={y(m.price_min)} r={4} fill="#f59e0b" />;
        }
        const top = y(m.price_max);
        return (
          <rect key={ym} data-month={ym} x={cx - 4.5} y={top} width={9} height={Math.max(3, y(m.price_min) - top)} rx={3} fill="#f59e0b" />
        );
      })}
      {[0, 12, slots.length - 1].map((i) => (
        <text key={i} x={Math.min(i * step, W - 30)} y={BAND_H - 4} fontSize="10" fill="#6b7280">{ymShort(slots[i])}</text>
      ))}
      {hi > 0 && <text x={W - 4} y={TOP + 4} fontSize="10" fill="#6b7280" textAnchor="end">{formatChartPrice(hi)}</text>}
      {lo > 0 && hi > lo && <text x={W - 4} y={BOTTOM - 2} fontSize="10" fill="#6b7280" textAnchor="end">{formatChartPrice(lo)}</text>}
    </svg>
  );
}

function points(items: RegionTrendItem[], key: "sale_price_median" | "jeonse_ratio", h: number): string {
  const vals = items.map((it) => it[key]);
  const nums = vals.filter((v): v is number => v != null);
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  const step = items.length > 1 ? W / (items.length - 1) : 0;
  return vals
    .map((v, i) => (v == null ? null : `${(i * step).toFixed(1)},${(hi > lo ? h - 4 - ((v - lo) / (hi - lo)) * (h - 8) : h / 2).toFixed(1)}`))
    .filter(Boolean)
    .join(" ");
}

function firstLast(items: RegionTrendItem[], key: "sale_price_median" | "jeonse_ratio"): [number, number] | null {
  const vals = items.map((it) => it[key]).filter((v): v is number => v != null);
  return vals.length > 0 ? [vals[0], vals[vals.length - 1]] : null;
}

/** S2 · 어떻게 변해 왔나 — 둘 다 비면 카드 숨김. 지역 통계의 중위 매매가는 예외로 보인다(부동산원 공식 통계) */
export default function PriceTrendSection({ history, trend, endYm }: Props) {
  const hasBands = !!history && history.months.length > 0;
  const items = trend?.items ?? [];
  const sale = firstLast(items, "sale_price_median");
  const jeonse = firstLast(items, "jeonse_ratio");
  const hasTrend = items.length > 0 && (sale != null || jeonse != null);
  if (!hasBands && !hasTrend) return null;

  const parts: string[] = [];
  if (sale) parts.push(`중위 매매가 ${formatKoreanPrice(sale[0])}→${formatKoreanPrice(sale[1])}`);
  if (jeonse) parts.push(`전세가율 ${jeonse[0].toFixed(1)}%→${jeonse[1].toFixed(1)}%`);
  const period = items.length > 0 ? `${ymDot(items[0].period)}~${ymDot(items[items.length - 1].period)}` : "";

  return (
    <Card className="p-4 space-y-3" aria-labelledby="consumer-q2">
      <h2 id="consumer-q2" className="text-sm font-bold text-blue-700 tracking-wide">2 · 어떻게 변해 왔나</h2>
      {hasBands && history && (
        <div className="space-y-1">
          <h3 className="text-base font-bold">{history.area_m2}㎡ 월별 거래 범위 · 2년</h3>
          {history.basis && <p className="text-xs text-gray-500">{history.basis} · 거래 없는 달은 비움</p>}
          <MonthBands history={history} endYm={endYm} />
        </div>
      )}
      {hasTrend && trend && (
        <div className="space-y-1">
          <p className="text-sm" data-testid="consumer-region-sentence">
            {trend.region_name} 아파트는 2년 동안 {parts.join(" · ")}
          </p>
          <svg viewBox={`0 0 ${W} 60`} className="w-full h-auto" role="img" aria-label={`${trend.region_name} 중위 매매가와 전세가율 2년 흐름`}>
            {sale && <polyline fill="none" stroke="#1d4ed8" strokeWidth="2" points={points(items, "sale_price_median", 60)} />}
            {jeonse && <polyline fill="none" stroke="#f59e0b" strokeWidth="2" points={points(items, "jeonse_ratio", 60)} />}
          </svg>
          <p className="text-xs text-gray-400">
            {trend.source} {period}
            {sale ? " · 파랑 중위 매매가" : ""}
            {jeonse ? " · 주황 전세가율" : ""}
          </p>
        </div>
      )}
    </Card>
  );
}
