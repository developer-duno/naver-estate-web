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

/** 가격 포맷 (만원 → 억/만원) */
export function formatKoreanPrice(manwon: number | undefined | null): string {
  if (manwon == null || manwon === 0) return "-";
  if (manwon >= 10000) {
    const eok = Math.floor(manwon / 10000);
    const rest = manwon % 10000;
    return rest > 0 ? `${eok}억 ${rest.toLocaleString()}만` : `${eok}억`;
  }
  return `${manwon.toLocaleString()}만`;
}

/** 관리비 표시 (문자열 또는 숫자 → "N만원") */
export function formatMaintenanceCost(cost?: string | null, numericCost?: number | null): string {
  if (cost) return cost.includes("만") ? cost : `${cost}만원`;
  if (numericCost != null) return `${numericCost}만원`;
  return "-";
}
