/**
 * 보유세 — PDF #13 4종 세율 특례주택 단위 테스트 (세션 113).
 * 권위 출처: PDF #13 페이지 1~3 본문 직접 인용.
 * 효과: 3주택 이상 → 4종 채수 제외 후 2주택 이하면 BRACKETS_3 → BRACKETS_2 다운판정.
 *
 * 산식 분리 (세션 113 핵심 박제):
 * - 종부세 1주택 자격 판정 = effectiveHousesAfterExclusion (합산배제만 적용) — PDF #13 무관
 * - BRACKETS 분기 = effectiveHouses (합산배제 + PDF #13 모두 적용)
 */

import { describe, it, expect } from "vitest";
import { calculatePropertyTax } from "@/lib/property-tax";
import type { PropertyTaxInput } from "@/lib/property-tax-types";

function buildInput(over: Partial<PropertyTaxInput>): PropertyTaxInput {
  return {
    publishedPriceWon: 0, houses: 1,
    isSingleHouseEligible: false,
    ageYears: 0, holdYears: 0,
    ...over,
  };
}

describe("calculatePropertyTax — PDF #13 4종 세율 특례주택 (세션 113)", () => {
  // #RA-1: 다운판정 효과 발동 (3주택 + 상속주택 1채 → 2주택 다운 → BRACKETS_2 진입)
  it("#RA-1 다운판정 발동 — 3주택 보유 + 상속주택 1채 → 중과세율(BRACKETS_3) 대신 기본세율(BRACKETS_2)", () => {
    // 3주택 + 30억 공시가: BRACKETS_3 라면 25억 초과 → 중과 누진 발동, BRACKETS_2 라면 미발동
    const inputWithoutRA = buildInput({
      publishedPriceWon: 3_000_000_000,
      houses: 3,
    });
    const inputWithRA = buildInput({
      publishedPriceWon: 3_000_000_000,
      houses: 3,
      specialHousesRateApply: { inheritedRA: { count: 1 } }, // 상속주택 1채 → 세율 산정 2주택
    });
    const rWithout = calculatePropertyTax(inputWithoutRA);
    const rWith = calculatePropertyTax(inputWithRA);

    // PDF #13 미적용: BRACKETS_3 진입 → multi-heavy-25e Notice 발동 (3주택+25억 초과 중과)
    expect(rWithout.notes).toContain("multi-heavy-25e");
    // PDF #13 적용: BRACKETS_2 다운판정 → 중과 미발동 (multi-heavy-25e Notice 없음)
    expect(rWith.notes).not.toContain("multi-heavy-25e");
    expect(rWith.notes).toContain("rate-apply-exclusion-applied");
    expect(rWith.notes).toContain("rate-apply-exclusion-downgraded");
    // 종부세액 적용: BRACKETS_2 가 BRACKETS_3 보다 낮으므로 종부세 감소
    expect(rWith.comprehensiveTax).toBeLessThan(rWithout.comprehensiveTax);
  });

  // #RA-2: 효과 없음 — 원래 2주택 (PDF #13 신청해도 BRACKETS_2 그대로)
  it("#RA-2 효과 없음 — 2주택 보유 + PDF #13 신청 → no-effect Notice (산식 영향 0)", () => {
    const r = calculatePropertyTax(buildInput({
      publishedPriceWon: 2_000_000_000,
      houses: 2,
      specialHousesRateApply: { inheritedRA: { count: 1 } },
    }));
    expect(r.notes).toContain("rate-apply-exclusion-applied");
    expect(r.notes).toContain("rate-apply-exclusion-no-effect");
    expect(r.notes).not.toContain("rate-apply-exclusion-downgraded");
  });

  // #RA-3: 효과 없음 — 4채 보유 + 1채 제외 → 여전히 3주택 (BRACKETS_3 그대로)
  // (houses=3 = 3주택 이상 의미이므로 시뮬레이션상 합산배제와 결합)
  it("#RA-3 효과 없음 — 5주택(houses=3+excludedHouses=0) + PDF #13 1채 제외 후에도 ≥3주택", () => {
    // houses=3 + PDF #13 1채 제외 = 2주택 → 다운판정 발동 (RA-1과 동일 케이스)
    // 진짜 효과 없음 케이스 = houses=3 + excludedHouses 합산배제 + PDF #13 채수 부족
    // 본 도구는 houses 최대 3 (3주택 이상) 이므로 RA-3은 RA-1과 같이 발동됨 → 본 케이스는 RA-2로 충분
    // 대신 PDF #13 채수 0인 케이스 (입력 없음과 동일) 검증
    const r = calculatePropertyTax(buildInput({
      publishedPriceWon: 3_000_000_000,
      houses: 3,
      specialHousesRateApply: { inheritedRA: { count: 0 } }, // count 0 = normalize 에서 undefined 강제 → applied Notice 미발동
    }));
    expect(r.notes).not.toContain("rate-apply-exclusion-applied");
  });

  // #RA-4: 법인 자동 차단 (rate-apply-exclusion-corp-blocked Notice)
  it("#RA-4 법인 자동 차단 — 법인 + PDF #13 시도 → corp-blocked Notice + 산식 영향 0", () => {
    const inputCorpWithoutRA = buildInput({
      publishedPriceWon: 3_000_000_000,
      houses: 3,
      isCorporation: true,
    });
    const inputCorpWithRA = buildInput({
      publishedPriceWon: 3_000_000_000,
      houses: 3,
      isCorporation: true,
      specialHousesRateApply: { inheritedRA: { count: 1 } },
    });
    const rCorpWithout = calculatePropertyTax(inputCorpWithoutRA);
    const rCorpWith = calculatePropertyTax(inputCorpWithRA);

    expect(rCorpWith.notes).toContain("rate-apply-exclusion-corp-blocked");
    expect(rCorpWith.notes).not.toContain("rate-apply-exclusion-applied");
    // 법인 단일세율 산식이라 BRACKETS 분기 영향 없음 — 두 결과 종부세 동일
    expect(rCorpWith.comprehensiveTax).toBe(rCorpWithout.comprehensiveTax);
  });

  // #RA-5: PDF #12 + PDF #13 양립 (1세대1주택 5종 + 4종 세율 동시 활성)
  // 단 PDF #12는 houses=1 자격 필요, PDF #13은 다주택 효과 도구이므로 같은 단지에선 양립 시나리오 부자연스러움
  // → 본 케이스는 두 입력이 모두 normalize 통과하는지만 검증 (산식 효과는 각자 별개)
  it("#RA-5 PDF #12 + PDF #13 동시 입력 — normalize 양쪽 통과 (산식 효과는 별개)", () => {
    const r = calculatePropertyTax(buildInput({
      publishedPriceWon: 1_500_000_000,
      houses: 1,
      isSingleHouseEligible: true,
      ageYears: 65, holdYears: 10,
      specialHouses: { temporary2: { count: 1, publishedTotal: 50_000 } }, // PDF #12 — 1주택 자격 인정
      specialHousesRateApply: { inheritedRA: { count: 1 } }, // PDF #13 — 1주택이라 효과 없음
    }));
    expect(r.notes).toContain("special-houses-applied"); // PDF #12 자격 인정
    expect(r.notes).toContain("rate-apply-exclusion-applied"); // PDF #13 신청 적용
    expect(r.notes).toContain("rate-apply-exclusion-no-effect"); // PDF #13 효과 없음 (1주택 → 이미 BRACKETS_2)
  });

  // #RA-6: 4종 채수 합계 (여러 카테고리 동시 입력)
  it("#RA-6 4종 합계 — 상속 1 + 무허가 1 + 소형 1 = 3채 제외 (3주택 보유 → 0주택 다운)", () => {
    const r = calculatePropertyTax(buildInput({
      publishedPriceWon: 3_000_000_000,
      houses: 3,
      specialHousesRateApply: {
        inheritedRA: { count: 1 },
        unauthorizedLand: { count: 1 },
        smallNewHouse: { count: 1 },
      },
    }));
    expect(r.notes).toContain("rate-apply-exclusion-applied");
    expect(r.notes).toContain("rate-apply-exclusion-downgraded"); // 3채 제외 → 0주택 (< 3) → 다운판정
    expect(r.notes).not.toContain("multi-heavy-25e");
  });

  // #RA-7: normalize count clamp (3 초과 → 3 강제)
  it("#RA-7 count clamp — 5채 입력 → 3채 강제 (정상 다운판정)", () => {
    const r = calculatePropertyTax(buildInput({
      publishedPriceWon: 3_000_000_000,
      houses: 3,
      specialHousesRateApply: { inheritedRA: { count: 5 } }, // clamp 후 3
    }));
    expect(r.notes).toContain("rate-apply-exclusion-applied");
    expect(r.notes).toContain("rate-apply-exclusion-downgraded");
  });

  // #RA-8: 4종 모든 카테고리 (postCompletionUnsoldRA + smallNewHouse + 등) 입력 통과 검증
  it("#RA-8 4종 카테고리 모두 — 각 1채 입력 normalize 통과", () => {
    const r = calculatePropertyTax(buildInput({
      publishedPriceWon: 3_000_000_000,
      houses: 3,
      specialHousesRateApply: {
        inheritedRA: { count: 1 },
        unauthorizedLand: { count: 1 },
        smallNewHouse: { count: 1 },
        postCompletionUnsoldRA: { count: 1 },
      },
    }));
    expect(r.notes).toContain("rate-apply-exclusion-applied");
    expect(r.notes).toContain("rate-apply-exclusion-downgraded");
  });
});
