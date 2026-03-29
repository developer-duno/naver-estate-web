/**
 * 미분양 단지 비교 유틸리티 — 우위 판정 로직
 */
import type { MbApartment } from "@/types";

export type AdvantageDir = "higher" | "lower" | null;

export interface MbCompareRow {
  label: string;
  getValue: (apt: MbApartment) => string | number | null | undefined;
  direction: AdvantageDir;
}

export const MB_COMPARE_ROWS: MbCompareRow[] = [
  { label: "단지명", getValue: (a) => a.name, direction: null },
  { label: "지역", getValue: (a) => [a.region, a.gu].filter(Boolean).join(" "), direction: null },
  { label: "세대수", getValue: (a) => a.units, direction: "higher" },
  { label: "미분양", getValue: (a) => a.unsold, direction: "lower" },
  { label: "미분양률(%)", getValue: (a) => a.unsold_rate, direction: "lower" },
  { label: "입주시기", getValue: (a) => a.presale_move_in ?? a.completion, direction: null },
  { label: "분양가 최저(만원)", getValue: (a) => a.presale_min_price, direction: "lower" },
  { label: "분양가 최고(만원)", getValue: (a) => a.presale_max_price, direction: "lower" },
  { label: "평당가(만원)", getValue: (a) => a.presale_pp, direction: "lower" },
  { label: "주차비율(%)", getValue: (a) => a.parking_ratio, direction: "higher" },
  { label: "최고층", getValue: (a) => a.max_floor, direction: "higher" },
  { label: "용적률(%)", getValue: (a) => a.floor_area_ratio, direction: "lower" },
  { label: "난방", getValue: (a) => a.heating, direction: null },
  { label: "시공사", getValue: (a) => a.builder, direction: null },
  { label: "할인율(%)", getValue: (a) => a.discount_pct, direction: "higher" },
  { label: "주변 중위가(만원)", getValue: (a) => a.naver_nearby_median, direction: "higher" },
  { label: "전세가율(%)", getValue: (a) => a.naver_jeonse_rate, direction: "higher" },
];

/** 숫자 배열에서 우위 인덱스 반환 (direction별) */
export function getBestIndices(
  values: (number | null | undefined)[],
  direction: AdvantageDir,
): number[] {
  if (!direction) return [];
  const nums = values.map((v) => (typeof v === "number" ? v : null));
  const valid = nums.filter((v): v is number => v !== null);
  if (valid.length === 0) return [];
  const best = direction === "higher" ? Math.max(...valid) : Math.min(...valid);
  return nums.reduce<number[]>((acc, v, i) => {
    if (v === best) acc.push(i);
    return acc;
  }, []);
}

/** 셀 표시용 포맷 */
export function formatCellValue(val: string | number | null | undefined): string {
  if (val == null) return "-";
  if (typeof val === "number") return val.toLocaleString();
  return val || "-";
}
