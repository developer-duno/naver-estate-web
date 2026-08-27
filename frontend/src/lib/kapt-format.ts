/**
 * 공동주택 관리비(K-apt) 표시 문자열 포맷 (순수 함수 — DOM·네트워크 의존 0).
 *
 * ComplexBasicInfo 의 "월 관리비" 행 값을 만든다. subway-format.ts 와 같은 이유로 순수
 * 함수로 분리했다 — 원(won)→만원 환산 반올림 경계와 기준월 파싱을 컴포넌트 렌더 없이
 * 단위 테스트하기 위함.
 *
 * ⚠ 단위 주의: BE(K-apt 원본)는 **원** 단위로 내려주는데, 기존 매물 관리비 포맷터
 * `formatMaintenanceCost`(lib/format.ts)는 이미 **만원**으로 환산된 값을 받는다. 그래서
 * 그 함수를 그대로 재사용하지 않고, 여기서 원→만원 환산을 한 뒤 표기한다.
 */

/** 만원 미만 절사를 피하려고 소수 1자리까지 유지하되, 정수면 소수점을 뗀다. */
function manwonText(won: number): string {
  const manwon = won / 10_000;
  // 10만원 이상은 소수점이 의미 없어 반올림, 미만은 1자리 유지 (예: 8.5만원)
  const rounded = manwon >= 10 ? Math.round(manwon) : Math.round(manwon * 10) / 10;
  return `${rounded.toLocaleString()}만원`;
}

/**
 * 기준월 `YYYYMM` → `YYYY년 M월분`. 월은 앞의 0을 떼고 표시한다(2026년 3월분).
 * 형식이 어긋나면(길이·숫자 아님) null — 호출부가 기준월 표기를 생략한다.
 */
export function formatCostMonth(costMonth?: string | null): string | null {
  if (!costMonth || !/^\d{6}$/.test(costMonth)) return null;
  const year = costMonth.slice(0, 4);
  const month = Number(costMonth.slice(4, 6));
  if (month < 1 || month > 12) return null;
  return `${year}년 ${month}월분`;
}

/**
 * 세대당 관리비 표시 — `세대당 약 12만원 (2026년 3월분)`.
 *
 * "약"을 붙이는 이유: K-apt 원본이 단지 전체 관리비를 세대수로 나눈 평균이라 개별 세대
 * 청구액과 다르다. 값이 없거나(null) 0 이하면 null — 호출부가 행 자체를 생략한다.
 */
export function formatCostPerHousehold(
  costPerHousehold?: number | null,
  costMonth?: string | null,
): string | null {
  if (costPerHousehold == null || !(costPerHousehold > 0)) return null;
  const monthText = formatCostMonth(costMonth);
  return `세대당 약 ${manwonText(costPerHousehold)}${monthText ? ` (${monthText})` : ""}`;
}

/**
 * 총액 보조 텍스트 — `총 1억 2,000만원 · 공용 8,000만원 · 개별 4,000만원`.
 * 있는 항목만 이어 붙이고, 하나도 없으면 null (호출부가 보조 텍스트를 생략).
 */
export function formatCostBreakdown(kapt: {
  total_cost?: number | null;
  common_cost?: number | null;
  individual_cost?: number | null;
}): string | null {
  const parts: string[] = [];
  if (kapt.total_cost != null && kapt.total_cost > 0) parts.push(`총 ${manwonText(kapt.total_cost)}`);
  if (kapt.common_cost != null && kapt.common_cost > 0) parts.push(`공용 ${manwonText(kapt.common_cost)}`);
  if (kapt.individual_cost != null && kapt.individual_cost > 0)
    parts.push(`개별 ${manwonText(kapt.individual_cost)}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}
