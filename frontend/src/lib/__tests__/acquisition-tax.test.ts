/**
 * 취득세 계산 단위 테스트
 * - 위택스 검증 6 케이스 (도메인 정확성 박제)
 * - 진입점 분기 (5종) + 빈 값 / 0원 / Infinity 가드
 * - 농특세 면적 가드 (85m² 임계 + area=0 비과세 오발 차단)
 * - 생애최초 12억 거부 + 다주택 거부
 */

import { describe, it, expect } from "vitest";
import {
  calculateAcquisitionTax,
  EMPTY_RESULT,
  type AcquisitionInput,
} from "../acquisition-tax";

const baseInput: AcquisitionInput = {
  amountWon: 0,
  propertyType: "house",
  houses: 1,
  isRegulatedArea: false,
  isFirstTime: false,
  area_m2: 84,
};

describe("calculateAcquisitionTax — 위택스 6 케이스 (도메인 정확성 박제)", () => {
  it("케이스 1: 5억 1주택 84m² → 본세 500만, 농특 0, 교육 50만, 합계 550만", () => {
    const r = calculateAcquisitionTax({ ...baseInput, amountWon: 500_000_000, area_m2: 84 });
    expect(r.baseTax).toBe(5_000_000);
    expect(r.ruralTax).toBe(0);
    expect(r.educationTax).toBe(500_000);
    expect(r.total).toBe(5_500_000);
    expect(r.branch).toBe("standard");
    expect(r.notes).toContain("area-85-exempt");
  });

  it("케이스 2: 7억 1주택 110m² → 본세 1166만(보간 Math.floor), 농특 140만, 교육 116만", () => {
    // 보간식: rate = (7 × 2/3 - 3) % = 1.6667%
    // baseTax = Math.floor(7억 × 1.6667%) = 11,666,666
    // 위택스 공시값과 만원 단위 절사 정책 차이는 별도 도메인 검증 (현재 식 정확성만 보장)
    const r = calculateAcquisitionTax({ ...baseInput, amountWon: 700_000_000, area_m2: 110 });
    expect(r.baseTax).toBe(11_666_666); // 7억 × 1.6667% (보간 + Math.floor)
    expect(r.ruralTax).toBe(1_400_000); // 7억 × 0.2% (85m² 초과)
    expect(r.educationTax).toBe(1_166_666); // baseTax × 10% via amount × rate × 0.1
    expect(r.total).toBe(14_233_332); // 11666666 + 1400000 + 1166666
    expect(r.notes).not.toContain("area-85-exempt");
  });

  it("케이스 3: 7.5억 1주택 84m² → 본세 1500만, 농특 0, 교육 150만", () => {
    const r = calculateAcquisitionTax({ ...baseInput, amountWon: 750_000_000, area_m2: 84 });
    expect(r.baseTax).toBe(15_000_000); // 7.5억 × 2% (보간)
    expect(r.ruralTax).toBe(0); // 84m² 비과세
    expect(r.educationTax).toBe(1_500_000);
    expect(r.total).toBe(16_500_000);
  });

  it("케이스 4: 9억 1주택 110m² → 본세 2700만, 농특 180만, 교육 270만", () => {
    const r = calculateAcquisitionTax({ ...baseInput, amountWon: 900_000_000, area_m2: 110 });
    expect(r.baseTax).toBe(27_000_000); // 9억 × 3% (경계, 보간/9억초과 동일)
    expect(r.ruralTax).toBe(1_800_000); // 9억 × 0.2%
    expect(r.educationTax).toBe(2_700_000); // 9억 × 3% × 10%
    expect(r.total).toBe(31_500_000);
  });

  it("케이스 5: 10억 2주택 조정 110m² → 본세 8000만, 농특 600만, 교육 400만", () => {
    const r = calculateAcquisitionTax({
      ...baseInput,
      amountWon: 1_000_000_000,
      houses: 2,
      isRegulatedArea: true,
      area_m2: 110,
    });
    expect(r.baseTax).toBe(80_000_000); // 10억 × 8% (중과)
    expect(r.ruralTax).toBe(6_000_000); // 10억 × 0.6% (다주택 8% 농특)
    expect(r.educationTax).toBe(4_000_000); // 10억 × 4% × 10% (중과 시 고정 4% 기준)
    expect(r.total).toBe(90_000_000);
    expect(r.branch).toBe("multi-house");
    expect(r.notes).toContain("multi-house-rural");
  });

  it("케이스 6: 5억 생애최초 84m² → 본세 500만, 감면 200만, 농특 0, 교육 50만", () => {
    const r = calculateAcquisitionTax({
      ...baseInput,
      amountWon: 500_000_000,
      isFirstTime: true,
      area_m2: 84,
    });
    expect(r.baseTax).toBe(5_000_000); // 5억 × 1% (감면 전)
    expect(r.exemption).toBe(2_000_000); // 200만원 한도
    expect(r.ruralTax).toBe(0); // 84m² 비과세
    expect(r.educationTax).toBe(500_000); // baseTax × 10% (감면 무관)
    expect(r.total).toBe(3_500_000); // 500 - 200 + 0 + 50
    expect(r.branch).toBe("first-time");
    expect(r.notes).toContain("first-time-base-only");
  });
});

describe("calculateAcquisitionTax — 진입점 분기 5종", () => {
  it("0원 입력 → EMPTY_RESULT", () => {
    const r = calculateAcquisitionTax({ ...baseInput, amountWon: 0 });
    expect(r).toEqual(EMPTY_RESULT);
  });

  it("Infinity 입력 → EMPTY_RESULT (validateAmount 가드)", () => {
    const r = calculateAcquisitionTax({ ...baseInput, amountWon: Infinity });
    expect(r.branch).toBe("empty");
  });

  it("음수 입력 → EMPTY_RESULT (validateAmount 가드)", () => {
    const r = calculateAcquisitionTax({ ...baseInput, amountWon: -1 });
    expect(r.branch).toBe("empty");
  });

  it("오피스텔 → 4.6% 고정 (4% + 0.2% + 0.4%)", () => {
    const r = calculateAcquisitionTax({
      ...baseInput,
      amountWon: 500_000_000,
      propertyType: "officetel-commercial",
    });
    expect(r.baseTax).toBe(20_000_000); // 5억 × 4%
    expect(r.ruralTax).toBe(1_000_000); // 5억 × 0.2%
    expect(r.educationTax).toBe(2_000_000); // 5억 × 4% × 10%
    expect(r.total).toBe(23_000_000);
    expect(r.branch).toBe("officetel");
  });

  it("3주택 조정 → 12% 중과 (농특 1.0%)", () => {
    const r = calculateAcquisitionTax({
      ...baseInput,
      amountWon: 1_000_000_000,
      houses: 3,
      isRegulatedArea: true,
    });
    expect(r.baseTax).toBe(120_000_000); // 10억 × 12%
    expect(r.ruralTax).toBe(10_000_000); // 10억 × 1.0%
    expect(r.educationTax).toBe(4_000_000); // 10억 × 4% × 10%
    expect(r.branch).toBe("multi-house");
  });

  it("2주택 비조정 → 표준 fallback (중과세율 0)", () => {
    const r = calculateAcquisitionTax({
      ...baseInput,
      amountWon: 500_000_000,
      houses: 2,
      isRegulatedArea: false,
    });
    expect(r.baseTax).toBe(5_000_000); // 5억 × 1% (표준)
    expect(r.branch).toBe("standard");
  });

  it("3주택 비조정 → 8% 중과", () => {
    const r = calculateAcquisitionTax({
      ...baseInput,
      amountWon: 1_000_000_000,
      houses: 3,
      isRegulatedArea: false,
    });
    expect(r.baseTax).toBe(80_000_000); // 10억 × 8%
    expect(r.branch).toBe("multi-house");
  });
});

describe("calculateAcquisitionTax — 생애최초 12억 거부", () => {
  it("12억 초과 생애최초 → first-time-rejected (표준세율 적용)", () => {
    const r = calculateAcquisitionTax({
      ...baseInput,
      amountWon: 1_300_000_000,
      isFirstTime: true,
      area_m2: 110,
    });
    expect(r.branch).toBe("first-time-rejected");
    expect(r.exemption).toBe(0); // 감면 없음
    expect(r.baseTax).toBe(39_000_000); // 13억 × 3%
    expect(r.notes).toContain("first-time-rejected");
    expect(r.notes).not.toContain("first-time-base-only");
  });

  it("12억 정확히 → 생애최초 적용 (경계값)", () => {
    const r = calculateAcquisitionTax({
      ...baseInput,
      amountWon: 1_200_000_000,
      isFirstTime: true,
      area_m2: 84,
    });
    expect(r.branch).toBe("first-time");
    expect(r.exemption).toBe(2_000_000);
  });

  it("12억 + 1원 → 거부 (12억 초과)", () => {
    const r = calculateAcquisitionTax({
      ...baseInput,
      amountWon: 1_200_000_001,
      isFirstTime: true,
      area_m2: 84,
    });
    expect(r.branch).toBe("first-time-rejected");
  });
});

describe("calculateAcquisitionTax — 농특세 면적 가드 (85m² 임계 + area=0)", () => {
  it("area_m2=85 (경계, 1주택 표준) → 농특 0 (비과세 포함)", () => {
    const r = calculateAcquisitionTax({ ...baseInput, amountWon: 500_000_000, area_m2: 85 });
    expect(r.ruralTax).toBe(0);
    expect(r.notes).toContain("area-85-exempt");
  });

  it("area_m2=85.1 (경계 초과) → 농특 부과 + 안내 미노출", () => {
    const r = calculateAcquisitionTax({ ...baseInput, amountWon: 500_000_000, area_m2: 85.1 });
    expect(r.ruralTax).toBe(1_000_000); // 5억 × 0.2%
    expect(r.notes).not.toContain("area-85-exempt");
  });

  it("area_m2=0 (미입력) → area-85-exempt 노출 안 함 (오발 차단)", () => {
    const r = calculateAcquisitionTax({ ...baseInput, amountWon: 500_000_000, area_m2: 0 });
    expect(r.ruralTax).toBe(1_000_000); // 0 < 85 인데도 area>0 가드로 부과
    expect(r.notes).not.toContain("area-85-exempt");
  });

  it("다주택 + 작은 면적 → 면적 무관 농특 부과 (multi-house 분기)", () => {
    const r = calculateAcquisitionTax({
      ...baseInput,
      amountWon: 1_000_000_000,
      houses: 2,
      isRegulatedArea: true,
      area_m2: 60, // 85m² 미만이지만 다주택은 부과
    });
    expect(r.ruralTax).toBe(6_000_000); // 10억 × 0.6%
    expect(r.notes).not.toContain("area-85-exempt");
  });
});

describe("calculateAcquisitionTax — 결과 일관성", () => {
  it("effectiveRate = total / amountWon", () => {
    const r = calculateAcquisitionTax({ ...baseInput, amountWon: 500_000_000, area_m2: 84 });
    expect(r.effectiveRate).toBeCloseTo(r.total / 500_000_000, 6);
  });

  it("notes는 항상 disclaimer 포함", () => {
    const r1 = calculateAcquisitionTax({ ...baseInput, amountWon: 500_000_000 });
    expect(r1.notes).toContain("disclaimer");
    const r2 = calculateAcquisitionTax({ ...baseInput, amountWon: 0 });
    expect(r2.notes).toContain("disclaimer");
  });

  it("appliedRate = 적용 세율 (표준 1%, 중과 8%, 오피스텔 4%)", () => {
    expect(calculateAcquisitionTax({ ...baseInput, amountWon: 500_000_000 }).appliedRate).toBe(0.01);
    expect(calculateAcquisitionTax({ ...baseInput, amountWon: 1_000_000_000, houses: 2, isRegulatedArea: true }).appliedRate).toBe(0.08);
    expect(calculateAcquisitionTax({ ...baseInput, amountWon: 500_000_000, propertyType: "officetel-commercial" }).appliedRate).toBe(0.04);
  });
});
