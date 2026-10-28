/**
 * 지역(시군구) 2년 흐름 선 그래프 부품 — 순수 SVG(Recharts 아님, 훅 0)라 클라이언트 단지 화면(PriceTrendSection)과
 * 서버 렌더 허브(RegionTrendCard) 둘 다 그린다(세션 484 PR 3c-1b 에서 PriceTrendSection 안에서 떼어 옴 — 동작 변화 0).
 * 지역 통계의 중위 매매가는 예외로 보인다(한국부동산원 공식 통계 — feedback_no_median 은 단지 값에만).
 */
import type { RegionTrendItem } from "@/types";

/** 그림 폭·높이·위아래 여백(값 라벨 자리) */
export const TREND_W = 340;
export const LINE_H = 96;
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

export type TrendKey = "sale_price_median" | "jeonse_ratio";

/** 선 하나의 점 좌표 — 값이 없는 달은 건너뛴다 */
export function trendPoints(items: RegionTrendItem[], key: TrendKey): { x: number; y: number; v: number }[] {
  const vals = items.map((it) => it[key]);
  const nums = vals.filter((v): v is number => v != null);
  if (nums.length === 0) return [];
  const [lo, hi] = axisRange(nums, key === "jeonse_ratio" ? JEONSE_MIN_SPAN : 0);
  const plot = LINE_H - LINE_TOP - LINE_BOTTOM;
  const step = items.length > 1 ? TREND_W / (items.length - 1) : 0;
  const out: { x: number; y: number; v: number }[] = [];
  vals.forEach((v, i) => {
    if (v == null) return;
    out.push({ x: i * step, y: LINE_TOP + ((hi - v) / (hi - lo)) * plot, v });
  });
  return out;
}

/** 선 + 양 끝 값 라벨(첫 달·마지막 달). 매매가 라벨은 점 위, 전세가율 라벨은 점 아래 — 두 선 라벨이 덜 겹치게 */
export function TrendLine({ items, k, color, fmt }: { items: RegionTrendItem[]; k: TrendKey; color: string; fmt: (v: number) => string }) {
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
          x={i === 0 ? 2 : TREND_W - 2}
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

/** 값이 있는 첫 달·마지막 달 값 — 없으면 null */
export function firstLast(items: RegionTrendItem[], key: TrendKey): [number, number] | null {
  const vals = items.map((it) => it[key]).filter((v): v is number => v != null);
  return vals.length > 0 ? [vals[0], vals[vals.length - 1]] : null;
}
