/**
 * 전용면적 묶음 — 정수 ㎡ 로 내림 (세션 474 B27, 사장님 결정 D2 「ㄱ. 정수 ㎡로 내림」).
 *
 * BE 정본 = backend/crawler/area_group.py `area_group_of` (84.94 → 84 · 59.98 → 59 · 0 이하·못 읽음 → null).
 * 화면은 평형표(PyeongDetail.exclusive_area 문자열)와 공시가격(prvuse_ar 숫자)을 같은 규칙으로 묶을 때만 쓴다.
 */
import { formatKoreanPrice } from "@/lib/format";
import type { AreaPrice, ArticleFilters } from "@/types";

/** 면적 섞인 옛 값 안내 — 대표 면적이 없는데 옛 값이 남은 단지(세션 474 보완 F2 · 사장님 결정 Q4) */
export const LEGACY_NOTE = "면적 섞인 옛 값 — 최근 6개월 거래가 없어 다시 계산되지 않았어요";

export function areaGroupOf(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null;
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  const group = Math.floor(num);
  return group > 0 ? group : null;
}

/**
 * 대표 면적을 뺀 다른 면적 줄 — "84㎡ 2억 2,000만 (1건) · 42㎡ —" (최대 3개).
 * area_prices 는 BE 가 평형표의 모든 묶음을 대표 먼저·거래 수 순으로 준다(거래 없는 묶음 = price_median null) —
 * 그 순서 그대로 쓴다(묶음 규칙·세대수의 정본은 BE).
 */
export function otherAreaText(rep: number, areaPrices: AreaPrice[], max = 3): string {
  return areaPrices
    .filter((ap) => ap.area_m2 !== rep)
    .slice(0, max)
    .map((ap) =>
      ap.price_median != null
        ? `${ap.area_m2}㎡ ${formatKoreanPrice(ap.price_median)} (${ap.trade_count ?? 0}건)`
        : `${ap.area_m2}㎡ —`,
    )
    .join(" · ");
}

/**
 * 평형표로 고른 대표 면적 묶음(세션 475 PR 6) — BE crawler/area_group.py `pick_representative` 와 같은 규칙:
 * 묶음별 세대수 합 최다 → 동률이면 작은 면적. 화면엔 최근 거래 수가 없어 BE 의 "동률이면 거래 수" 단계는 빠진다.
 * 면적을 하나도 못 읽으면 null.
 */
export function pickRepresentativeArea(
  table: { exclusive_area?: string; household_count_by_pyeong?: string }[],
): number | null {
  const households = new Map<number, number>();
  for (const p of table) {
    const area = areaGroupOf(p.exclusive_area);
    if (area == null) continue;
    // BE parse_households 와 같게 — 쉼표를 지우고 첫 숫자 덩어리, 못 읽으면 0
    const hh = Number((p.household_count_by_pyeong ?? "").replace(/,/g, "").match(/\d+/)?.[0] ?? 0);
    households.set(area, (households.get(area) ?? 0) + hh);
  }
  let best: number | null = null;
  for (const [area, hh] of households) {
    if (best == null || hh > households.get(best)! || (hh === households.get(best)! && area < best)) best = area;
  }
  return best;
}

/**
 * 면적 묶음 N 의 매물 목록 필터 — N 이상 N+1 미만(소수점 버림 규칙과 같게, 세션 475 PR 6 보완).
 * 서버(db/query_helpers.py)는 max_area_m2 를 `<=` 로 비교하고 매물 면적은 소수 둘째 자리까지라 N+0.999 로 끊는다.
 */
export function areaGroupRange(group: number): { min_area_m2: number; max_area_m2: number } {
  return { min_area_m2: group, max_area_m2: group + 0.999 };
}

/** 같은 거래유형·같은 면적 묶음 매물 요청 필터 — 경쟁 매물과 매물 상세 부모가 같은 queryKey 를 쓰게 한 곳에서 */
export function sameAreaFilters(
  tradeTypeName: string | undefined,
  areaM2: number | null | undefined,
): ArticleFilters | undefined {
  const group = areaGroupOf(areaM2);
  const filters: ArticleFilters = {
    ...(tradeTypeName ? { trade_types: tradeTypeName } : {}),
    ...(group != null ? areaGroupRange(group) : {}),
  };
  return Object.keys(filters).length > 0 ? filters : undefined;
}

/** 층별 시세 기준 줄 — "전용 59㎡ 대 매물 기준"(세션 475 PR 6). 묶음을 모르면 null(줄 없음) */
export function floorAreaNote(area: number | null | undefined): string | null {
  return area ? `전용 ${area}㎡ 대 매물 기준` : null;
}

/** 그 면적 묶음의 6개월 중위(없으면 null) — 공시가율 분모 */
export function areaMedianOf(areaPrices: AreaPrice[] | undefined, group: number | null): number | null {
  if (group == null || !areaPrices) return null;
  const hit = areaPrices.find((ap) => ap.area_m2 === group);
  return hit?.price_median ?? null;
}
