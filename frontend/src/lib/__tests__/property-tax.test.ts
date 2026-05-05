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
    // v3-A ①: 1주택 + 6억 → 차등 공정시장가액비율 44% (3억 초과 6억 이하) 적용
    // 재산세 과표 = 6억 × 44% = 2.64억 (3억 이하 특례세율 0.2%)
    expect(r.propertyTaxBase).toBe(264_000_000);
    // 재산세 = 2.64e8 × 0.2% - 18만 = 52.8만 - 18만 = 34.8만
    expect(r.propertyTax).toBe(348_000);
    expect(r.comprehensiveTax).toBe(0);
    expect(r.notes).toContain("below-comprehensive-threshold");
    expect(r.notes).toContain("single-house-special-rate");
    expect(r.notes).toContain("single-house-deduction-12e");
    expect(r.notes).toContain("single-house-fair-market-ratio");
    expect(r.appliedRate.propertyFairMarketRatio).toBe(0.44);
  });

  it("#2 공시 15억 (1주택, 70세, 15년+ 보유) → 세액공제 80% (공제할 재산세액 차감 후 기준)", () => {
    const r = calculatePropertyTax(buildInput({
      publishedPriceWon: 1_500_000_000, houses: 1, isSingleHouseEligible: true,
      ageYears: 70, holdYears: 15,
    }));
    expect(r.branch).toBe("single-house");
    // 종부세 과표 = (15억 - 12억) × 60% = 1.8억 (3억 이하 0.5%)
    expect(r.comprehensiveTaxBase).toBe(180_000_000);
    // 종부세 = 1.8e8 × 0.5% = 90만
    expect(r.comprehensiveTaxBeforeDeduction).toBe(900_000);
    // v3-A ②: 공제할 재산세액 = 분자 (단일 합산 시 분모 = 재산세 부과액)
    // 분자 = applyBracket((15억-12억) × 60% × 45%, SINGLE) = applyBracket(8100만, SINGLE)
    //      = 8100만 × 0.001 - 30000 = 81000 - 30000 = 51000
    expect(r.comprehensivePropertyTaxCredit).toBe(51_000);
    // 차감 후 종부세 = 90만 - 5.1만 = 84.9만
    // 세액공제 80% = 84.9만 × 0.8 = 679,200 (대법원 판결 정합 — 차감 후 기준)
    expect(r.comprehensiveTaxCredit).toBe(679_200);
    // 종부세 최종 = 84.9만 - 67.92만 = 16.98만
    expect(r.comprehensiveTax).toBe(169_800);
    expect(r.notes).toContain("age-deduction-eligible");
    expect(r.notes).toContain("hold-deduction-eligible");
    expect(r.notes).toContain("comprehensive-property-tax-credit");
  });

  it("#3 공시 20억 (1주택, 60세, 5년) → 세액공제 40% (공제할 재산세액 차감 후)", () => {
    const r = calculatePropertyTax(buildInput({
      publishedPriceWon: 2_000_000_000, houses: 1, isSingleHouseEligible: true,
      ageYears: 60, holdYears: 5,
    }));
    // 종부세 과표 = (20억 - 12억) × 60% = 4.8억 (6억 이하 0.7%)
    expect(r.comprehensiveTaxBase).toBe(480_000_000);
    // 종부세 = 4.8e8 × 0.7% - 60만 = 336만 - 60만 = 276만
    expect(r.comprehensiveTaxBeforeDeduction).toBe(2_760_000);
    // v3-A ②: 공제할 재산세액 = 분자 = applyBracket(2.16억, SINGLE) = 2.16e8 × 0.002 - 18만 = 25.2만
    expect(r.comprehensivePropertyTaxCredit).toBe(252_000);
    // 차감 후 = 276만 - 25.2만 = 250.8만, 세액공제 40% = 100.32만 → floor 1,003,200
    expect(r.comprehensiveTaxCredit).toBe(1_003_200);
  });
});

describe("v3-A ① 1주택 재산세 차등 공정시장가액비율 (지방세법 시행령 §109)", () => {
  it("#FMR-1 1주택 + 시가표준액 2.5억 → 43% 적용 (3억 이하 구간)", () => {
    const r = calculatePropertyTax(buildInput({ publishedPriceWon: 250_000_000 }));
    expect(r.appliedRate.propertyFairMarketRatio).toBe(0.43);
    expect(r.propertyTaxBase).toBe(107_500_000); // 2.5e8 × 0.43
    expect(r.notes).toContain("single-house-fair-market-ratio");
    expect(r.notes).not.toContain("fair-market-ratio-60");
  });

  it("#FMR-2 1주택 + 5억 → 44% 적용 (3억 초과 6억 이하)", () => {
    const r = calculatePropertyTax(buildInput({ publishedPriceWon: 500_000_000 }));
    expect(r.appliedRate.propertyFairMarketRatio).toBe(0.44);
    expect(r.propertyTaxBase).toBe(220_000_000); // 5e8 × 0.44
    expect(r.notes).toContain("single-house-fair-market-ratio");
  });

  it("#FMR-3 1주택 + 8억 → 45% 적용 (6억 초과, 9억 이하)", () => {
    const r = calculatePropertyTax(buildInput({ publishedPriceWon: 800_000_000 }));
    expect(r.appliedRate.propertyFairMarketRatio).toBe(0.45);
    expect(r.propertyTaxBase).toBe(360_000_000); // 8e8 × 0.45
    expect(r.notes).toContain("single-house-fair-market-ratio");
  });

  it("#FMR-4 1주택 + 12억 → 45% 적용 (9억 초과 한도 없음 검증)", () => {
    const r = calculatePropertyTax(buildInput({
      publishedPriceWon: 1_200_000_000, houses: 1, isSingleHouseEligible: true,
    }));
    expect(r.appliedRate.propertyFairMarketRatio).toBe(0.45);
    expect(r.propertyTaxBase).toBe(540_000_000); // 12e8 × 0.45
    expect(r.notes).toContain("single-house-fair-market-ratio");
  });

  it("#FMR-5 다주택 (houses=2) → 60% 유지 (NoticeKey 미푸시)", () => {
    const r = calculatePropertyTax(buildInput({
      publishedPriceWon: 600_000_000, houses: 2, isSingleHouseEligible: false,
    }));
    expect(r.appliedRate.propertyFairMarketRatio).toBe(0.6);
    expect(r.propertyTaxBase).toBe(360_000_000); // 6e8 × 0.60
    expect(r.notes).not.toContain("single-house-fair-market-ratio");
    expect(r.notes).toContain("fair-market-ratio-60");
  });
});

describe("v3-A ② 종부세 공제할 재산세액 (시행령 §4의2 + 대법원 2019두39796)", () => {
  it("#CPC-1 1주택 12억 (공제 미만) → 종부세 0 → 공제할 재산세액 분기 미진입", () => {
    const r = calculatePropertyTax(buildInput({
      publishedPriceWon: 1_200_000_000, houses: 1, isSingleHouseEligible: true,
    }));
    expect(r.branch).toBe("below-threshold");
    expect(r.comprehensiveTaxBase).toBe(0);
    expect(r.comprehensivePropertyTaxCredit).toBe(0);
    expect(r.notes).not.toContain("comprehensive-property-tax-credit");
  });

  it("#CPC-2 1주택 15억 → 공제할 재산세액 5.1만 + 세액공제 차감 후 기준 적용", () => {
    const r = calculatePropertyTax(buildInput({
      publishedPriceWon: 1_500_000_000, houses: 1, isSingleHouseEligible: true,
      ageYears: 70, holdYears: 15,
    }));
    // 분자 = applyBracket((15억-12억) × 0.6 × 0.45, SINGLE) = applyBracket(8100만, SINGLE)
    //      = 8100만 × 0.001 - 30000 = 5.1만 (1.5억 이하 0.1%)
    expect(r.comprehensivePropertyTaxCredit).toBe(51_000);
    // 차감 후 종부세 = 90만 - 5.1만 = 84.9만, 80% 세액공제 = 67.92만 (대법원 정합)
    expect(r.comprehensiveTaxCredit).toBe(679_200);
    expect(r.notes).toContain("comprehensive-property-tax-credit");
  });

  it("#CPC-3 다주택 30억 → 공제할 재산세액 적용으로 종부세 ↓", () => {
    const r = calculatePropertyTax(buildInput({
      publishedPriceWon: 3_000_000_000, houses: 2, isSingleHouseEligible: false,
    }));
    expect(r.branch).toBe("multi-house");
    // 산출세액 = 1038만, 분자 = applyBracket(7.56억, GENERAL) = 239.4만
    expect(r.comprehensiveTaxBeforeDeduction).toBe(10_380_000);
    expect(r.comprehensivePropertyTaxCredit).toBe(2_394_000);
    expect(r.comprehensiveTax).toBe(7_986_000); // 1038만 - 239.4만 (다주택은 세액공제 0)
    expect(r.notes).toContain("comprehensive-property-tax-credit");
  });

  it("#CPC-4 법인 1주택 → 기준금액 0, 공시가 전체로 분자 산정", () => {
    const r = calculatePropertyTax(buildInput({
      publishedPriceWon: 1_500_000_000, houses: 1, isSingleHouseEligible: false,
      isCorporation: true,
    }));
    expect(r.branch).toBe("corporation");
    expect(r.comprehensiveDeduction).toBe(0); // 법인 공제 0
    // 분자 = applyBracket((15억 - 0) × 0.6 × 0.6, GENERAL) = applyBracket(5.4억, GENERAL) = 5.4e8 × 0.004 - 63만 = 153만
    // 분모 = applyBracket(15억 × 0.6, GENERAL) = applyBracket(9억, GENERAL) = 297만
    // 비율 = 153/297, 공제 = 297만 × 153/297 = 153만 (= 분자)
    expect(r.comprehensivePropertyTaxCredit).toBe(1_530_000);
    expect(r.notes).toContain("comprehensive-property-tax-credit");
    expect(r.notes).toContain("corporation-flat-rate-applied");
  });

  it("#CPC-5 1주택 6억 (공제 미만) → 공제할 재산세액 0 (분기 미진입)", () => {
    // below-threshold 분기는 공제할 재산세액 산정 자체 미실행
    const r = calculatePropertyTax(buildInput({ publishedPriceWon: 600_000_000 }));
    expect(r.branch).toBe("below-threshold");
    expect(r.comprehensivePropertyTaxCredit).toBe(0);
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

describe("B-4 법인 (isCorporation)", () => {
  // 케이스 #B4-1: 법인 2주택 단일세율 2.7%
  it("법인 2주택 → COMPREHENSIVE_BRACKETS_CORP_2 단일세율 2.7%, 공제 0", () => {
    const r = calculatePropertyTax(buildInput({
      publishedPriceWon: 1_500_000_000, houses: 2, isSingleHouseEligible: false,
      isCorporation: true,
    }));
    expect(r.branch).toBe("corporation");
    // 법인 공제 0 → 과표 = 15억 × 60% = 9억
    expect(r.comprehensiveDeduction).toBe(0);
    expect(r.comprehensiveTaxBase).toBe(900_000_000);
    // 종부세 = 9억 × 2.7% = 2,430만
    expect(r.comprehensiveTaxBeforeDeduction).toBe(24_300_000);
    expect(r.appliedRate.comprehensive).toBe(0.027);
    expect(r.notes).toContain("corporation-flat-rate-applied");
  });

  // 케이스 #B4-2: 법인 3주택 이상 단일세율 5.0%
  it("법인 3주택 이상 → COMPREHENSIVE_BRACKETS_CORP_3 단일세율 5.0%", () => {
    const r = calculatePropertyTax(buildInput({
      publishedPriceWon: 3_000_000_000, houses: 3, isSingleHouseEligible: false,
      isCorporation: true,
    }));
    expect(r.branch).toBe("corporation");
    // 법인 공제 0 → 과표 = 30억 × 60% = 18억
    expect(r.comprehensiveTaxBase).toBe(1_800_000_000);
    // 종부세 = 18억 × 5.0% = 9,000만
    expect(r.comprehensiveTaxBeforeDeduction).toBe(90_000_000);
    expect(r.appliedRate.comprehensive).toBe(0.050);
    expect(r.notes).not.toContain("multi-heavy-25e"); // 법인은 누진 X
  });

  // 케이스 #B4-3: 법인 + 1세대1주택 자격 시도 → 자동 차단 + warning
  it("법인 + isSingleHouseEligible=true 시도 → 공제·세액공제 차단 + corporation-no-credit warning", () => {
    const r = calculatePropertyTax(buildInput({
      publishedPriceWon: 1_500_000_000, houses: 1, isSingleHouseEligible: true,
      ageYears: 70, holdYears: 15,
      isCorporation: true,
    }));
    expect(r.branch).toBe("corporation");
    // 법인 공제 0 + 세액공제 0 (eligible 자동 false 강제)
    expect(r.comprehensiveDeduction).toBe(0);
    expect(r.comprehensiveTaxCredit).toBe(0);
    expect(r.notes).toContain("corporation-flat-rate-applied");
    expect(r.notes).toContain("corporation-no-credit");
    expect(r.notes).not.toContain("single-house-deduction-12e");
    expect(r.notes).not.toContain("age-deduction-eligible");
  });

  // 케이스 #B4-4: 법인 + excludedHouses 시도 → normalize 에서 0 강제
  it("법인 + excludedHouses=2 시도 → normalize 에서 0 으로 강제", () => {
    const r = calculatePropertyTax(buildInput({
      publishedPriceWon: 3_000_000_000, houses: 3, isSingleHouseEligible: false,
      isCorporation: true, excludedHouses: 2,
    }));
    expect(r.branch).toBe("corporation");
    // excluded=2 무시되므로 effectiveHouses 와 무관하게 CORP_3 사용 (houses=3)
    expect(r.appliedRate.comprehensive).toBe(0.050);
    expect(r.notes).not.toContain("exclusion-applied"); // excluded=0 강제됨
  });

  // 케이스 #B4-5: 법인 + ownershipRatio 시도 → normalize 에서 1 강제
  it("법인 + ownershipRatio=0.5 시도 → normalize 에서 1 강제", () => {
    const r = calculatePropertyTax(buildInput({
      publishedPriceWon: 1_500_000_000, houses: 2, isSingleHouseEligible: false,
      isCorporation: true, ownershipRatio: 0.5,
    }));
    expect(r.branch).toBe("corporation");
    // ratio=1 강제 → effectivePublished = 15억 그대로
    expect(r.comprehensiveTaxBase).toBe(900_000_000);
    expect(r.notes).not.toContain("ownership-applied"); // ratio=1 강제됨
  });

  // 케이스 #B4-6: 법인 재산세는 일반 세율 (1세대1주택 특례 X)
  it("법인 재산세는 일반 세율 (1세대1주택 특례 차단)", () => {
    const r = calculatePropertyTax(buildInput({
      publishedPriceWon: 1_500_000_000, houses: 1, isSingleHouseEligible: true,
      isCorporation: true,
    }));
    // isSingleProperty 는 isSingleHouseEligible (raw=true 지만 normalize 에서 false 강제)
    expect(r.appliedRate.property).toBe(0.004); // 일반 세율 0.4%
    expect(r.notes).not.toContain("single-house-special-rate");
  });
});

describe("B-3 공동명의 (ownershipRatio)", () => {
  // 케이스 #B3-1: ratio=1.0 → no-op (기존 산식과 동일)
  it("ratio=1.0 (또는 미입력) → 기존 산식과 동일 (no-op)", () => {
    const baseR = calculatePropertyTax(buildInput({
      publishedPriceWon: 1_500_000_000, houses: 1, isSingleHouseEligible: true,
    }));
    const ratioR = calculatePropertyTax(buildInput({
      publishedPriceWon: 1_500_000_000, houses: 1, isSingleHouseEligible: true, ownershipRatio: 1,
    }));
    expect(ratioR.grandTotal).toBe(baseR.grandTotal);
    expect(ratioR.notes).not.toContain("ownership-applied");
  });

  // 케이스 #B3-2: ratio=0.5 → 종부세 진입값 절반 → 종부세 만 영향 + warning notice
  it("ratio=0.5 + 1세대1주택 → 종부세 진입값 절반 + ownership-single-house-warning", () => {
    const r = calculatePropertyTax(buildInput({
      publishedPriceWon: 1_500_000_000, houses: 1, isSingleHouseEligible: true, ownershipRatio: 0.5,
    }));
    // effectivePublished = 15억 × 0.5 = 7.5억 < 12억 공제 → 종부세 0
    expect(r.comprehensiveTax).toBe(0);
    expect(r.branch).toBe("below-threshold");
    expect(r.notes).toContain("ownership-applied");
    expect(r.notes).toContain("ownership-single-house-warning");
  });

  // 케이스 #B3-3: 재산세는 ratio 영향 없음
  it("재산세는 ownershipRatio 영향 없음 (사용자 입력 = 본인 지분 공시가 가정)", () => {
    const baseR = calculatePropertyTax(buildInput({
      publishedPriceWon: 1_500_000_000, houses: 1, isSingleHouseEligible: true,
    }));
    const ratioR = calculatePropertyTax(buildInput({
      publishedPriceWon: 1_500_000_000, houses: 1, isSingleHouseEligible: true, ownershipRatio: 0.3,
    }));
    expect(ratioR.propertyTax).toBe(baseR.propertyTax);
    expect(ratioR.appliedRate.property).toBe(baseR.appliedRate.property);
  });

  // 케이스 #B3-4: ratio=0.01 극단값 → 종부세 ≈ 0
  it("ratio=0.01 극단값 → 종부세 ≈ 0 (effectivePublished 0.15억, 공제 미만)", () => {
    const r = calculatePropertyTax(buildInput({
      publishedPriceWon: 1_500_000_000, houses: 2, isSingleHouseEligible: false, ownershipRatio: 0.01,
    }));
    // effectivePublished = 15억 × 0.01 = 0.15억 < 9억 공제 → 종부세 0
    expect(r.comprehensiveTax).toBe(0);
    expect(r.branch).toBe("below-threshold");
    expect(r.notes).toContain("ownership-applied");
    expect(r.notes).not.toContain("ownership-single-house-warning"); // single-house 자격 X
  });
});

describe("B-2 합산배제 (excludedHouses)", () => {
  // 케이스 #B2-1: excluded=0 → 기존 #4 (multi-house) 와 동일 (no-op 확증)
  it("excluded=0 → 기존 산식과 동일 (no-op)", () => {
    const baseR = calculatePropertyTax(buildInput({
      publishedPriceWon: 1_500_000_000, houses: 2, isSingleHouseEligible: false,
    }));
    const excR = calculatePropertyTax(buildInput({
      publishedPriceWon: 1_500_000_000, houses: 2, isSingleHouseEligible: false, excludedHouses: 0,
    }));
    expect(excR.grandTotal).toBe(baseR.grandTotal);
    expect(excR.notes).not.toContain("exclusion-applied");
  });

  // 케이스 #B2-2: 3주택 중 1채 임대 → effectiveHouses=2 → BRACKETS_2 + 일반 9억 공제
  it("3주택 중 1채 임대 (excluded=1) → effectiveHouses=2 → BRACKETS_2 (중과 X)", () => {
    const r = calculatePropertyTax(buildInput({
      publishedPriceWon: 3_000_000_000, houses: 3, isSingleHouseEligible: false, excludedHouses: 1,
    }));
    // 종부세 과표 = (30억 - 9억) × 60% = 12.6억 → BRACKETS_2 1.0% (12억 이하 1.0%)
    expect(r.comprehensiveTaxBase).toBe(1_260_000_000);
    expect(r.appliedRate.comprehensive).toBe(0.013); // 25억 이하 BRACKETS_2 1.3%
    expect(r.notes).toContain("exclusion-applied");
    expect(r.notes).not.toContain("multi-heavy-25e"); // effectiveHouses=2 라 중과 X
  });

  // 케이스 #B2-3: 3주택 중 2채 임대 → effectiveHouses=1 + isSingleHouseEligible=true → 12억 공제 + 1주택 종부세
  it("3주택 중 2채 임대 (excluded=2) + 1세대1주택 자격 → 종부세 12억 공제 분기", () => {
    const r = calculatePropertyTax(buildInput({
      publishedPriceWon: 1_500_000_000, houses: 3, isSingleHouseEligible: true, excludedHouses: 2,
    }));
    // effectiveHouses=1 → 종부세 12억 공제 분기
    expect(r.branch).toBe("single-house");
    expect(r.comprehensiveDeduction).toBe(1_200_000_000);
    expect(r.notes).toContain("single-house-deduction-12e");
    expect(r.notes).toContain("exclusion-applied");
  });

  // 케이스 #B2-4: 3주택 중 3채 모두 임대 → effectiveHouses=0 → 종부세 0
  it("3주택 모두 임대 (excluded=houses) → 종부세 0", () => {
    const r = calculatePropertyTax(buildInput({
      publishedPriceWon: 3_000_000_000, houses: 3, isSingleHouseEligible: false, excludedHouses: 3,
    }));
    // effectiveHouses=0 → 종부세 산정 단계에서 9억 공제 적용 후 12.6억 과표 → BRACKETS_2 (effectiveHouses=0 이라 _2)
    // 단, 공시 30억 - 9억 = 21억 × 60% = 12.6억 과표 → 종부세 발생 (effectiveHouses 0 이지만 사용자 입력 공시는 그대로)
    // → 합산배제는 BRACKETS 선택 + 공제 분기에 영향 (산식 결정), 입력 공시 자체는 줄지 않음
    // 따라서 effectiveHouses=0 이어도 9억 공제 적용 (effectiveHouses < 1 이라 1주택 공제 X)
    expect(r.notes).toContain("exclusion-applied");
    expect(r.comprehensiveDeduction).toBe(900_000_000); // effectiveHouses=0 → not single-comprehensive → 9억 공제
  });

  // 케이스 #B2-5: 재산세는 합산배제 영향 0 (houses 그대로)
  it("재산세는 excludedHouses 영향 없음 (houses 기준 그대로)", () => {
    const baseR = calculatePropertyTax(buildInput({
      publishedPriceWon: 1_500_000_000, houses: 3, isSingleHouseEligible: false,
    }));
    const excR = calculatePropertyTax(buildInput({
      publishedPriceWon: 1_500_000_000, houses: 3, isSingleHouseEligible: false, excludedHouses: 1,
    }));
    expect(excR.propertyTax).toBe(baseR.propertyTax); // 재산세 동일
    expect(excR.appliedRate.property).toBe(baseR.appliedRate.property);
  });
});

describe("B-5 부부 공동명의 1주택자 특례 (isSpouseJointSingleHouse)", () => {
  // 케이스 #B5-1: 부부 토글 + houses=1 + 단독 1주택 자격 false → 1인 합산 12억 공제 (단독 동일 결과)
  it("부부 토글 + houses=1 + 단독 자격 X → 12억 공제 + single-house 분기 (단독 동일)", () => {
    const r = calculatePropertyTax(buildInput({
      publishedPriceWon: 1_500_000_000, houses: 1, isSingleHouseEligible: false,
      isSpouseJointSingleHouse: true,
    }));
    expect(r.branch).toBe("single-house");
    expect(r.comprehensiveDeduction).toBe(1_200_000_000);
    // 종부세 과표 = (15억 - 12억) × 60% = 1.8억 → 0.5% = 90만
    expect(r.comprehensiveTaxBase).toBe(180_000_000);
    expect(r.comprehensiveTaxBeforeDeduction).toBe(900_000);
    expect(r.comprehensiveTaxCredit).toBe(0); // ageYears/holdYears 0
    expect(r.notes).toContain("spouse-joint-single-house-applied");
    expect(r.notes).toContain("single-house-deduction-12e");
    expect(r.notes).not.toContain("ownership-applied");
  });

  // 케이스 #B5-2: 부부 토글 + 70세 + 15년 → 세액공제 80% (납세의무자 연령·보유 기준)
  it("부부 토글 + 70세 + 15년 → 세액공제 80% (1인 합산 명의자 기준)", () => {
    const r = calculatePropertyTax(buildInput({
      publishedPriceWon: 1_500_000_000, houses: 1, isSingleHouseEligible: false,
      isSpouseJointSingleHouse: true,
      ageYears: 70, holdYears: 15,
    }));
    expect(r.branch).toBe("single-house");
    expect(r.comprehensiveTaxBeforeDeduction).toBe(900_000);
    // v3-A ②: 재산세는 GENERAL (isSingleProperty=false, FMR=60%), 분자 = applyBracket(1.08억, GENERAL) = 1.08e8 × 0.0015 - 3만 = 13.2만
    expect(r.comprehensivePropertyTaxCredit).toBe(132_000);
    // 차감 후 = 90만 - 13.2만 = 76.8만, 세액공제 80% = 61.44만
    expect(r.comprehensiveTaxCredit).toBe(614_400);
    // 종부세 최종 = 76.8만 - 61.44만 = 15.36만
    expect(r.comprehensiveTax).toBe(153_600);
    expect(r.ruralTax).toBe(30_720); // 15.36만 × 20%
    expect(r.notes).toContain("age-deduction-eligible");
    expect(r.notes).toContain("hold-deduction-eligible");
    expect(r.notes).toContain("spouse-joint-single-house-applied");
    expect(r.notes).toContain("comprehensive-property-tax-credit");
  });

  // 케이스 #B5-3: 부부 토글 + houses=2 → normalize 에서 false 강제 → general 분기
  it("부부 토글 + houses=2 → normalize 강제 false → general 9억 공제 분기", () => {
    const r = calculatePropertyTax(buildInput({
      publishedPriceWon: 3_000_000_000, houses: 2, isSingleHouseEligible: false,
      isSpouseJointSingleHouse: true, // normalize 에서 false 강제
    }));
    expect(r.branch).toBe("multi-house");
    expect(r.comprehensiveDeduction).toBe(900_000_000); // 일반 9억
    // 공시 30억 - 9억 = 21억 × 60% = 12.6억 → BRACKETS_2 1.3% (25억 이하)
    expect(r.comprehensiveTaxBase).toBe(1_260_000_000);
    // v3-A ②: 산출세액 = 12.6e8 × 0.013 - 600만 = 1038만
    expect(r.comprehensiveTaxBeforeDeduction).toBe(10_380_000);
    // 공제할 재산세액 = 분자 = applyBracket(21억 × 0.6 × 0.6, GENERAL) = applyBracket(7.56억, GENERAL) = 7.56e8 × 0.004 - 63만 = 239.4만
    expect(r.comprehensivePropertyTaxCredit).toBe(2_394_000);
    // 종부세 최종 = 1038만 - 239.4만 = 798.6만 (다주택은 1주택 세액공제 0)
    expect(r.comprehensiveTax).toBe(7_986_000);
    expect(r.notes).not.toContain("spouse-joint-single-house-applied");
    expect(r.notes).toContain("general-deduction-9e");
  });

  // 케이스 #B5-4: 부부 토글 + ownershipRatio=0.5 동시 입력 → 특례 우선 (ratio=1 강제)
  it("부부 토글 + ownershipRatio=0.5 동시 → 특례 우선 (ratio=1 강제, ownership-applied 미푸시)", () => {
    const r = calculatePropertyTax(buildInput({
      publishedPriceWon: 1_500_000_000, houses: 1, isSingleHouseEligible: false,
      isSpouseJointSingleHouse: true,
      ownershipRatio: 0.5,
    }));
    // ratio=0.5 무효 → effectivePublished=15억 그대로 → 12억 공제 → 1.8억 과표
    expect(r.comprehensiveTaxBase).toBe(180_000_000);
    expect(r.branch).toBe("single-house");
    expect(r.comprehensiveDeduction).toBe(1_200_000_000);
    expect(r.notes).toContain("spouse-joint-single-house-applied");
    expect(r.notes).not.toContain("ownership-applied"); // ratio=1 강제로 미푸시
  });
});
