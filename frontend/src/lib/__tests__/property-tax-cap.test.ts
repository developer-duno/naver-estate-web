/**
 * 보유세 세부담 상한 150% 자동 cap 테스트 (B-1a).
 * 권위 출처: 지방세법 §122.
 *
 * 케이스 설계:
 * - prevYearTax 미입력 → cap 미적용, wasCapped=false, notes 에 "tax-burden-cap-150" (기존 노란불 유지)
 * - prevYearTax 0 또는 음수 → cap 미적용 (가드 발동)
 * - prevYearTax 입력 + grandTotal > cap → cap 발동, wasCapped=true, notes 에 "tax-burden-cap-applied"
 * - prevYearTax 입력 + grandTotal ≤ cap → cap 미발동(원본 유지), wasCapped=false, notes 에 "tax-burden-cap-applied" (cap 산식은 활성, 단지 발동 안 함)
 * - below-threshold 분기에서도 cap 작동 (재산세만 있는 케이스)
 */

import { describe, it, expect } from "vitest";
import { calculatePropertyTax } from "@/lib/property-tax";
import type { PropertyTaxInput } from "@/lib/property-tax-types";

function buildInput(over: Partial<PropertyTaxInput>): PropertyTaxInput {
  return {
    publishedPriceWon: 1_500_000_000, // 1세대1주택 12억 초과 케이스 (종부세 발생)
    houses: 1,
    isSingleHouseEligible: true,
    ageYears: 0,
    holdYears: 0,
    ...over,
  };
}

describe("세부담 상한 150% cap — prevYearTax 미입력/0/음수", () => {
  it("prevYearTax 미입력 → cap 미적용, wasCapped=false, 노란불 유지", () => {
    const r = calculatePropertyTax(buildInput({}));
    expect(r.wasCapped).toBe(false);
    expect(r.grandTotal).toBe(r.uncappedGrandTotal);
    expect(r.notes).toContain("tax-burden-cap-150");
    expect(r.notes).not.toContain("tax-burden-cap-applied");
  });

  it("prevYearTax 0 → cap 미적용 (가드)", () => {
    const r = calculatePropertyTax(buildInput({ prevYearTax: 0 }));
    expect(r.wasCapped).toBe(false);
    expect(r.grandTotal).toBe(r.uncappedGrandTotal);
    expect(r.notes).toContain("tax-burden-cap-150");
  });

  it("prevYearTax 음수 → cap 미적용 (가드)", () => {
    const r = calculatePropertyTax(buildInput({ prevYearTax: -1_000_000 }));
    expect(r.wasCapped).toBe(false);
    expect(r.grandTotal).toBe(r.uncappedGrandTotal);
  });
});

describe("세부담 상한 150% cap — 발동 케이스", () => {
  it("prevYearTax 1만원 → cap 1.5만원, grandTotal 훨씬 큼 → cap 발동", () => {
    const r = calculatePropertyTax(buildInput({ prevYearTax: 10_000 }));
    expect(r.wasCapped).toBe(true);
    expect(r.grandTotal).toBe(15_000); // 10_000 * 1.5
    expect(r.uncappedGrandTotal).toBeGreaterThan(15_000); // 원본은 훨씬 큼
    expect(r.notes).toContain("tax-burden-cap-applied");
    expect(r.notes).not.toContain("tax-burden-cap-150");
  });

  it("prevYearTax 입력 + grandTotal ≤ cap → wasCapped=false (cap 발동 안 함)", () => {
    // 원본이 작은 케이스 (공시 1억 = 종부세 0, 재산세만)
    const r = calculatePropertyTax(buildInput({
      publishedPriceWon: 100_000_000,
      prevYearTax: 10_000_000_000, // cap = 150억 (말도 안 되게 큼)
    }));
    expect(r.wasCapped).toBe(false);
    expect(r.grandTotal).toBe(r.uncappedGrandTotal);
    // cap 산식은 활성화되어 있으므로 "applied" 노트
    expect(r.notes).toContain("tax-burden-cap-applied");
  });
});

describe("세부담 상한 150% cap — below-threshold 분기", () => {
  it("종부세 0 분기 (공시 1억) 에서도 prevYearTax cap 작동", () => {
    // 공시 1억 → 1세대1주택 종부세 공제 12억 미만 → 재산세만, branch=below-threshold
    const propertyOnly = calculatePropertyTax(buildInput({ publishedPriceWon: 100_000_000 }));
    expect(propertyOnly.branch).toBe("below-threshold");
    const naturalTax = propertyOnly.grandTotal;

    const capped = calculatePropertyTax(buildInput({
      publishedPriceWon: 100_000_000,
      prevYearTax: 1, // cap = 1.5원, 무조건 발동
    }));
    expect(capped.branch).toBe("below-threshold");
    expect(capped.wasCapped).toBe(true);
    expect(capped.grandTotal).toBe(1); // Math.floor(1 * 1.5) = 1
    expect(capped.uncappedGrandTotal).toBe(naturalTax);
  });
});

describe("세부담 상한 150% cap — uncappedGrandTotal 보존", () => {
  it("cap 발동 시 uncappedGrandTotal 은 원본을 보존한다", () => {
    const r = calculatePropertyTax(buildInput({ prevYearTax: 100_000 }));
    expect(r.wasCapped).toBe(true);
    expect(r.grandTotal).toBe(150_000);
    // uncapped 는 cap 무관하게 원래 산식 결과
    expect(r.uncappedGrandTotal).toBe(r.totalTax + r.ruralTax);
  });
});
