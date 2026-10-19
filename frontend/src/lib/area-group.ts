/**
 * 전용면적 묶음 — 정수 ㎡ 로 내림 (세션 474 B27, 사장님 결정 D2 「ㄱ. 정수 ㎡로 내림」).
 *
 * BE 정본 = backend/crawler/area_group.py `area_group_of` (84.94 → 84 · 59.98 → 59 · 0 이하·못 읽음 → null).
 * 화면은 평형표(PyeongDetail.exclusive_area 문자열)와 공시가격(prvuse_ar 숫자)을 같은 규칙으로 묶을 때만 쓴다.
 */
import { formatKoreanPrice } from "@/lib/format";
import type { AreaPrice } from "@/types";

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

/** 그 면적 묶음의 6개월 중위(없으면 null) — 공시가율 분모 */
export function areaMedianOf(areaPrices: AreaPrice[] | undefined, group: number | null): number | null {
  if (group == null || !areaPrices) return null;
  const hit = areaPrices.find((ap) => ap.area_m2 === group);
  return hit?.price_median ?? null;
}
