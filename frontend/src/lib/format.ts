/** 날짜/가격 포맷 유틸리티 */

/** YYYYMMDD → YYYY.MM.DD */
export function formatDateFull(d: string | undefined | null): string {
  if (!d) return "-";
  if (d.length === 8) return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6)}`;
  return d;
}

/** YYYYMMDD → YY.MM.DD */
export function formatDateShort(d: string | undefined | null): string {
  if (!d) return "-";
  if (d.length === 8) return `${d.slice(2, 4)}.${d.slice(4, 6)}.${d.slice(6)}`;
  return d;
}

/**
 * 만원 단위 금액을 억/만으로 분해해 문자열로 조립한다 (0/null 가드는 호출부 책임).
 * - sep: 억과 만 사이 구분자 ("억 5,000만" vs "억5,000만")
 * - manSuffix: 만 단위 접미사 ("만" vs "만원")
 * - eokSuffix: 정확히 N억일 때 접미사 ("억" vs "억원")
 */
function splitEokMan(
  manwon: number,
  opts: { sep: string; manSuffix: string; eokSuffix: string },
): string {
  if (manwon >= 10000) {
    const eok = Math.floor(manwon / 10000);
    const rest = manwon % 10000;
    return rest > 0
      ? `${eok}억${opts.sep}${rest.toLocaleString()}${opts.manSuffix}`
      : `${eok}${opts.eokSuffix}`;
  }
  return `${manwon.toLocaleString()}${opts.manSuffix}`;
}

/** 가격 포맷 (만원 → 억/만원) */
export function formatKoreanPrice(manwon: number | undefined | null): string {
  if (manwon == null || manwon === 0) return "-";
  return splitEokMan(manwon, { sep: " ", manSuffix: "만", eokSuffix: "억" });
}

/** 차트용 가격 포맷 (만원 → 억/만, 공백 없는 축약형) */
export function formatChartPrice(value: number): string {
  if (value == null || isNaN(value)) return "-";
  return splitEokMan(value, { sep: "", manSuffix: "만", eokSuffix: "억" });
}

/** 차트용 월 포맷 (YYYYMM → YY.MM) */
export function formatChartMonth(ym: string): string {
  if (!ym || ym.length < 6) return ym;
  return `${ym.slice(2, 4)}.${ym.slice(4, 6)}`;
}

/** 완공·입주월 포맷 (YYYYMM → YYYY.MM, YYYYMMDD → YYYY.MM.DD, 그 외 원본 반환) */
export function formatYearMonth(v?: string | null): string | null {
  if (!v) return null;
  if (v.length === 6) return `${v.slice(0, 4)}.${v.slice(4, 6)}`;
  if (v.length === 8) return `${v.slice(0, 4)}.${v.slice(4, 6)}.${v.slice(6)}`;
  return v;
}

/** 차트 기간 필터 cutoff 계산 (N개월 전 → YYYYMM) */
export function getCutoffMonth(monthsBack: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - monthsBack);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** 차트 기간 옵션 */
export type PeriodKey = "6M" | "1Y" | "2Y" | "ALL";
export const CHART_PERIODS: { key: PeriodKey; label: string; months: number | null }[] = [
  { key: "6M", label: "6개월", months: 6 },
  { key: "1Y", label: "1년", months: 12 },
  { key: "2Y", label: "2년", months: 24 },
  { key: "ALL", label: "전체", months: null },
];

/** 원 단위 → 만원/억원 변환 (세금·수수료 등) */
export function formatWon(value?: string | null): string {
  if (!value) return "-";
  const num = parseFloat(value);
  if (isNaN(num) || num < 0) return "-";
  if (num === 0) return "0원";
  const manwon = Math.round(num / 10000);
  return splitEokMan(manwon, { sep: " ", manSuffix: "만원", eokSuffix: "억원" });
}

/** 관리비 표시 (문자열 또는 숫자 → "N만원") */
export function formatMaintenanceCost(cost?: string | null, numericCost?: number | null): string {
  if (cost) return cost.includes("만") ? cost : `${cost}만원`;
  if (numericCost != null) return `${numericCost}만원`;
  return "-";
}
