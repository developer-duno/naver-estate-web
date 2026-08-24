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
    // 9억 초과 1주택 → 재산세 GENERAL 세율 (§111의2 특례는 9억 이하 한정, 세션 292 결함 수정)
    // 세션 384 근본수정: 분자·분모는 표준세율(누진공제 미차감, applyStandardRate) 적용
    // (elitelaw.kr/23 계산례 "구간세율 미적용·표준세율만" 재확인 — 옛 applyBracket 은 결함).
    // 분자 = applyStandardRate((15억-12억) × 60% × 45%, GENERAL) = 8100만 × 0.004 = 324,000
    // 재산세 부과액 = applyBracket(6.75억, GENERAL) = 6.75e8 × 0.004 - 63만 = 207만
    // 분모 = applyStandardRate(15억 × 45%, GENERAL) = 6.75억 × 0.004 = 270만
    // 공제 = floor(207만 × 324000/2700000) = floor(2070000 × 0.12) = 93,150
    expect(r.comprehensivePropertyTaxCredit).toBe(93_150);
    // 차감 후 종부세 = 90만 - 9.315만 = 80.685만 = 806,850
    // 세액공제 80% = 806,850 × 0.8 = 645,480 (대법원 판결 정합 — 차감 후 기준)
    expect(r.comprehensiveTaxCredit).toBe(645_480);
    // 종부세 최종 = 806,850 - 645,480 = 161,370
    expect(r.comprehensiveTax).toBe(161_370);
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
    // 9억 초과 1주택 → 재산세 GENERAL 세율 (§111의2 특례는 9억 이하 한정, 세션 292 결함 수정)
    // 세션 384 근본수정: 표준세율(applyStandardRate) 적용, 445,500 (옛 applyBracket 값 360,000 은 결함)
    expect(r.comprehensivePropertyTaxCredit).toBe(445_500);
    // 차감 후 = 276만 - 44.55만 = 231.45만, 세액공제 40% = floor(2314500×0.4) = 925,800
    expect(r.comprehensiveTaxCredit).toBe(925_800);
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

// 결함 수정 (세션 292): §111의2 특례세율(SINGLE)은 "시가표준액 9억원 이하 한정"
// (지방세법 시행령 §110의2①). FMR(§109 차등 공정시장가액비율)은 9억 초과도 45% 적용이라
// 두 법령의 9억 게이트가 다르므로 brackets 선택에만 게이트 적용. 9억 초과 1주택은 일반세율.
describe("v3-A ①-b 1주택 재산세 특례세율 9억 게이트 (지방세법 §111의2)", () => {
  it("1주택 공시 8억 (9억 이하) → SINGLE 특례세율 + 안내 노출 + FMR 45%", () => {
    const r = calculatePropertyTax(buildInput({
      publishedPriceWon: 800_000_000, houses: 1, isSingleHouseEligible: true,
    }));
    expect(r.appliedRate.propertyFairMarketRatio).toBe(0.45); // FMR 6억 초과 45%
    // 과표 = 8억 × 45% = 3.6억 → SINGLE 3억 초과 0.35%: 3.6e8 × 0.0035 - 63만 = 63만
    expect(r.propertyTax).toBe(630_000);
    expect(r.appliedRate.property).toBe(0.0035); // SINGLE 특례세율
    expect(r.notes).toContain("single-house-special-rate");
  });

  it("1주택 공시 12억 (9억 초과) → 일반세율(GENERAL) + 특례 안내 미노출, FMR은 45% 유지", () => {
    const r = calculatePropertyTax(buildInput({
      publishedPriceWon: 1_200_000_000, houses: 1, isSingleHouseEligible: true,
    }));
    // FMR(§109)은 9억 초과도 45% 유지 (게이트 없음) — 불변
    expect(r.appliedRate.propertyFairMarketRatio).toBe(0.45);
    // 과표 = 12억 × 45% = 5.4억 → GENERAL 3억 초과 0.4%: 5.4e8 × 0.004 - 63만 = 153만
    // (결함 시: SINGLE 0.35% = 126만 → 27만 과소산정이었음)
    expect(r.propertyTax).toBe(1_530_000);
    expect(r.appliedRate.property).toBe(0.004); // GENERAL 일반세율 (특례 아님)
    expect(r.notes).not.toContain("single-house-special-rate");
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
    // 9억 초과 1주택 → 재산세 GENERAL 세율 (§111의2 특례는 9억 이하 한정, 세션 292 결함 수정)
    // 세션 384 근본수정: 표준세율(applyStandardRate) 적용 — #2 와 동일 입력, 동일 재계산 근거 참조
    expect(r.comprehensivePropertyTaxCredit).toBe(93_150);
    // 차감 후 종부세 = 90만 - 9.315만 = 80.685만, 80% 세액공제 = 645,480 (대법원 정합)
    expect(r.comprehensiveTaxCredit).toBe(645_480);
    expect(r.notes).toContain("comprehensive-property-tax-credit");
  });

  it("#CPC-3 다주택 30억 → 공제할 재산세액 적용으로 종부세 ↓", () => {
    const r = calculatePropertyTax(buildInput({
      publishedPriceWon: 3_000_000_000, houses: 2, isSingleHouseEligible: false,
    }));
    expect(r.branch).toBe("multi-house");
    // 산출세액 = 1038만
    expect(r.comprehensiveTaxBeforeDeduction).toBe(10_380_000);
    // 세션 384 근본수정: 분자·분모 표준세율(applyStandardRate, 누진공제 미차감) 적용
    // 재산세 부과액 = applyBracket(18억×0.6, GENERAL) = 6.57e8×0.004-63만 = 657만
    // 분자 = applyStandardRate((30억-9억)×0.6×0.6, GENERAL) = 7.56e8×0.004 = 3,024,000
    // 분모 = applyStandardRate(30억×0.6, GENERAL) = 18e8×0.004 = 7,200,000
    // 공제 = floor(657만 × 3024000/7200000) = floor(6570000×0.42) = 2,759,400
    expect(r.comprehensivePropertyTaxCredit).toBe(2_759_400);
    expect(r.comprehensiveTax).toBe(7_620_600); // 1038만 - 275.94만 (다주택은 세액공제 0)
    expect(r.notes).toContain("comprehensive-property-tax-credit");
  });

  it("#CPC-4 법인 1주택 → 기준금액 0, 공시가 전체로 분자 산정", () => {
    const r = calculatePropertyTax(buildInput({
      publishedPriceWon: 1_500_000_000, houses: 1, isSingleHouseEligible: false,
      isCorporation: true,
    }));
    expect(r.branch).toBe("corporation");
    expect(r.comprehensiveDeduction).toBe(0); // 법인 공제 0
    // 세션 384 근본수정: 표준세율(applyStandardRate) 적용
    // 재산세 부과액 = applyBracket(9억, GENERAL) = 9e8×0.004-63만 = 297만
    // 분자 = applyStandardRate((15억-0)×0.6×0.6, GENERAL) = 5.4e8×0.004 = 2,160,000
    // 분모 = applyStandardRate(15억×0.6, GENERAL) = 9e8×0.004 = 3,600,000
    // 공제 = floor(297만 × 2160000/3600000) = floor(2970000×0.6) = 1,782,000
    expect(r.comprehensivePropertyTaxCredit).toBe(1_782_000);
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
    // 세션 384 근본수정: 표준세율(applyStandardRate) 적용, 재산세는 GENERAL(isSingleProperty=false, FMR=60%)
    // 재산세 부과액 = applyBracket(9억, GENERAL) = 297만
    // 분자 = applyStandardRate((15억-12억)×0.6×0.6, GENERAL) = 1.08e8×0.004 = 432,000
    // 분모 = applyStandardRate(15억×0.6, GENERAL) = 9e8×0.004 = 3,600,000
    // 공제 = floor(297만 × 432000/3600000) = floor(2970000×0.12) = 133,650
    expect(r.comprehensivePropertyTaxCredit).toBe(133_650);
    // 차감 후 = 90만 - 13.365만 = 76.635만, 세액공제 80% = floor(766350×0.8) = 613,080
    expect(r.comprehensiveTaxCredit).toBe(613_080);
    // 종부세 최종 = 766,350 - 613,080 = 153,270
    expect(r.comprehensiveTax).toBe(153_270);
    expect(r.ruralTax).toBe(30_654); // floor(153270 × 20%)
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
    // 세션 384 근본수정: 표준세율(applyStandardRate) 적용 — #CPC-3 과 동일 입력(30억, 9억 공제, FMR 60%)
    // 재산세 부과액 = applyBracket(18억, GENERAL) = 657만, 분자 = applyStandardRate(7.56억,GENERAL) = 3,024,000
    // 분모 = applyStandardRate(18억, GENERAL) = 7,200,000 → 공제 = floor(657만×3024000/7200000) = 2,759,400
    expect(r.comprehensivePropertyTaxCredit).toBe(2_759_400);
    // 종부세 최종 = 1038만 - 275.94만 = 762.06만 (다주택은 1주택 세액공제 0)
    expect(r.comprehensiveTax).toBe(7_620_600);
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

describe("법인 9종 일반 누진세율 특례 (CorporationGeneralRateCategory, PDF #14, 세션 111)", () => {
  // 케이스 #CGR-1: 카테고리 ① + houses=1 + 공시 30억 → BRACKETS_2 + 공제 9억
  it("카테고리 ① (public-charity-other) + houses=1 + 공시 30억 → BRACKETS_2, 공제 9억", () => {
    const r = calculatePropertyTax(buildInput({
      publishedPriceWon: 3_000_000_000, houses: 1, isSingleHouseEligible: false,
      isCorporation: true, corporationGeneralRateCategory: "public-charity-other",
    }));
    expect(r.branch).toBe("corporation");
    // 일반 누진세율 적용 → 공제 9억
    expect(r.comprehensiveDeduction).toBe(900_000_000);
    // 과표 = (30억 - 9억) × 60% = 12.6억
    expect(r.comprehensiveTaxBase).toBe(1_260_000_000);
    // BRACKETS_2 25억 이하 1.3% - 600만 = 12.6억 × 0.013 - 6_000_000 = 16,380,000 - 6,000,000 = 10,380,000
    expect(r.comprehensiveTaxBeforeDeduction).toBe(10_380_000);
    expect(r.appliedRate.comprehensive).toBe(0.013);
    expect(r.notes).toContain("corporation-general-rate-applied");
    expect(r.notes).not.toContain("corporation-flat-rate-applied");
  });

  // 케이스 #CGR-2: 카테고리 ① + houses=3 → BRACKETS_3 (중과 누진)
  it("카테고리 ① + houses=3 → BRACKETS_3 (중과 누진 + multi-heavy-25e)", () => {
    const r = calculatePropertyTax(buildInput({
      publishedPriceWon: 3_000_000_000, houses: 3, isSingleHouseEligible: false,
      isCorporation: true, corporationGeneralRateCategory: "public-charity-other",
    }));
    expect(r.branch).toBe("corporation");
    expect(r.comprehensiveDeduction).toBe(900_000_000);
    expect(r.comprehensiveTaxBase).toBe(1_260_000_000);
    // BRACKETS_3 25억 이하 2.0% - 14,400,000 (누진공제) = 12.6억 × 0.02 - 14,400,000 = 25,200,000 - 14,400,000 = 10,800,000
    expect(r.comprehensiveTaxBeforeDeduction).toBe(10_800_000);
    expect(r.appliedRate.comprehensive).toBe(0.02);
    expect(r.notes).toContain("multi-heavy-25e"); // 카테고리 ① + effectiveHouses>=3
  });

  // 케이스 #CGR-3: 카테고리 ② + houses=3 → BRACKETS_2 일률 (중과 안 함)
  it("카테고리 ② (public-charity-direct) + houses=3 → BRACKETS_2 일률 (중과 안 함)", () => {
    const r = calculatePropertyTax(buildInput({
      publishedPriceWon: 3_000_000_000, houses: 3, isSingleHouseEligible: false,
      isCorporation: true, corporationGeneralRateCategory: "public-charity-direct",
    }));
    expect(r.branch).toBe("corporation");
    expect(r.comprehensiveDeduction).toBe(900_000_000);
    expect(r.comprehensiveTaxBase).toBe(1_260_000_000);
    // BRACKETS_2 1.3% - 600만 = 10,380,000 (#CGR-1과 같은 산출세액)
    expect(r.comprehensiveTaxBeforeDeduction).toBe(10_380_000);
    expect(r.appliedRate.comprehensive).toBe(0.013);
    expect(r.notes).not.toContain("multi-heavy-25e"); // 카테고리 ②~⑨ BRACKETS_2 일률
  });

  // 케이스 #CGR-4: 카테고리 ⑨ (clan) + houses=3 → BRACKETS_2 일률
  it("카테고리 ⑨ (clan) + houses=3 → BRACKETS_2 일률 (#CGR-3과 동일 결과)", () => {
    const r = calculatePropertyTax(buildInput({
      publishedPriceWon: 3_000_000_000, houses: 3, isSingleHouseEligible: false,
      isCorporation: true, corporationGeneralRateCategory: "clan",
    }));
    expect(r.appliedRate.comprehensive).toBe(0.013);
    expect(r.comprehensiveTaxBeforeDeduction).toBe(10_380_000);
  });

  // 케이스 #CGR-5: 미선택 → 단일세율 회귀 (기존 동작 100% 보존)
  it("corporationGeneralRateCategory 미선택 (undefined) → 단일세율 2.7% 유지 (회귀)", () => {
    const r = calculatePropertyTax(buildInput({
      publishedPriceWon: 1_500_000_000, houses: 2, isSingleHouseEligible: false,
      isCorporation: true,
    }));
    expect(r.branch).toBe("corporation");
    expect(r.comprehensiveDeduction).toBe(0);
    expect(r.appliedRate.comprehensive).toBe(0.027);
    expect(r.notes).toContain("corporation-flat-rate-applied");
    expect(r.notes).not.toContain("corporation-general-rate-applied");
  });

  // 케이스 #CGR-6: 비법인 + 카테고리 입력 → normalize 자동 undefined → 일반 분기
  it("비법인 + corporationGeneralRateCategory='clan' → normalize 자동 undefined", () => {
    const r = calculatePropertyTax(buildInput({
      publishedPriceWon: 1_500_000_000, houses: 1, isSingleHouseEligible: true,
      isCorporation: false, corporationGeneralRateCategory: "clan",
    }));
    expect(r.branch).toBe("single-house"); // 일반 1세대1주택 분기
    expect(r.notes).not.toContain("corporation-general-rate-applied");
    expect(r.notes).not.toContain("corporation-flat-rate-applied");
  });

  // 케이스 #CGR-7: 카테고리 ③ + 합산배제 1주택 (3주택 중 1) → effectiveHouses=2, BRACKETS_2 일률
  it("카테고리 ③ (public-housing) + houses=3 + excludedHouses=1 → effectiveHouses=2 + BRACKETS_2", () => {
    const r = calculatePropertyTax(buildInput({
      publishedPriceWon: 3_000_000_000, houses: 3, isSingleHouseEligible: false,
      isCorporation: true, corporationGeneralRateCategory: "public-housing", excludedHouses: 1,
    }));
    expect(r.branch).toBe("corporation");
    // 합산배제 1 → effectiveHouses=2 → BRACKETS_2 (카테고리 ③은 어차피 일률 BRACKETS_2)
    expect(r.notes).toContain("exclusion-applied"); // 카테고리 ②~⑨ 일반세율 신청 시 합산배제 양립 가능
    expect(r.appliedRate.comprehensive).toBe(0.013); // BRACKETS_2 1.3%
  });

  // 케이스 #CGR-8: 카테고리 ① + isSingleHouseEligible=true → 12억 공제 차단 (법인 1세대1주택 자격 없음)
  it("카테고리 ① + isSingleHouseEligible=true 시도 → 9억 공제 (12억 차단), 세액공제 0", () => {
    const r = calculatePropertyTax(buildInput({
      publishedPriceWon: 3_000_000_000, houses: 1, isSingleHouseEligible: true,
      ageYears: 70, holdYears: 15,
      isCorporation: true, corporationGeneralRateCategory: "public-charity-other",
    }));
    expect(r.branch).toBe("corporation");
    // normalize 에서 isSingleHouseEligible=false 강제 → 일반 누진세율 신청은 9억 공제 (12억 X)
    expect(r.comprehensiveDeduction).toBe(900_000_000);
    expect(r.comprehensiveTaxCredit).toBe(0); // 법인 세액공제 0
    expect(r.notes).toContain("corporation-no-credit"); // 1주택 자격 시도 → 차단 안내
    expect(r.notes).toContain("corporation-general-rate-applied");
  });
});

// ──────────────────────────────────────────────────────────────────────
// PDF #16 보유기간 계산 특례 (세션 115)
// ──────────────────────────────────────────────────────────────────────
describe("calculatePropertyTax — PDF #16 보유기간 계산 특례 (세션 115)", () => {
  // 공통 1주택 + 보유 5+ 입력 (공시가 15억)
  const buildHoldInput = (over: Partial<PropertyTaxInput>) => buildInput({
    publishedPriceWon: 1_500_000_000, houses: 1, isSingleHouseEligible: true,
    ageYears: 0, holdYears: 10,
    ...over,
  });

  it("PDF #16 mode='none' → eligible 안내만, planned/applied/precision-warn 미push", () => {
    const r = calculatePropertyTax(buildHoldInput({ holdPeriodSpecialMode: "none" }));
    expect(r.notes).toContain("hold-deduction-eligible");
    expect(r.notes).toContain("hold-period-special-eligible");
    expect(r.notes).not.toContain("hold-period-special-planned");
    expect(r.notes).not.toContain("hold-period-special-applied");
    expect(r.notes).not.toContain("hold-period-precision-warn");
  });

  it("PDF #16 mode='planned' + 5+ + origYear → planned + precision-warn push", () => {
    const r = calculatePropertyTax(buildHoldInput({ holdPeriodSpecialMode: "planned", originalAcquisitionYear: 2010 }));
    expect(r.notes).toContain("hold-period-special-eligible");
    expect(r.notes).toContain("hold-period-special-planned");
    expect(r.notes).toContain("hold-period-precision-warn");
    expect(r.notes).not.toContain("hold-period-special-applied");
  });

  it("PDF #16 mode='applied' + 5+ + origYear → applied + precision-warn push", () => {
    const r = calculatePropertyTax(buildHoldInput({ holdPeriodSpecialMode: "applied", originalAcquisitionYear: 2008 }));
    expect(r.notes).toContain("hold-period-special-applied");
    expect(r.notes).toContain("hold-period-precision-warn");
    expect(r.notes).not.toContain("hold-period-special-planned");
  });

  it("PDF #16 mode='planned' + 5년 미만 → planned/precision-warn 모두 미push", () => {
    const r = calculatePropertyTax(buildHoldInput({ holdYears: 4, holdPeriodSpecialMode: "planned", originalAcquisitionYear: 2010 }));
    expect(r.notes).not.toContain("hold-deduction-eligible");
    expect(r.notes).not.toContain("hold-period-special-eligible");
    expect(r.notes).not.toContain("hold-period-special-planned");
    expect(r.notes).not.toContain("hold-period-precision-warn");
  });

  it("PDF #16 holdYears=14 (40% 마지막) → 40% 공제 적용", () => {
    const r = calculatePropertyTax(buildHoldInput({ holdYears: 14, holdPeriodSpecialMode: "none" }));
    expect(r.notes).toContain("hold-deduction-eligible");
    // holdDeductionRate(14) = 0.40 — 세액공제 효과 확증 (별도 단위 테스트 부재라 통합 가드)
    expect(r.comprehensiveTaxCredit).toBeGreaterThan(0);
  });

  it("PDF #16 외부 가드: mode='planned' 인데 origYear=0 → planned 미push (산식 단계 가드)", () => {
    const r = calculatePropertyTax(buildHoldInput({ holdPeriodSpecialMode: "planned", originalAcquisitionYear: 0 }));
    expect(r.notes).toContain("hold-period-special-eligible");
    expect(r.notes).not.toContain("hold-period-special-planned");
    expect(r.notes).not.toContain("hold-period-precision-warn");
  });
});
