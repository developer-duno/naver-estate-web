import type { Complex } from "@/types";

/** 거래유형별 매물 수 → "매매 12·전세 5" 보조 텍스트. 전부 0이면 빈 문자열 */
export function tradeTypeSummary(tc: Complex["trade_type_counts"]): string {
  if (!tc) return "";
  return (["매매", "전세", "월세", "단기임대"] as const)
    .filter((t) => tc[t] > 0)
    .map((t) => `${t} ${tc[t]}`)
    .join("·");
}
