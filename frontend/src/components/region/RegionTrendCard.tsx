import { formatKoreanPrice } from "@/lib/format";
import { ymDot } from "@/components/complex/consumer/consumer-format";
import { LINE_H, TREND_W, TrendLine, firstLast } from "@/components/complex/consumer/trend-line";
import BrandCard from "@/components/brand/BrandCard";
import type { RegionTrend } from "@/types";

/** 카드를 그릴 자료가 있나 — 추이 0달이거나 두 값 모두 비면 없음(허브가 띠 걸침을 정할 때도 쓴다) */
export function hasRegionTrend(trend: RegionTrend): boolean {
  const items = trend.items ?? [];
  return items.length > 0 && !!(firstLast(items, "sale_price_median") || firstLast(items, "jeonse_ratio"));
}

/**
 * 시군구 허브의 2년 흐름 카드(서버가 그림, 세션 484 PR 3c-1b · 목업 ① · 세션 526 B40 PR 2b 새 틀 — 남색 선, 단지 장 PriceTrendSection 과 같은 색) — 첫/끝 문장 + 선 그래프 + 출처·기간.
 * 지역 통계(한국부동산원)의 중위 매매가는 예외로 보인다 — 단지 값은 범위로만(feedback_no_median).
 * 자료가 없으면(추이 0달 또는 두 값 모두 빔) 카드를 그리지 않는다.
 */
export default function RegionTrendCard({ trend }: { trend: RegionTrend }) {
  const items = trend.items ?? [];
  const sale = firstLast(items, "sale_price_median");
  const jeonse = firstLast(items, "jeonse_ratio");
  if (!hasRegionTrend(trend)) return null;

  const parts: string[] = [];
  if (sale) parts.push(`중위 매매가 ${formatKoreanPrice(sale[0])}→${formatKoreanPrice(sale[1])}`);
  if (jeonse) parts.push(`전세가율 ${jeonse[0].toFixed(1)}%→${jeonse[1].toFixed(1)}%`);
  const period = `${ymDot(items[0].period)}~${ymDot(items[items.length - 1].period)}`;
  const name = trend.region_name ?? "이 지역";

  return (
    <BrandCard as="section" aria-labelledby="region-trend" className="space-y-2 p-4 sm:p-5" data-testid="region-trend">
      <h2 id="region-trend" className="text-[15px] font-black text-brand-navy">2년 흐름</h2>
      <p className="text-sm">{name} 아파트는 2년 동안 {parts.join(" · ")}</p>
      <svg viewBox={`0 0 ${TREND_W} ${LINE_H}`} className="w-full max-w-[480px] h-auto" role="img" aria-label={`${name} 중위 매매가와 전세가율 2년 흐름`}>
        {sale && <TrendLine items={items} k="sale_price_median" color="#0b1f3a" fmt={formatKoreanPrice} />}
        {jeonse && <TrendLine items={items} k="jeonse_ratio" color="#d97706" fmt={(v) => `${v.toFixed(1)}%`} />}
      </svg>
      <p className="text-xs text-brand-muted">
        {trend.source} {period}
        {sale ? " · 남색 중위 매매가" : ""}
        {jeonse ? " · 주황 전세가율" : ""}
      </p>
    </BrandCard>
  );
}
