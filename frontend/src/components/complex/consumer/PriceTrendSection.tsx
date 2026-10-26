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
    <svg viewBox={`0 0 ${W} ${BAND_H}`} className="w-full max-w-[480px] h-auto" role="img" aria-label={label} data-testid="consumer-bands">
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

/** 지역 흐름 그림 높이·위아래 여백(값 라벨 자리) */
const LINE_H = 96;
const LINE_TOP = 16;
const LINE_BOTTOM = 16;
/** 전세가율 축 최소 폭(%p) — 1%p 오르내림이 칸 높이 전체로 보이는 과장을 막는다(메인 결정 2026-10-26) */
export const JEONSE_MIN_SPAN = 5;

/**
 * 축 범위 [아래, 위] — 값 범위가 minSpan 미만이면 가운데 ± minSpan/2 로 고정, 아니면 최소~최대 + 위아래 10% 여백.
 * 0부터 시작하지 않는다. 값이 하나뿐이면(폭 0) 그 값 ±5%.
 */
export function axisRange(nums: number[], minSpan = 0): [number, number] {
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  const span = hi - lo;
  if (minSpan > 0 && span < minSpan) {
    const mid = (lo + hi) / 2;
    return [mid - minSpan / 2, mid + minSpan / 2];
  }
  const pad = span > 0 ? span * 0.1 : Math.abs(lo) * 0.05 || 1;
  return [lo - pad, hi + pad];
}

type TrendKey = "sale_price_median" | "jeonse_ratio";

/** 선 하나의 점 좌표 — 값이 없는 달은 건너뛴다 */
export function trendPoints(items: RegionTrendItem[], key: TrendKey): { x: number; y: number; v: number }[] {
  const vals = items.map((it) => it[key]);
  const nums = vals.filter((v): v is number => v != null);
  if (nums.length === 0) return [];
  const [lo, hi] = axisRange(nums, key === "jeonse_ratio" ? JEONSE_MIN_SPAN : 0);
  const plot = LINE_H - LINE_TOP - LINE_BOTTOM;
  const step = items.length > 1 ? W / (items.length - 1) : 0;
  const out: { x: number; y: number; v: number }[] = [];
  vals.forEach((v, i) => {
    if (v == null) return;
    out.push({ x: i * step, y: LINE_TOP + ((hi - v) / (hi - lo)) * plot, v });
  });
  return out;
}

/** 선 + 양 끝 값 라벨(첫 달·마지막 달). 매매가 라벨은 점 위, 전세가율 라벨은 점 아래 — 두 선 라벨이 덜 겹치게 */
function TrendLine({ items, k, color, fmt }: { items: RegionTrendItem[]; k: TrendKey; color: string; fmt: (v: number) => string }) {
  const pts = trendPoints(items, k);
  if (pts.length === 0) return null;
  const ends = pts.length > 1 ? [pts[0], pts[pts.length - 1]] : [pts[0]];
  const below = k === "jeonse_ratio";
  return (
    <g data-testid={`trend-${k}`}>
      <polyline fill="none" stroke={color} strokeWidth="2" points={pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")} />
      {ends.map((p, i) => (
        <text
          key={i}
          x={i === 0 ? 2 : W - 2}
          y={below ? Math.min(LINE_H - 2, p.y + 13) : Math.max(10, p.y - 5)}
          fontSize="10"
          fill={color}
          textAnchor={i === 0 ? "start" : "end"}
        >
          {fmt(p.v)}
        </text>
      ))}
    </g>
  );
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
          <svg viewBox={`0 0 ${W} ${LINE_H}`} className="w-full max-w-[480px] h-auto" role="img" aria-label={`${trend.region_name} 중위 매매가와 전세가율 2년 흐름`}>
            {sale && <TrendLine items={items} k="sale_price_median" color="#1d4ed8" fmt={formatKoreanPrice} />}
            {jeonse && <TrendLine items={items} k="jeonse_ratio" color="#d97706" fmt={(v) => `${v.toFixed(1)}%`} />}
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
