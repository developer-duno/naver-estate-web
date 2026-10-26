/**
 * 소비자 단지 화면(세션 482 PR 1b) 표시 글자 — 순수 함수(DOM·네트워크 0).
 *
 * 이 단지 값은 범위(최저~최고)로만 보인다 — 중위(price_median)는 여기서 쓰지 않는다(사장님 결정, feedback_no_median).
 * 공시가율 분모도 범위(최고·최저)다. 지역 통계(부동산원) 중위 매매가는 예외.
 */
import { formatKoreanPrice } from "@/lib/format";
import type { AreaPrice, OfficialPriceItem } from "@/types";

/** "1억 5,700만~1억 8,000만" — 같으면 하나. spaced=true 면 물결 양옆에 공백 */
export function priceRangeText(min: number, max: number, spaced = false): string {
  if (min === max) return formatKoreanPrice(min);
  return `${formatKoreanPrice(min)}${spaced ? " ~ " : "~"}${formatKoreanPrice(max)}`;
}

/** 범위가 있는 면적 묶음인가 */
export function hasRange(ap: AreaPrice | undefined | null): ap is AreaPrice & { price_min: number; price_max: number } {
  return !!ap && ap.price_min != null && ap.price_max != null;
}

/** 범위 재료가 된 거래 수 — 거래 목록이 있으면 중개거래만 센다(범위가 직거래를 뺀 값이므로), 비면 저장된 거래 수 */
export function brokeredCount(ap: AreaPrice): number {
  const trades = ap.trades ?? [];
  if (trades.length > 0) return trades.filter((t) => !t.direct).length;
  return ap.trade_count ?? 0;
}

/**
 * 부제의 건수 글자 — 거래 목록이 있으면 "중개거래 N건"(직거래를 뺀 수), 비면 "거래 N건"
 * (저장된 거래 수는 직거래가 섞였을 수 있어 "중개거래"라 부르지 않는다 — 보완 F7)
 */
export function tradeCountText(ap: AreaPrice): string {
  return (ap.trades ?? []).length > 0 ? `중개거래 ${brokeredCount(ap)}건` : `거래 ${brokeredCount(ap)}건`;
}

/** 주제 조사 — 끝 글자에 받침이 있으면 "은", 없으면 "는"(한글이 아니면 "는"). "유성구는"·"이 단지 지역은" */
export function topicParticle(word: string): "은" | "는" {
  const code = word.trim().charCodeAt(word.trim().length - 1);
  if (!(code >= 0xac00 && code <= 0xd7a3)) return "는";
  return (code - 0xac00) % 28 !== 0 ? "은" : "는";
}

/** 대출 카드·머리 요약의 집값 단계(결정 12) — 6개월 범위 → 2년 범위 → 직접 입력 */
export type PriceStage =
  | { kind: "6m"; min: number; max: number }
  | { kind: "2y"; min: number; max: number }
  | { kind: "manual" };

export function priceStage(
  ap: AreaPrice | undefined | null,
  twoYear: { min: number; max: number } | null | undefined,
): PriceStage {
  if (hasRange(ap)) return { kind: "6m", min: ap.price_min, max: ap.price_max };
  if (twoYear && twoYear.min > 0 && twoYear.max > 0) return { kind: "2y", min: twoYear.min, max: twoYear.max };
  return { kind: "manual" };
}

/** 오피스텔(비주택)인가 — 유형 코드 OPST·OBYG, 코드가 없으면 유형 이름으로 */
export function isOfficetel(c: { real_estate_type_code?: string | null; real_estate_type_name?: string | null }): boolean {
  if (c.real_estate_type_code) return c.real_estate_type_code === "OPST" || c.real_estate_type_code === "OBYG";
  return (c.real_estate_type_name ?? "").startsWith("오피스텔");
}

/** 선택 면적 ±1㎡ 안에서 가장 가까운 공시가격 평형(없으면 null) */
export function officialForArea(items: OfficialPriceItem[], area: number): OfficialPriceItem | null {
  let best: OfficialPriceItem | null = null;
  for (const it of items) {
    const d = Math.abs(it.prvuse_ar - area);
    if (d > 1) continue;
    if (best == null || d < Math.abs(best.prvuse_ar - area)) best = it;
  }
  return best;
}

/** 면적을 모를 때 대표 공시가격 = 호수가 가장 많은 평형(동률이면 앞 — BE 가 면적 오름차순으로 준다) */
export function representativeOfficial(items: OfficialPriceItem[]): OfficialPriceItem | null {
  let best: OfficialPriceItem | null = null;
  for (const it of items) if (best == null || it.ho_count > best.ho_count) best = it;
  return best;
}

/** 원 → 만원(반올림) */
export function wonToManwon(won: number): number {
  return Math.round(won / 10_000);
}

/** "실거래의 63~72%" — 분모 = 최고(앞)·최저(뒤). 공시가 원 단위, 범위 만원 단위 */
export function officialRatioText(officialWon: number, min: number, max: number): string | null {
  if (!(min > 0) || !(max > 0)) return null;
  const official = officialWon / 10_000;
  const lo = Math.round((official / max) * 100);
  const hi = Math.round((official / min) * 100);
  return lo === hi ? `실거래의 ${lo}%` : `실거래의 ${lo}~${hi}%`;
}

/** 세대당 관리비(원) → "약 19만 원"(10만 원 미만은 소수 1자리) */
export function kaptCostText(won: number | null | undefined): string | null {
  if (won == null || !(won > 0)) return null;
  const man = won / 10_000;
  const v = man >= 10 ? Math.round(man) : Math.round(man * 10) / 10;
  return `약 ${v.toLocaleString()}만 원`;
}

/** "202607" → "2026.07" */
export function ymDot(ym: string | null | undefined): string | null {
  if (!ym || !/^\d{6}/.test(ym)) return null;
  return `${ym.slice(0, 4)}.${ym.slice(4, 6)}`;
}

/** "202411" → "24.11" */
export function ymShort(ym: string): string {
  return `${ym.slice(2, 4)}.${ym.slice(4, 6)}`;
}

/** 오늘(현지) 달 "YYYYMM" — 시험은 밖에서 넣는다 */
export function currentYm(now: Date = new Date()): string {
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** endYm 까지 n개 달(오름차순) */
export function monthsEndingAt(endYm: string, n = 24): string[] {
  const end = Number(endYm.slice(0, 4)) * 12 + Number(endYm.slice(4, 6)) - 1;
  const out: string[] = [];
  for (let t = end - n + 1; t <= end; t++) {
    out.push(`${Math.floor(t / 12)}${String((t % 12) + 1).padStart(2, "0")}`);
  }
  return out;
}

/** 54325 → "5만 4,325명" */
export function peopleText(n: number): string {
  if (n < 10_000) return `${n.toLocaleString()}명`;
  const man = Math.floor(n / 10_000);
  const rest = n % 10_000;
  return rest > 0 ? `${man.toLocaleString()}만 ${rest.toLocaleString()}명` : `${man.toLocaleString()}만 명`;
}

/** "2026-06-10" → "2026.06.10"(없으면 null) */
export function dateDot(d: string | null | undefined): string | null {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  return d.replace(/-/g, ".");
}
