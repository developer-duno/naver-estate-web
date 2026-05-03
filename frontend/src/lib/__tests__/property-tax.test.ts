/**
 * 보유세 계산기 통합 테스트.
 * 권위 출처: 국세청 종부세 PDF 16개 박제값 기반 손계산 결과와 대조.
 */

import { describe, it, expect } from "vitest";
import { calculatePropertyTax } from "@/lib/property-tax";
import type { PropertyTaxInput } from "@/lib/property-tax-types";

function buildInput(over: Partial<PropertyTaxInput>): PropertyTaxInput {
  return {
    publishedPriceWon: 0, houses: 1,
    isSingleHouseEligible: true,
    ageYears: 0, holdYears: 0,
    ...over,
  };
}

describe("calculatePropertyTax — 입력 검증", () => {
  it("공시가 0 → EMPTY (branch=empty)", () => {
    const r = calculatePropertyTax(buildInput({ publishedPriceWon: 0 }));
    expect(r.branch).toBe("empty");
    expect(r.grandTotal).toBe(0);
  });

  it("음수 → EMPTY", () => {
    const r = calculatePropertyTax(buildInput({ publishedPriceWon: -1000 }));
    expect(r.branch).toBe("empty");
  });

  it("Infinity → EMPTY (validateAmount 1조원 한도)", () => {
    const r = calculatePropertyTax(buildInput({ publishedPriceWon: Infinity }));
    expect(r.branch).toBe("empty");
  });
});

describe("1세대1주택 — 공제 12억 + 특례세율", () => {
  it("#1 공시 6억 (1주택, 60세 미만, 보유 0년) → 종부세 과표 0 (공제 미만)", () => {
    // 공시 6억 < 12억 공제 → 종부세 0, 재산세만
    const r = calculatePropertyTax(buildInput({ publishedPriceWon: 600_000_000 }));
    expect(r.branch).toBe("below-threshold");
    // 재산세 과표 = 6억 × 60% = 3.6억 (3억 초과, 특례세율 0.35%)
    expect(r.propertyTaxBase).toBe(360_000_000);
    // 재산세 = 3.6e8 × 0.35% - 63만 = 126만 - 63만 = 63만
    expect(r.propertyTax).toBe(630_000);
    expect(r.comprehensiveTax).toBe(0);
    expect(r.notes).toContain("below-comprehensive-threshold");
    expect(r.notes).toContain("single-house-special-rate");
    expect(r.notes).toContain("single-house-deduction-12e");
  });

  it("#2 공시 15억 (1주택, 70세, 15년+ 보유) → 세액공제 80% 적용", () => {
    const r = calculatePropertyTax(buildInput({
      publishedPriceWon: 1_500_000_000, houses: 1, isSingleHouseEligible: true,
      ageYears: 70, holdYears: 15,
    }));
    expect(r.branch).toBe("single-house");
    // 종부세 과표 = (15억 - 12억) × 60% = 1.8억 (3억 이하 0.5%)
    expect(r.comprehensiveTaxBase).toBe(180_000_000);
    // 종부세 = 1.8e8 × 0.5% = 90만
    expect(r.comprehensiveTaxBeforeDeduction).toBe(900_000);
    // 세액공제 80% = 72만 (40+50=90 → 80캡)
    expect(r.comprehensiveTaxCredit).toBe(720_000);
    expect(r.comprehensiveTax).toBe(180_000);
    expect(r.notes).toContain("age-deduction-eligible");
    expect(r.notes).toContain("hold-deduction-eligible");
  });

  it("#3 공시 20억 (1주택, 60세, 5년) → 세액공제 40% (20+20)", () => {
    const r = calculatePropertyTax(buildInput({
      publishedPriceWon: 2_000_000_000, houses: 1, isSingleHouseEligible: true,
      ageYears: 60, holdYears: 5,
    }));
    // 종부세 과표 = (20억 - 12억) × 60% = 4.8억 (6억 이하 0.7%)
    expect(r.comprehensiveTaxBase).toBe(480_000_000);
    // 종부세 = 4.8e8 × 0.7% - 60만 = 336만 - 60만 = 276만
    expect(r.comprehensiveTaxBeforeDeduction).toBe(2_760_000);
    // 세액공제 40% = 110.4만 → floor 1_104_000
    expect(r.comprehensiveTaxCredit).toBe(1_104_000);
  });
});

describe("일반(2주택+) — 공제 9억", () => {
  it("#4 공시 15억 (2주택, 1세대1주택 X) → 일반 공제 9억", () => {
    const r = calculatePropertyTax(buildInput({
      publishedPriceWon: 1_500_000_000, houses: 2, isSingleHouseEligible: false,
    }));
    expect(r.branch).toBe("multi-house");
    // 종부세 과표 = (15억 - 9억) × 60% = 3.6억 (6억 이하 0.7%)
    expect(r.comprehensiveTaxBase).toBe(360_000_000);
    // 종부세 = 3.6e8 × 0.7% - 60만 = 252만 - 60만 = 192만
    expect(r.comprehensiveTaxBeforeDeduction).toBe(1_920_000);
    expect(r.comprehensiveTaxCredit).toBe(0); // 1주택 아니므로 세액공제 없음
    expect(r.notes).toContain("general-deduction-9e");
    // 재산세는 일반 세율 (0.4% 구간)
    expect(r.appliedRate.property).toBe(0.004);
  });

  it("#5 공시 30억 (3주택, 일반) — 종부세 25억 이하 중과 분기 진입", () => {
    const r = calculatePropertyTax(buildInput({
      publishedPriceWon: 3_000_000_000, houses: 3, isSingleHouseEligible: false,
    }));
    // 종부세 과표 = (30억 - 9억) × 60% = 12.6억 (25억 이하 중과 2.0%)
    expect(r.comprehensiveTaxBase).toBe(1_260_000_000);
    // 종부세 = 12.6e8 × 2.0% - 1440만 = 2520만 - 1440만 = 1080만
    expect(r.comprehensiveTaxBeforeDeduction).toBe(10_800_000);
    expect(r.appliedRate.comprehensive).toBe(0.020);
    expect(r.notes).toContain("multi-heavy-25e");
  });
});

describe("농어촌특별세 + 합계", () => {
  it("종부세 발생 시 농특세 = 종부세 × 20%", () => {
    const r = calculatePropertyTax(buildInput({
      publishedPriceWon: 1_500_000_000, houses: 1, isSingleHouseEligible: true,
    }));
    expect(r.ruralTax).toBe(Math.floor(r.comprehensiveTax * 0.20));
    expect(r.grandTotal).toBe(r.totalTax + r.ruralTax);
  });

  it("종부세 0이면 농특세 0", () => {
    const r = calculatePropertyTax(buildInput({ publishedPriceWon: 600_000_000 }));
    expect(r.ruralTax).toBe(0);
    expect(r.grandTotal).toBe(r.propertyTax);
  });

  it("totalTax = propertyTax + comprehensiveTax (세액공제 후) 정의 일치", () => {
    const r = calculatePropertyTax(buildInput({
      publishedPriceWon: 2_000_000_000, houses: 1, isSingleHouseEligible: true,
      ageYears: 65, holdYears: 10,
    }));
    expect(r.totalTax).toBe(r.propertyTax + r.comprehensiveTax);
    expect(r.grandTotal).toBe(r.totalTax + r.ruralTax);
  });
});

describe("실효세율", () => {
  it("공시 대비 grandTotal 비율 = effectiveRate", () => {
    const r = calculatePropertyTax(buildInput({
      publishedPriceWon: 1_500_000_000, houses: 1, isSingleHouseEligible: true,
    }));
    expect(r.effectiveRate).toBeCloseTo(r.grandTotal / 1_500_000_000, 6);
    expect(r.effectiveRate).toBeGreaterThan(0);
    expect(r.effectiveRate).toBeLessThan(0.05); // 5% 미만 sanity
  });
});
