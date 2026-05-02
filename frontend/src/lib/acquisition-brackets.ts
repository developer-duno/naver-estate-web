/**
 * 취득세 요율표 + 헬퍼 함수 (지방세법 제11조 + 시행령 + 농특세법, 2026 기준).
 * 표준세율: 1주택 매매. 중과세율: 다주택 조정대상지역.
 * 농특세: 1주택 면적 ≤85m² 비과세. 교육세: 표준 시 baseTax×10%, 중과 시 매매가×4%×10%.
 *
 * 위택스 도메인 검증값 (acquisition-tax.test.ts witax-cases) 으로 박제 정확성 보장.
 */

import type { AcquisitionInput } from "./acquisition-types";
import { NATIONAL_HOUSING_AREA_M2 } from "./acquisition-types";

// 200만원 = 2,000,000원 (생애최초 본세 감면 한도, 지방세특례제한법 제36조의3)
export const 감면액_원 = 2_000_000;

// 다주택 중과 시 교육세 산출 기준 (고정 4%)
const HEAVY_EDU_BASE_RATE = 0.04;

/**
 * 표준세율 (1주택 매매, 지방세법 제11조 제1항 제8호).
 * 6억 이하: 1%. 6~9억: 보간 (amountWon × 2/3억 - 3) / 100. 9억 초과: 3%.
 */
export function 표준세율(amountWon: number): number {
  if (amountWon <= 600_000_000) return 0.01;
  if (amountWon <= 900_000_000) {
    // 보간: (amountWon × 2 / 3억 - 3) ÷ 100
    return (amountWon * 2 / 300_000_000 - 3) / 100;
  }
  return 0.03;
}

/**
 * 중과세율 (다주택 조정대상지역, 지방세법 제13조의2).
 * 1주택: 0 (표준). 2주택 조정: 8%, 비조정: 0 (표준 fallback).
 * 3주택+: 조정 12%, 비조정 8%.
 */
export function 중과세율(houses: 1 | 2 | 3, isRegulatedArea: boolean): number {
  if (houses === 1) return 0;
  if (houses === 2) return isRegulatedArea ? 0.08 : 0;
  return isRegulatedArea ? 0.12 : 0.08;
}

/**
 * 농특세율 (농특세법 제5조 + 농특세법 시행령 제4조).
 * standard 1주택 + 면적 ≤85m²: 0 (비과세). standard 1주택 + 면적 >85m²: 0.2%.
 * multi-house 8%: 0.6%, 12%: 1.0% (면적 무관).
 * officetel: 0.2% 고정.
 */
export function 농특세율(rate: number, area_m2: number, branch: "standard" | "multi-house" | "officetel"): number {
  if (branch === "officetel") return 0.002;
  if (branch === "multi-house") {
    if (rate >= 0.12) return 0.01;
    if (rate >= 0.08) return 0.006;
    return 0.002;
  }
  // standard
  if (area_m2 > 0 && area_m2 <= NATIONAL_HOUSING_AREA_M2) return 0;
  return 0.002;
}

/**
 * 교육세율 (지방세법 제151조 — 본세의 10%).
 * 표준 시: baseTax × 10% (= amountWon × 표준세율 × 10%).
 * 중과 시: amountWon × 4% × 10% = amountWon × 0.4% (고정 산출 기준).
 */
export function 교육세율(rate: number): number {
  // 중과 (8%, 12%) 시 교육세 산출 기준은 4% 고정
  if (rate >= 0.08) return HEAVY_EDU_BASE_RATE * 0.1;
  // 표준 / 오피스텔(4%) 시 baseTax × 10% = amountWon × rate × 10%
  return rate * 0.1;
}

/**
 * 생애최초 감면 가능 여부 (지방세특례제한법 제36조의3, 2026 기준).
 * 무주택 (houses=1, isFirstTime=true) + 12억 이하 + propertyType=house.
 * 12억 초과는 진입점에서 first-time-rejected 처리하므로 여기선 ≤12억 가정.
 */
export function 생애최초가능(input: AcquisitionInput): boolean {
  return input.isFirstTime
    && input.houses === 1
    && input.propertyType === "house"
    && input.amountWon > 0
    && input.amountWon <= 1_200_000_000;
}
