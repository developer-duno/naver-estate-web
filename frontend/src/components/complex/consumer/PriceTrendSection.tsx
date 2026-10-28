"use client";

import Link from "next/link";
import type { PublicPriceHistory, RegionTrend } from "@/types";
import type { PublicSummaryBreadcrumb } from "@/types/public-summary";
import { REGION_PAGES_ENABLED, regionHubPath } from "@/lib/seo/complex-page";
import { Card } from "@/components/ui/card";
import { formatChartPrice, formatKoreanPrice } from "@/lib/format";
import LoadRetry from "./LoadRetry";
import { monthsEndingAt, ymDot, ymShort } from "./consumer-format";
import { LINE_H, TrendLine, firstLast } from "./trend-line";

interface Props {
  history: PublicPriceHistory | null | undefined;
  trend: RegionTrend | null | undefined;
  /** 띠 그래프 마지막 달 "YYYYMM"(오늘 달) — 시험은 고정값 */
  endYm: string;
  /** 이 카드 자료 중 불러오지 못한 것이 있으면 다시 시도 — 자료가 없어도 카드를 숨기지 않는다(보완 A-4) */
  onRetry?: () => void;
  /** 서버 공개 요약 빵부스러기 — 시군구 허브 링크 재료(없으면 링크 없음) */
  breadcrumb?: PublicSummaryBreadcrumb | null;
  /** 한 줄 + 허브 링크로 줄일까 — 기본 = 지역 페이지가 열렸고 빵부스러기(시군구)가 있을 때(결정 28·30). 시험은 직접 넣는다 */
  compact?: boolean;
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

// 지역 흐름 선 그래프 부품은 trend-line.tsx 로 옮겼다(세션 484 PR 3c-1b — 허브 서버 렌더와 같이 씀). 시험 호환을 위해 다시 내보낸다
export { JEONSE_MIN_SPAN, axisRange, trendPoints } from "./trend-line";

/**
 * S2 · 어떻게 변해 왔나 — 둘 다 비면 카드 숨김. 지역 통계의 중위 매매가는 예외로 보인다(부동산원 공식 통계).
 * 지역(시군구) 흐름: 지역 페이지가 열렸고 빵부스러기가 있으면(compact 기본) 한 줄 + 시군구 허브 링크(결정 28·30 — 허브는 지역 있는 단지면 늘 있다),
 * 아니면 지금(#773)처럼 문장 + 2년 선 그래프.
 */
export default function PriceTrendSection({ history, trend, endYm, onRetry, breadcrumb = null, compact = REGION_PAGES_ENABLED && !!breadcrumb }: Props) {
  const hasBands = !!history && history.months.length > 0;
  const items = trend?.items ?? [];
  const sale = firstLast(items, "sale_price_median");
  const jeonse = firstLast(items, "jeonse_ratio");
  const hasTrend = items.length > 0 && (sale != null || jeonse != null);
  if (!hasBands && !hasTrend && !onRetry) return null;

  const parts: string[] = [];
  if (sale) parts.push(`중위 매매가 ${formatKoreanPrice(sale[0])}→${formatKoreanPrice(sale[1])}`);
  if (jeonse) parts.push(`전세가율 ${jeonse[0].toFixed(1)}%→${jeonse[1].toFixed(1)}%`);
  const period = items.length > 0 ? `${ymDot(items[0].period)}~${ymDot(items[items.length - 1].period)}` : "";
  const hubHref = compact && breadcrumb ? regionHubPath(breadcrumb.sigungu_code) : null;

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
      {hasTrend && trend && compact && (
        <p className="text-sm" data-testid="consumer-region-sentence">
          {trend.region_name} 아파트 2년 {parts.join(" · ")}
          <span className="text-xs text-gray-400"> · {trend.source} {period}</span>
          {hubHref && (
            <>
              {" "}
              <Link href={hubHref} prefetch={false} className="text-xs text-blue-700 underline">{trend.region_name} 지역 정보</Link>
            </>
          )}
        </p>
      )}
      {hasTrend && trend && !compact && (
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
      {onRetry && <LoadRetry onRetry={onRetry} />}
    </Card>
  );
}
