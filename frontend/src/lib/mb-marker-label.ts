import type { MbApartment } from "@/types";
import { formatChartPrice } from "@/lib/format";
import { normalizePp } from "@/lib/mb-format";

/** 지도 마커에 표시할 종류 — 탭/세그먼트별로 다른 핵심 지표를 보여준다.
 * presale=민간/공공 분양(분양가), competition=분양결과(경쟁률), unsold=미분양(미분양 호수). */
export type MarkerKind = "presale" | "competition" | "unsold";

/**
 * 호갱노노식 마커 라벨 — 탭별로 가장 의미 있는 수치를 짧게.
 * 실측 채움률(세션 318): unsold 88% / competition_rate 62% / presale_min_price 33% / presale_pp 20%.
 * 채움률이 낮은 분양가 대비 폴백 체인 명시 — 값 없으면 단지명(빈 말풍선 금지).
 *
 * - presale: 분양가(억) → 평당가(N만) → 단지명
 * - competition: 경쟁률(N:1) → 단지명
 * - unsold: 미분양 N → 단지명
 */
export function markerLabel(apt: MbApartment, kind: MarkerKind): string {
  if (kind === "presale") {
    if (apt.presale_min_price != null && apt.presale_min_price > 0) {
      return formatChartPrice(apt.presale_min_price);
    }
    const pp = normalizePp(apt.presale_pp);
    if (pp != null) return `평당${pp.toLocaleString()}만`;
    return apt.name;
  }
  if (kind === "competition") {
    if (apt.competition_rate != null && apt.competition_rate > 0) {
      return `${apt.competition_rate.toLocaleString()}:1`;
    }
    return apt.name;
  }
  // unsold
  if (apt.unsold != null && apt.unsold > 0) {
    return `미분양${apt.unsold.toLocaleString()}`;
  }
  return apt.name;
}
