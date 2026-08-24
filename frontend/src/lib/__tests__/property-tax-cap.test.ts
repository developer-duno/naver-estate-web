/**
 * 보유세 세부담 상한 자동 cap 테스트 (B-1a, 세션 384 근본수정).
 * 권위 출처: 종합부동산세법 §10(종부세 150%) + 지방세법 §110③(재산세 과세표준상한 5%).
 *
 * 세션 384 재검증 결과: 지방세법 §122 는 2023.3.14 개정으로 "주택의 경우 적용하지 아니한다"는
 * 단서가 신설돼 주택 재산세에는 적용되지 않는다(150% cap 은 종부세법 §10 소관, 종부세+농특세
 * 몫에만 적용). 재산세의 실제 상한은 §110③ 과세표준상한제(연 5%, 전년도 "과세표준" 기준) —
 * 옛 105/110/130% 구간표는 같은 개정으로 완전히 삭제됨.
 *
 * 케이스 설계:
 * - prevYearComprehensiveTax 미입력 → 종부세 cap 미적용, notes 에 "tax-burden-cap-150"
 * - prevYearComprehensiveTax 입력 + (종부세+농특세) > cap → cap 발동 (재산세는 별도, 영향 없음)
 * - prevYearPropertyTaxBase 미입력 → 재산세 cap 미적용, notes 에 "property-tax-base-cap-not-input"
 * - prevYearPropertyTaxBase 입력 + 재산세 과세표준 > cap → cap 발동 (세율 곱하기 전 단계)
 * - below-threshold 분기(종부세 0)에서는 재산세 5% cap 만 유효, 종부세 150% cap 은 대상 자체가 없음
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

describe("종부세 세부담 상한 150% cap (종부세법 §10) — 미입력/0/음수", () => {
  it("prevYearComprehensiveTax 미입력 → cap 미적용, notes 에 tax-burden-cap-150", () => {
    const r = calculatePropertyTax(buildInput({}));
    expect(r.notes).toContain("tax-burden-cap-150");
    expect(r.notes).not.toContain("tax-burden-cap-applied");
    // grandTotal = 재산세(cap 미입력, 원본) + 종부세+농특세(cap 미입력, 원본)
    expect(r.grandTotal).toBe(r.uncappedGrandTotal);
  });

  it("prevYearComprehensiveTax 0 → cap 미적용 (가드)", () => {
    const r = calculatePropertyTax(buildInput({ prevYearComprehensiveTax: 0 }));
    expect(r.notes).toContain("tax-burden-cap-150");
    expect(r.grandTotal).toBe(r.uncappedGrandTotal);
  });

  it("prevYearComprehensiveTax 음수 → cap 미적용 (가드)", () => {
    const r = calculatePropertyTax(buildInput({ prevYearComprehensiveTax: -1_000_000 }));
    expect(r.grandTotal).toBe(r.uncappedGrandTotal);
  });
});

describe("종부세 세부담 상한 150% cap — 발동 케이스 (재산세는 영향 없음)", () => {
  it("prevYearComprehensiveTax 1만원 → 종부세+농특세만 1.5만원으로 cap, 재산세는 그대로 더해짐", () => {
    const r = calculatePropertyTax(buildInput({ prevYearComprehensiveTax: 10_000 }));
    expect(r.notes).toContain("tax-burden-cap-applied");
    expect(r.notes).not.toContain("tax-burden-cap-150");
    // grandTotal = propertyTax(원본) + min(comprehensiveTax+ruralTax, 15_000)
    expect(r.grandTotal).toBe(r.propertyTax + 15_000);
    expect(r.uncappedGrandTotal).toBeGreaterThan(r.grandTotal); // 원본은 cap 전이라 더 큼
  });

  it("prevYearComprehensiveTax 입력 + (종부세+농특세) ≤ cap → cap 발동 안 함", () => {
    const r = calculatePropertyTax(buildInput({
      prevYearComprehensiveTax: 100_000_000_000, // cap = 1500억 (말도 안 되게 큼 — 절대 발동 안 함)
    }));
    expect(r.grandTotal).toBe(r.uncappedGrandTotal);
    expect(r.notes).toContain("tax-burden-cap-applied"); // cap 산식은 활성, 단지 미발동
  });
});

describe("재산세 과세표준상한 5% cap (지방세법 §110③) — 미입력/0/음수", () => {
  it("prevYearPropertyTaxBase 미입력 → cap 미적용, notes 에 property-tax-base-cap-not-input", () => {
    const r = calculatePropertyTax(buildInput({}));
    expect(r.notes).toContain("property-tax-base-cap-not-input");
    expect(r.notes).not.toContain("property-tax-base-cap-applied");
  });

  it("prevYearPropertyTaxBase 0 → cap 미적용 (가드)", () => {
    const r = calculatePropertyTax(buildInput({ prevYearPropertyTaxBase: 0 }));
    expect(r.notes).toContain("property-tax-base-cap-not-input");
  });
});

describe("재산세 과세표준상한 5% cap — 발동 케이스", () => {
  it("prevYearPropertyTaxBase 낮게 입력 → 재산세 과세표준이 105% 로 제한되고 그 값에 세율 적용", () => {
    // 공시 15억, 1주택, FMR=45%(6억 초과) → rawPropertyTaxBase = 15e8 × 0.45 = 6.75억
    // 전년도 과세표준을 1억으로 입력 → cap = 1억 × 1.05 = 1.05억 (6.75억보다 훨씬 작음 → cap 발동)
    const r = calculatePropertyTax(buildInput({ prevYearPropertyTaxBase: 100_000_000 }));
    expect(r.notes).toContain("property-tax-base-cap-applied");
    expect(r.notes).not.toContain("property-tax-base-cap-not-input");
    expect(r.propertyTaxBase).toBe(105_000_000); // floor(1e8 × 1.05)
    // 공시 15억(9억 초과) → §111의2 특례세율 게이트 밖이라 GENERAL 세율 적용(SINGLE 아님)
    // 1.05억 → GENERAL 1.5억 이하 구간 0.15% - 3만
    expect(r.propertyTax).toBe(127_500); // floor(105_000_000 × 0.0015 - 30_000)
  });

  it("prevYearPropertyTaxBase 입력 + 당해 과세표준 ≤ cap → cap 발동 안 함(원본 그대로)", () => {
    const r = calculatePropertyTax(buildInput({
      prevYearPropertyTaxBase: 100_000_000_000, // cap = 1050억 (말도 안 되게 큼)
    }));
    expect(r.notes).toContain("property-tax-base-cap-applied");
    expect(r.propertyTaxBase).toBe(675_000_000); // floor(15e8 × 0.45), 원본 그대로
  });
});

describe("below-threshold 분기 (종부세 0) — 재산세 5% cap 만 유효, 종부세 150% cap 은 대상 없음", () => {
  it("공시 1억 (종부세 0) — prevYearPropertyTaxBase 미입력 시 재산세 그대로", () => {
    const r = calculatePropertyTax(buildInput({ publishedPriceWon: 100_000_000 }));
    expect(r.branch).toBe("below-threshold");
    expect(r.grandTotal).toBe(r.propertyTax);
    expect(r.notes).toContain("property-tax-base-cap-not-input");
  });

  it("공시 1억 (종부세 0) — prevYearPropertyTaxBase 낮게 입력 시 재산세 과세표준 cap 발동", () => {
    const r = calculatePropertyTax(buildInput({
      publishedPriceWon: 100_000_000,
      prevYearPropertyTaxBase: 1, // cap = floor(1 × 1.05) = 1원, 무조건 발동
    }));
    expect(r.branch).toBe("below-threshold");
    expect(r.wasCapped).toBe(true);
    expect(r.propertyTaxBase).toBe(1);
    expect(r.grandTotal).toBe(r.propertyTax);
  });

  it("공시 1억 (종부세 0) — prevYearComprehensiveTax 를 입력해도 영향 없음 (종부세가 0이라 cap 대상 자체가 없음)", () => {
    const withoutComp = calculatePropertyTax(buildInput({ publishedPriceWon: 100_000_000 }));
    const withComp = calculatePropertyTax(buildInput({
      publishedPriceWon: 100_000_000,
      prevYearComprehensiveTax: 1,
    }));
    expect(withComp.branch).toBe("below-threshold");
    expect(withComp.grandTotal).toBe(withoutComp.grandTotal); // 재산세만 있으므로 종부세 cap 무관
  });
});

describe("uncappedGrandTotal 보존", () => {
  it("cap 발동 시에도 uncappedGrandTotal 은 원본 산식 결과를 보존한다", () => {
    const r = calculatePropertyTax(buildInput({ prevYearComprehensiveTax: 100_000 }));
    expect(r.uncappedGrandTotal).toBe(r.propertyTax + r.comprehensiveTax + r.ruralTax);
  });
});
