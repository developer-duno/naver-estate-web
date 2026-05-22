/** 미분양 분양가 표 house_type 한글 라벨 매핑 */

const HOUSE_TYPE_LABELS: Record<string, string> = {
  presale_min: "최저가형",
  presale_max: "최고가형",
  standard: "표준형",
  premium: "프리미엄",
};

/** 알려진 키는 한글로, 모르는 값은 원본 그대로 반환 (raw 노출 방지가 목표지만 미지 키는 정보 손실보다 노출이 나음) */
export function formatHouseType(v?: string | null): string {
  if (!v) return "-";
  return HOUSE_TYPE_LABELS[v] ?? v;
}
