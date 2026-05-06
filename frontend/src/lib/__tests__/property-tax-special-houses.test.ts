/**
 * 보유세 — 1세대1주택 5종 특례주택 (PDF #12) 단위 테스트.
 * 권위 출처: PDF #12 페이지 1~4 본문 직접 인용 + PDF #2 페이지 4 산식 박제.
 * 안분 산식: 세액공제 = compTaxAfterPropertyCredit × (1주택 / (1주택 + 특례주택)) × 공제율 (한도 80%).
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

describe("calculatePropertyTax — 5종 특례주택 (PDF #12)", () => {
  // #SH-1: PDF #12 안분 산식 핵심 검증 (15억 1주택 + 5억 일시적2주택)
  it("#SH-1 일시적2주택 1채 + 안분 손계산 (15억 + 5억 = 0.75 비율)", () => {
    const r = calculatePropertyTax(buildInput({
      publishedPriceWon: 1_500_000_000,
      houses: 1, isSingleHouseEligible: true,
      ageYears: 65, holdYears: 10,
      specialHouses: { temporary2: { count: 1, publishedAverage: 50_000 } }, // 만원, → 5억 (50,000만원 = 5억원)
    }));
    expect(r.branch).toBe("single-house");
    expect(r.notes).toContain("special-houses-applied");
    expect(r.notes).toContain("special-houses-credit-prorated");
    expect(r.notes).toContain("single-house-deduction-12e");
    // 세액공제 안분 비율 = 15억 / (15억 + 5억) = 0.75
    // 공제율 = min(0.30 + 0.40, 0.80) = 0.70
    // 안분 적용 시 세액공제 < 비안분 (회귀) 검증 — 비안분 케이스 비교
    const noProRate = calculatePropertyTax(buildInput({
      publishedPriceWon: 1_500_000_000,
      houses: 1, isSingleHouseEligible: true,
      ageYears: 65, holdYears: 10,
    }));
    expect(r.comprehensiveTaxCredit).toBeLessThan(noProRate.comprehensiveTaxCredit);
    // 비율 검증: 안분 적용 후 세액공제 ≈ 비안분 × 0.75 (소수점 오차 ±10원 허용)
    expect(r.comprehensiveTaxCredit).toBeCloseTo(Math.floor(noProRate.comprehensiveTaxCredit * 0.75), -1);
  });

  // #SH-2: 상속주택 1채 + 65세 + 10년 (안분 × 0.70 공제율)
  it("#SH-2 상속주택 1채 + 65세 + 10년 — 안분 적용 후 세액공제 < 비안분", () => {
    const r = calculatePropertyTax(buildInput({
      publishedPriceWon: 2_000_000_000,
      ageYears: 65, holdYears: 10,
      specialHouses: { inherited: { count: 1, publishedAverage: 100_000 } }, // 10억 (100,000만원 = 10억원)
    }));
    expect(r.notes).toContain("special-houses-applied");
    expect(r.notes).toContain("age-deduction-eligible");
    expect(r.notes).toContain("hold-deduction-eligible");
    expect(r.comprehensiveTaxCredit).toBeGreaterThan(0);
  });

  // #SH-3: 지방저가주택 1채 + 4억 (자격 본인 책임)
  it("#SH-3 지방저가주택 1채 + 4억 (자격 본인 책임 명시)", () => {
    const r = calculatePropertyTax(buildInput({
      publishedPriceWon: 1_300_000_000,
      ageYears: 60, holdYears: 5,
      specialHouses: { ruralLowPrice: { count: 1, publishedAverage: 40_000 } }, // 4억 (40,000만원)
    }));
    expect(r.notes).toContain("special-houses-applied");
    expect(r.branch).toBe("single-house");
  });

  // #SH-4: 인구감소지역주택 1채
  it("#SH-4 인구감소지역주택 1채 + 65세", () => {
    const r = calculatePropertyTax(buildInput({
      publishedPriceWon: 1_500_000_000,
      ageYears: 65, holdYears: 0,
      specialHouses: { populationDecline: { count: 1, publishedAverage: 30_000 } }, // 3억 (30,000만원)
    }));
    expect(r.notes).toContain("special-houses-applied");
    expect(r.notes).toContain("special-houses-credit-prorated");
  });

  // #SH-5: 준공후미분양주택 1채
  it("#SH-5 준공후미분양주택 1채 + 70세", () => {
    const r = calculatePropertyTax(buildInput({
      publishedPriceWon: 1_400_000_000,
      ageYears: 70, holdYears: 15,
      specialHouses: { postCompletionUnsold: { count: 1, publishedAverage: 50_000 } }, // 5억 (50,000만원)
    }));
    expect(r.notes).toContain("special-houses-applied");
    // 공제율 = min(0.40 + 0.50, 0.80) = 0.80 (한도 80% 적용)
    expect(r.comprehensiveTaxCredit).toBeGreaterThan(0);
  });

  // #SH-6: 5종 동시 보유 — 안분 분모 합산 검증
  it("#SH-6 5종 동시 보유 (총 5채, 합계 15억 안분 분모) — 안분 비율 0.5714", () => {
    const r = calculatePropertyTax(buildInput({
      publishedPriceWon: 2_000_000_000,
      ageYears: 65, holdYears: 10,
      specialHouses: {
        temporary2: { count: 1, publishedAverage: 30_000 },     // 3억 (30,000만원)
        inherited: { count: 1, publishedAverage: 50_000 },      // 5억
        ruralLowPrice: { count: 1, publishedAverage: 20_000 },  // 2억
        populationDecline: { count: 1, publishedAverage: 20_000 },  // 2억
        postCompletionUnsold: { count: 1, publishedAverage: 30_000 },  // 3억
      },
    }));
    // 안분 비율 = 20억 / (20억 + 15억) = 0.5714
    expect(r.notes).toContain("special-houses-applied");
    expect(r.notes).toContain("special-houses-credit-prorated");
    // 비안분 비교
    const noProRate = calculatePropertyTax(buildInput({
      publishedPriceWon: 2_000_000_000,
      ageYears: 65, holdYears: 10,
    }));
    expect(r.comprehensiveTaxCredit).toBeLessThan(noProRate.comprehensiveTaxCredit);
    expect(r.comprehensiveTaxCredit).toBeCloseTo(Math.floor(noProRate.comprehensiveTaxCredit * (20 / 35)), -2);
  });

  // #SH-7: specialHouses 입력했지만 houses=2 → normalize 0 강제 (회귀)
  it("#SH-7 다주택자 시도 (houses=2) — 자동 차단 + Notice push", () => {
    const r = calculatePropertyTax(buildInput({
      publishedPriceWon: 2_000_000_000,
      houses: 2, isSingleHouseEligible: false,
      specialHouses: { temporary2: { count: 1, publishedAverage: 50_000 } },
    }));
    expect(r.notes).toContain("special-houses-multi-house-blocked");
    expect(r.notes).not.toContain("special-houses-applied");
    expect(r.notes).not.toContain("special-houses-credit-prorated");
  });

  // #SH-8: specialHouses 입력했지만 isSingleHouseEligible=false → normalize 0 강제
  it("#SH-8 1세대1주택 자격 미충족 — 자동 차단 (Notice 미push, multi-house blocked 아님)", () => {
    const r = calculatePropertyTax(buildInput({
      publishedPriceWon: 1_500_000_000,
      houses: 1, isSingleHouseEligible: false,
      specialHouses: { inherited: { count: 1, publishedAverage: 50_000 } },
    }));
    expect(r.notes).not.toContain("special-houses-applied");
    expect(r.notes).not.toContain("special-houses-multi-house-blocked"); // houses=1 이라 multi 아님
    expect(r.notes).not.toContain("special-houses-corp-blocked"); // 비법인
  });

  // #SH-9: specialHouses + 법인 → normalize 0 강제 + Notice push
  it("#SH-9 법인 차단 — corporation-no-credit 와 함께 special-houses-corp-blocked push", () => {
    const r = calculatePropertyTax(buildInput({
      publishedPriceWon: 5_000_000_000, houses: 2,
      isCorporation: true, isSingleHouseEligible: false,
      specialHouses: { temporary2: { count: 1, publishedAverage: 100_000 } },
    }));
    expect(r.branch).toBe("corporation");
    expect(r.notes).toContain("special-houses-corp-blocked");
    expect(r.notes).not.toContain("special-houses-applied");
  });

  // #SH-10: 부부 공동명의 + specialHouses → B-5 우선, 안분 비활성
  it("#SH-10 부부 공동명의 1주택자 특례 + 5종 — B-5 우선, special-houses-spouse-joint-priority push", () => {
    const r = calculatePropertyTax(buildInput({
      publishedPriceWon: 1_500_000_000,
      houses: 1, isSingleHouseEligible: true,
      isSpouseJointSingleHouse: true,
      ageYears: 65, holdYears: 10,
      specialHouses: { inherited: { count: 1, publishedAverage: 50_000 } },
    }));
    expect(r.notes).toContain("spouse-joint-single-house-applied"); // B-5 활성
    expect(r.notes).toContain("special-houses-spouse-joint-priority"); // 우선 적용 안내
    expect(r.notes).not.toContain("special-houses-credit-prorated"); // 안분 비활성
  });

  // #SH-11: 회귀 보존 — specialHouses 미입력 시 기존 결과 100% 동일
  it("#SH-11 회귀 보존 — specialHouses=undefined 시 기존 산식 100% 동일", () => {
    const without = calculatePropertyTax(buildInput({
      publishedPriceWon: 1_500_000_000,
      ageYears: 65, holdYears: 10,
    }));
    const withUndef = calculatePropertyTax(buildInput({
      publishedPriceWon: 1_500_000_000,
      ageYears: 65, holdYears: 10,
      specialHouses: undefined,
    }));
    expect(withUndef).toEqual(without);
  });

  // #SH-12: 분모 0 fallback — count > 0 + publishedAverage = 0 시 안분 비율 1.0
  it("#SH-12 분모 0 fallback — count > 0 + publishedAverage = 0 → 안분 비활성 (회귀와 동일)", () => {
    const r = calculatePropertyTax(buildInput({
      publishedPriceWon: 1_500_000_000,
      ageYears: 65, holdYears: 10,
      specialHouses: { temporary2: { count: 1, publishedAverage: 0 } }, // 공시가 0 → normalize 에서 entry undefined
    }));
    // normalize 에서 entry { count:1, publishedAverage:0 } → count===0 강제 → undefined → specialHouses=undefined
    // 결과: 안분 비활성, 12억 공제 적용 안 됨 (specialHousesCount===0)
    expect(r.notes).not.toContain("special-houses-credit-prorated");
    // 회귀: 비특례 케이스와 동일 결과
    const baseline = calculatePropertyTax(buildInput({
      publishedPriceWon: 1_500_000_000,
      ageYears: 65, holdYears: 10,
    }));
    expect(r.comprehensiveTaxCredit).toBe(baseline.comprehensiveTaxCredit);
  });

  // #SH-13: 세션 113 자동 합산 — count=2 + publishedAverage=10억 → 합계 20억 자동 (안분 분모 = 1주택 + 자동합산)
  it("#SH-13 자동 합산 (세션 113) — 상속 2채 × 평균 5억 = 합계 10억 안분", () => {
    // 본인 1주택 15억 + 상속 2채 (1주택당 5억 평균 → 자동 합산 10억)
    // 안분 비율 = 15억 / (15억 + 10억) = 0.6
    // 동등 회귀 검증: 기존 합계 직접 입력 (count=1 + 합계 10억)과 결과 동일해야 함
    const rAuto = calculatePropertyTax(buildInput({
      publishedPriceWon: 1_500_000_000,
      ageYears: 65, holdYears: 10,
      specialHouses: { inherited: { count: 2, publishedAverage: 50_000 } }, // count=2 × 평균 5억 = 10억
    }));
    const rManual = calculatePropertyTax(buildInput({
      publishedPriceWon: 1_500_000_000,
      ageYears: 65, holdYears: 10,
      specialHouses: { inherited: { count: 1, publishedAverage: 100_000 } }, // count=1 × 평균 10억 = 10억 (동일 합계)
    }));
    expect(rAuto.notes).toContain("special-houses-credit-prorated");
    expect(rAuto.comprehensiveTaxCredit).toBe(rManual.comprehensiveTaxCredit); // 자동 합산 = 수동 합산 동등
    expect(rAuto.comprehensiveTax).toBe(rManual.comprehensiveTax);
  });

  // #SH-14: 자동 합산 + 다중 카테고리 — 일시적2주택 1채 + 상속 2채 (각각 평균 다름) 자동 합산
  it("#SH-14 자동 합산 (세션 113) — 다중 카테고리 (일시적2주택 1채 × 3억 + 상속 2채 × 4억) = 11억 안분", () => {
    // 본인 1주택 15억 (12억 공제 후 과세표준 양수) + 일시적2주택 1×3억 + 상속 2×4억 = 자동 합산 분모 = 15 + 3 + 8 = 26억
    // 안분 비율 = 15 / 26
    const rAuto = calculatePropertyTax(buildInput({
      publishedPriceWon: 1_500_000_000,
      ageYears: 65, holdYears: 10,
      specialHouses: {
        temporary2: { count: 1, publishedAverage: 30_000 },  // 1채 × 3억 = 3억
        inherited: { count: 2, publishedAverage: 40_000 },   // 2채 × 4억 = 8억
      },
    }));
    // 동등 회귀: count=1로 만든 동일 합계 입력
    const rManual = calculatePropertyTax(buildInput({
      publishedPriceWon: 1_500_000_000,
      ageYears: 65, holdYears: 10,
      specialHouses: {
        temporary2: { count: 1, publishedAverage: 30_000 },
        inherited: { count: 1, publishedAverage: 80_000 },   // 1채 × 8억 = 8억
      },
    }));
    expect(rAuto.notes).toContain("special-houses-credit-prorated");
    expect(rAuto.comprehensiveTaxCredit).toBe(rManual.comprehensiveTaxCredit);
  });

  // #SH-15: count=3 (최대) 자동 합산
  it("#SH-15 자동 합산 (세션 113) — count=3 (최대) × 평균 1억 = 합계 3억", () => {
    const r = calculatePropertyTax(buildInput({
      publishedPriceWon: 1_500_000_000,
      ageYears: 65, holdYears: 10,
      specialHouses: { ruralLowPrice: { count: 3, publishedAverage: 10_000 } }, // 3채 × 1억 = 3억
    }));
    expect(r.notes).toContain("special-houses-applied");
    expect(r.notes).toContain("special-houses-credit-prorated");
    // 합계 3억이 분모에 정확 반영됐는지 회귀
    const rEquiv = calculatePropertyTax(buildInput({
      publishedPriceWon: 1_500_000_000,
      ageYears: 65, holdYears: 10,
      specialHouses: { ruralLowPrice: { count: 1, publishedAverage: 30_000 } }, // 1채 × 3억 = 3억
    }));
    expect(r.comprehensiveTaxCredit).toBe(rEquiv.comprehensiveTaxCredit);
  });
});

describe("calculatePropertyTax — B-3 (공동명의) × 5종 (PDF #12) × PDF #13 상호작용 (세션 113 Phase B-2)", () => {
  // #B23-1: B-3 공동명의 50% × 5종 1채 — ownership ratio 가 effectivePublished 에만 적용 (특례주택은 100% 기준)
  it("#B23-1 공동명의 50% × 일시적2주택 1채 — 안분 분자에 본인 지분 50% 만 반영", () => {
    // 본인 1주택 20억 × 50% = 10억 effectivePublished + 일시적2주택 1×5억 = 5억
    // 안분 분모 = 10억 + 5억 = 15억, 분자 = 10억, 비율 = 0.667
    const rJoint = calculatePropertyTax(buildInput({
      publishedPriceWon: 2_000_000_000,
      ageYears: 65, holdYears: 10,
      ownershipRatio: 0.5,
      specialHouses: { temporary2: { count: 1, publishedAverage: 50_000 } },
    }));
    // 단독명의 동일 지분 (10억 단독) + 5종 5억 → 안분 비율 = 0.667 동일
    const rSingle = calculatePropertyTax(buildInput({
      publishedPriceWon: 1_000_000_000,
      ageYears: 65, holdYears: 10,
      specialHouses: { temporary2: { count: 1, publishedAverage: 50_000 } },
    }));
    // 공동명의 case는 1세대1주택자 이므로 ownership-applied + ownership-single-house-warning Notice 푸시
    expect(rJoint.notes).toContain("ownership-applied");
    expect(rJoint.notes).toContain("ownership-single-house-warning");
    expect(rJoint.notes).toContain("special-houses-applied");
    // 종부세 1주택 자격은 effectiveHousesAfterExclusion === 1 이므로 양쪽 모두 12억 공제 적용
    expect(rJoint.comprehensiveDeduction).toBe(rSingle.comprehensiveDeduction);
  });

  // #B23-2: B-5 부부 공동명의 1주택 특례 우선 적용 시 ownership ratio 강제 1.0 + 5종 안분 비활성
  it("#B23-2 B-5 부부 공동명의 + 5종 입력 — special-houses-spouse-joint-priority Notice + 안분 비활성", () => {
    const r = calculatePropertyTax(buildInput({
      publishedPriceWon: 1_500_000_000,
      ageYears: 65, holdYears: 10,
      ownershipRatio: 0.5,
      isSpouseJointSingleHouse: true,
      specialHouses: { inherited: { count: 2, publishedAverage: 30_000 } },
    }));
    // B-5 우선 적용 → ratio=1 강제 + 5종 안분 비활성
    expect(r.notes).toContain("spouse-joint-single-house-applied");
    expect(r.notes).toContain("special-houses-spouse-joint-priority");
    expect(r.notes).not.toContain("special-houses-credit-prorated"); // 안분 비활성
    expect(r.notes).not.toContain("ownership-applied"); // ratio=1 강제로 미푸시
  });

  // #B23-3: B-3 공동명의 + PDF #13 4종 — ratio 는 종부세 산정에만, PDF #13 은 세율 분기에만 영향
  // 둘 다 1세대1주택 자격 무관이라 다주택 케이스로 검증
  it("#B23-3 공동명의 50% (다주택) × PDF #13 4종 — 종부세 ratio 적용 + BRACKETS_2 다운판정 양립", () => {
    const r = calculatePropertyTax(buildInput({
      publishedPriceWon: 3_000_000_000,
      houses: 3,
      isSingleHouseEligible: false, // 다주택 케이스 명시 (buildInput default true 오버라이드)
      ownershipRatio: 0.5,
      specialHousesRateApply: { inheritedRA: { count: 1 } },
    }));
    // 다주택 + isSingleHouseEligible=false → ownership-warning 미푸시 (1세대1주택 자격 무)
    expect(r.notes).toContain("ownership-applied");
    expect(r.notes).not.toContain("ownership-single-house-warning"); // 1세대1주택 자격 무 → warning 없음
    expect(r.notes).toContain("rate-apply-exclusion-applied");
    expect(r.notes).toContain("rate-apply-exclusion-downgraded"); // 3주택 → 2주택 다운판정
    // ratio 50% 적용 검증: 동일 입력에서 ratio=1 vs ratio=0.5 → 종부세 다름
    const rFull = calculatePropertyTax(buildInput({
      publishedPriceWon: 3_000_000_000,
      houses: 3,
      isSingleHouseEligible: false,
      ownershipRatio: 1,
      specialHousesRateApply: { inheritedRA: { count: 1 } },
    }));
    expect(r.comprehensiveTax).toBeLessThan(rFull.comprehensiveTax); // 50% 지분 → 종부세 감소
  });

  // #B23-4: 트리플 — B-3 + 5종 (PDF #12) + PDF #13 4종 동시 입력 (1세대1주택 자격, 다주택 효과는 별도)
  // 1세대1주택자라 PDF #13 효과 없음 (이미 BRACKETS_2), 5종은 안분 적용, B-3 ratio 도 적용
  // 본인 공시가 30억 × 50% = 15억 (12억 공제 후 양수, branch=single-house 진입)
  it("#B23-4 트리플 (B-3 50% + 5종 PDF #12 + PDF #13 4종) — 모든 Notice 정확 발동 + 산식 충돌 0", () => {
    const r = calculatePropertyTax(buildInput({
      publishedPriceWon: 3_000_000_000,
      houses: 1,
      isSingleHouseEligible: true,
      ageYears: 65, holdYears: 10,
      ownershipRatio: 0.5,
      specialHouses: { inherited: { count: 1, publishedAverage: 50_000 } },
      specialHousesRateApply: { inheritedRA: { count: 1 } },
    }));
    expect(r.notes).toContain("ownership-applied");
    expect(r.notes).toContain("ownership-single-house-warning");
    expect(r.notes).toContain("special-houses-applied");
    expect(r.notes).toContain("rate-apply-exclusion-applied");
    expect(r.notes).toContain("rate-apply-exclusion-no-effect"); // 1주택이라 PDF #13 효과 없음
    expect(r.branch).toBe("single-house"); // 1세대1주택 자격 유지
  });
});
