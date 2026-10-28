import { formatKoreanPrice } from "@/lib/format";
import { ymDot } from "@/components/complex/consumer/consumer-format";
import { LINE_H, TREND_W, TrendLine, firstLast } from "@/components/complex/consumer/trend-line";
import type { RegionTrend } from "@/types";

/**
 * 시군구 허브의 2년 흐름 카드(서버가 그림, 세션 484 PR 3c-1b · 목업 ①) — 첫/끝 문장 + 선 그래프 + 출처·기간.
 * 지역 통계(한국부동산원)의 중위 매매가는 예외로 보인다 — 단지 값은 범위로만(feedback_no_median).
 * 자료가 없으면(추이 0달 또는 두 값 모두 빔) 카드를 그리지 않는다.
 */
export default function RegionTrendCard({ trend }: { trend: RegionTrend }) {
  const items = trend.items ?? [];
  const sale = firstLast(items, "sale_price_median");
  const jeonse = firstLast(items, "jeonse_ratio");
  if (items.length === 0 || (!sale && !jeonse)) return null;

  const parts: string[] = [];
  if (sale) parts.push(`중위 매매가 ${formatKoreanPrice(sale[0])}→${formatKoreanPrice(sale[1])}`);
  if (jeonse) parts.push(`전세가율 ${jeonse[0].toFixed(1)}%→${jeonse[1].toFixed(1)}%`);
  const period = `${ymDot(items[0].period)}~${ymDot(items[items.length - 1].period)}`;
  const name = trend.region_name ?? "이 지역";

  return (
    <section aria-labelledby="region-trend" className="space-y-2 rounded-lg border border-gray-200 bg-white p-4" data-testid="region-trend">
      <h2 id="region-trend" className="text-sm font-bold text-gray-900">2년 흐름</h2>
      <p className="text-sm">{name} 아파트는 2년 동안 {parts.join(" · ")}</p>
      <svg viewBox={`0 0 ${TREND_W} ${LINE_H}`} className="w-full max-w-[480px] h-auto" role="img" aria-label={`${name} 중위 매매가와 전세가율 2년 흐름`}>
        {sale && <TrendLine items={items} k="sale_price_median" color="#1d4ed8" fmt={formatKoreanPrice} />}
        {jeonse && <TrendLine items={items} k="jeonse_ratio" color="#d97706" fmt={(v) => `${v.toFixed(1)}%`} />}
      </svg>
      <p className="text-xs text-gray-400">
        {trend.source} {period}
        {sale ? " · 파랑 중위 매매가" : ""}
        {jeonse ? " · 주황 전세가율" : ""}
      </p>
    </section>
  );
}
