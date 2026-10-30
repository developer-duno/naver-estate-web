/**
 * 중개사 화면(단지 대시보드·비교표·매물 상세) 시세 범위 글자 — 순수 함수(세션 479 B29 설계 · 세션 489 PR b2).
 *
 * 이 단지 값은 최저~최고 범위로만 보인다 — 중위(price_median·nearby_median_price)는 여기서 읽지 않는다
 * (사장님 결정 2026-10-25, feedback_no_median). 범위는 BE 가 직거래를 빼고 낸 값(price_min/max),
 * 건수 N 은 그 묶음 거래 목록(trades) 길이 — 펼친 목록 줄 수와 같은 출처(잡 값 recent_trades_6m 은 안 씀).
 */
import { formatKoreanPrice } from "@/lib/format";
import type { AreaPrice, AreaTrade, Complex } from "@/types";

/** "1억 5,700만 ~ 1억 8,000만" — 같으면 한 값. spaced=false 면 "2억 2,000만~2억 4,900만"(다른 면적 줄) */
export function rangeText(min: number, max: number, spaced = true): string {
  if (min === max) return formatKoreanPrice(min);
  return `${formatKoreanPrice(min)}${spaced ? " ~ " : "~"}${formatKoreanPrice(max)}`;
}

/** 면적 묶음 하나의 범위 요약 — value = 범위 글자(재료 없으면 "—") · count = 거래 목록 길이 · directOnly = 중개거래 0건 */
export interface AreaRangeSummary {
  value: string;
  count: number;
  directOnly: boolean;
  /** 최저 = 최고(한 값) */
  single: boolean;
}

export function areaRangeSummary(ap: AreaPrice | null | undefined, spaced = true): AreaRangeSummary {
  const count = ap?.trades?.length ?? 0;
  if (ap && ap.price_min != null && ap.price_max != null) {
    return { value: rangeText(ap.price_min, ap.price_max, spaced), count, directOnly: false, single: ap.price_min === ap.price_max };
  }
  return { value: "—", count, directOnly: count > 0, single: false };
}

/** 대시보드 큰 값 — 범위, 최저=최고이고 2건 이상이면 "1억 8,000만 (2건)"(설계 §2-5 ②) */
export function repPrimaryText(s: AreaRangeSummary): string {
  return s.single && s.count >= 2 ? `${s.value} (${s.count}건)` : s.value;
}

/** 대시보드 칩 — "최근 6개월 3건" · 직거래만이면 "최근 6개월 3건(직거래만)" · 거래 목록이 비면 칩 없음(0건으로 보이지 않게) */
export function repChipText(s: AreaRangeSummary): string | undefined {
  if (s.count === 0) return undefined;
  return `최근 6개월 ${s.count}건${s.directOnly ? "(직거래만)" : ""}`;
}

/** 비교표·매물 상세 꼬리 — " (3건)" · 직거래만이면 " (직거래만 3건)" · 거래 목록이 비면 "" */
export function countSuffix(s: AreaRangeSummary): string {
  if (s.count === 0) return "";
  return s.directOnly ? ` (직거래만 ${s.count}건)` : ` (${s.count}건)`;
}

/** 거래 한 줄 — "2026.06.26 · 4층 · 1억 5,700만" · 날짜 없으면 "날짜 미상" · 층 없으면 층 생략 (직거래 표시는 따로) */
export function tradeLineText(t: AreaTrade): string {
  const date = t.date && /^\d{4}-\d{2}-\d{2}$/.test(t.date) ? t.date.replace(/-/g, ".") : "날짜 미상";
  return [date, t.floor != null ? `${t.floor}층` : null, formatKoreanPrice(t.price)].filter(Boolean).join(" · ");
}

/** 전세가율 범위 — "72%~80%" · 같으면 한 값 · 둘 다 없으면 null(비움) */
export function percentRangeText(min: number | null | undefined, max: number | null | undefined): string | null {
  if (min == null && max == null) return null;
  if (min == null || max == null || min === max) return `${(min ?? max)!}%`;
  return `${min}%~${max}%`;
}

/**
 * 비교표·매물 상세 단지 카드의 대표 면적 시세 한 줄 — "1억 5,700만 ~ 1억 8,000만 (3건)"(withArea 면 앞에 "59㎡ ")
 * · 옛 값 단지 "범위 (YYYY년 M월 거래 · …)" · 칸이 응답에 없으면(직접 조회 폴백 등) null = 그리지 않는다 · 값 없음은 "—".
 */
export function complexPriceText(c: Complex, withArea = false): string | null {
  if (c.rep_area_m2 != null) {
    if (c.area_prices === undefined) return null;
    const s = areaRangeSummary(c.area_prices.find((ap) => ap.area_m2 === c.rep_area_m2));
    return `${withArea ? `${c.rep_area_m2}㎡ ` : ""}${s.value}${countSuffix(s)}`;
  }
  if (c.price_basis === "legacy_mixed") {
    const t = legacyRangeTexts(c.legacy_range);
    return t ? `${t.value} (${t.note})` : null;
  }
  return null;
}

/** 옛 값 단지(price_basis "legacy_mixed") 큰 값 + 작은 줄 (사장님 결정 ㄱ 2026-10-25 · 작은 줄 10-31 결정) */
export interface LegacyRangeTexts {
  value: string;
  note: string;
}

/** legacy_range 칸이 응답에 없으면(undefined — 옛 응답·직접 조회) null = 그리지 않는다 */
export function legacyRangeTexts(legacy: Complex["legacy_range"]): LegacyRangeTexts | null {
  if (legacy === undefined) return null;
  if (legacy === null || (legacy.lower == null && legacy.upper == null)) return { value: "—", note: "최근 거래 없음" };
  const lower = legacy.lower ?? legacy.upper!;
  const upper = legacy.upper ?? legacy.lower!;
  const m = /^(\d{4})(\d{2})$/.exec(legacy.month ?? "");
  const when = m ? `${m[1]}년 ${Number(m[2])}월 거래 · ` : "";
  return { value: rangeText(lower, upper), note: `${when}면적 섞임 · 직거래 포함 · 그 뒤 거래 없음` };
}
