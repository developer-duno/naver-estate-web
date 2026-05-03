/**
 * 양도소득세 계산 단위 테스트 (37+ 케이스)
 * - 도메인 박제 15 케이스 (plan v1.8 매트릭스, 9 권위 출처 교차검증)
 * - computeTable 헬퍼 21 케이스 (표1·표2 a/b/total)
 * - applyProgressive + computeHoldYears + 진입점 가드 + edge
 *
 * 산식 출처: 법제처 §95②/§95⑤ + 국세청 표 13컬럼 + 흠택스 + KB금융 + 한경 기사 등 9 출처.
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax, computeHoldYears, EMPTY_RESULT, type TransferInput } from "../transfer-tax";
import {
  computeTable1Rate, computeTable2HoldRate, computeTable2LiveRate, computeTable2TotalRate,
  applyProgressive,
} from "../transfer-brackets";

const base: TransferInput = {
  transferWon: 0, acquisitionWon: 0, expensesWon: 0,
  acquisitionDate: "2020-01-01", transferDate: "2026-04-01",
  holdYears: 0, livedYears: 0, houses: 1,
  isRegulatedAtTransfer: false, isRegulatedAtAcquisition: false,
  areaM2: 84, isUnregistered: false, exemptionOverride: "auto",
};

describe("computeTable1Rate (표1 일반, 보유 연 2%, 최대 30%)", () => {
  it("0~2년 → 0", () => {
    expect(computeTable1Rate(0)).toBe(0);
    expect(computeTable1Rate(2.99)).toBe(0);
  });
  it("3년 → 6%", () => expect(computeTable1Rate(3)).toBeCloseTo(0.06));
  it("5년 → 10%", () => expect(computeTable1Rate(5)).toBeCloseTo(0.10));
  it("14년 → 28%", () => expect(computeTable1Rate(14)).toBeCloseTo(0.28));
  it("15년 → 30% 상한", () => expect(computeTable1Rate(15)).toBeCloseTo(0.30));
  it("20년 → 30% 상한 유지", () => expect(computeTable1Rate(20)).toBeCloseTo(0.30));
});

describe("computeTable2HoldRate (표2 보유, 연 4%, 최대 40%)", () => {
  it("0~2년 → 0", () => expect(computeTable2HoldRate(2.5)).toBe(0));
  it("3년 → 12%", () => expect(computeTable2HoldRate(3)).toBeCloseTo(0.12));
  it("9년 → 36%", () => expect(computeTable2HoldRate(9)).toBeCloseTo(0.36));
  it("10년 → 40% 상한", () => expect(computeTable2HoldRate(10)).toBeCloseTo(0.40));
  it("12년 → 40% 상한 유지", () => expect(computeTable2HoldRate(12)).toBeCloseTo(0.40));
});

describe("computeTable2LiveRate (표2 거주, 2년 8% 특례, 3년+ 연 4%, 최대 40%)", () => {
  it("0~1년 → 0", () => expect(computeTable2LiveRate(1.5)).toBe(0));
  it("2년 → 8% (특례)", () => expect(computeTable2LiveRate(2)).toBeCloseTo(0.08));
  it("2.5년 → 8% (특례 유지)", () => expect(computeTable2LiveRate(2.5)).toBeCloseTo(0.08));
  it("3년 → 12%", () => expect(computeTable2LiveRate(3)).toBeCloseTo(0.12));
  it("5년 → 20%", () => expect(computeTable2LiveRate(5)).toBeCloseTo(0.20));
  it("9년 → 36%", () => expect(computeTable2LiveRate(9)).toBeCloseTo(0.36));
  it("10년 → 40% 상한", () => expect(computeTable2LiveRate(10)).toBeCloseTo(0.40));
});

describe("computeTable2TotalRate (합산, 최대 80%)", () => {
  it("(3,2) → 12 + 8 = 20%", () => expect(computeTable2TotalRate(3, 2)).toBeCloseTo(0.20));
  it("(10,5) → 40 + 20 = 60%", () => expect(computeTable2TotalRate(10, 5)).toBeCloseTo(0.60));
  it("(10,10) → 40 + 40 = 80%", () => expect(computeTable2TotalRate(10, 10)).toBeCloseTo(0.80));
  it("(15,15) → 80% 상한 유지", () => expect(computeTable2TotalRate(15, 15)).toBeCloseTo(0.80));
  it("(12,5) → 40 + 20 = 60% (케이스 #2 박제)", () => expect(computeTable2TotalRate(12, 5)).toBeCloseTo(0.60));
});

describe("applyProgressive (8구간 누진세, 케이스 #2 75.9M)", () => {
  it("75.9M (24% 구간) → 12,456,000원 본세", () => {
    expect(Math.floor(applyProgressive(75_900_000))).toBe(12_456_000);
  });
  it("438.5M (40% 구간) → 149,460,000원", () => {
    expect(Math.floor(applyProgressive(438_500_000))).toBe(149_460_000);
  });
  it("987.5M (42% 구간) → 378,810,000원", () => {
    expect(Math.floor(applyProgressive(987_500_000))).toBe(378_810_000);
  });
});

describe("computeHoldYears (day-precision)", () => {
  it("동일 날짜 → 0", () => expect(computeHoldYears("2026-04-01", "2026-04-01")).toBe(0));
  it("취득 > 양도 → 0 (음수 방어)", () => expect(computeHoldYears("2026-04-01", "2025-04-01")).toBe(0));
  it("12년 보유 (2014-04-01 → 2026-04-01) → 약 12.0", () => {
    const y = computeHoldYears("2014-04-01", "2026-04-01");
    expect(y).toBeGreaterThan(11.95);
    expect(y).toBeLessThan(12.05);
  });
});

describe("calculateTransferTax — 도메인 15 케이스 (plan v1.8 매트릭스)", () => {
  it("#1 1주택 12억 이하 비과세 → 0", () => {
    const r = calculateTransferTax({
      ...base, transferWon: 800_000_000, acquisitionWon: 500_000_000, expensesWon: 20_000_000,
      holdYears: 5, livedYears: 3, houses: 1,
      isRegulatedAtTransfer: true, isRegulatedAtAcquisition: true,
    });
    expect(r.branch).toBe("single-house-exempt");
    expect(r.totalTax).toBe(0);
  });

  it("#2 1주택 12억 초과 안분 + 표2 60% → 12,456,000원", () => {
    const r = calculateTransferTax({
      ...base, transferWon: 1_500_000_000, acquisitionWon: 500_000_000, expensesWon: 20_000_000,
      holdYears: 12, livedYears: 5, houses: 1,
      isRegulatedAtTransfer: true, isRegulatedAtAcquisition: true,
    });
    expect(r.branch).toBe("single-house-prorate");
    expect(r.taxableGain).toBe(196_000_000);
    expect(r.longTermDeduction).toBe(117_600_000);
    expect(r.taxBase).toBe(75_900_000);
    expect(r.totalTax).toBe(12_456_000);
    expect(r.appliedTable).toBe("table2");
    expect(r.appliedRate).toBe(0.24);
  });

  it("#3 1주택 단기 70% (보유 0.5y) → 341,250,000원", () => {
    const r = calculateTransferTax({
      ...base, transferWon: 1_000_000_000, acquisitionWon: 500_000_000, expensesWon: 10_000_000,
      holdYears: 0.5, livedYears: 0, houses: 1,
    });
    expect(r.branch).toBe("general");
    expect(r.totalTax).toBe(341_250_000);
    expect(r.appliedRate).toBeCloseTo(0.70);
    expect(r.notes).toContain("short-term-70"); // R11 회귀 가드
  });

  it("#4 1주택 단기 60% (보유 1.5y) → 292,500,000원", () => {
    const r = calculateTransferTax({
      ...base, transferWon: 1_000_000_000, acquisitionWon: 500_000_000, expensesWon: 10_000_000,
      holdYears: 1.5, livedYears: 0, houses: 1,
    });
    expect(r.branch).toBe("general");
    expect(r.totalTax).toBe(292_500_000);
    expect(r.notes).toContain("short-term-60"); // R11 회귀 가드
  });

  it("#5 한시배제 적용 (양도일 ≤ 2026-05-09) → 표1 적용 223,830,000원", () => {
    const r = calculateTransferTax({
      ...base, transferWon: 1_200_000_000, acquisitionWon: 500_000_000, expensesWon: 10_000_000,
      holdYears: 5, livedYears: 3, houses: 2,
      isRegulatedAtTransfer: true, isRegulatedAtAcquisition: true,
      transferDate: "2026-04-01",
    });
    expect(r.branch).toBe("general");
    expect(r.totalTax).toBe(223_830_000);
    expect(r.appliedTable).toBe("table1");
    expect(r.appliedRate).toBeCloseTo(0.42); // R12 회귀 가드 (taxBase 618.5M → 42% 구간)
  });

  it("#6 다주택 중과 +20%p (양도일 > 2026-05-09, 2주택) → 390,310,000원 (장특공 0)", () => {
    const r = calculateTransferTax({
      ...base, transferWon: 1_200_000_000, acquisitionWon: 500_000_000, expensesWon: 10_000_000,
      holdYears: 5, livedYears: 3, houses: 2,
      isRegulatedAtTransfer: true, isRegulatedAtAcquisition: true,
      transferDate: "2026-05-10",
    });
    expect(r.branch).toBe("general");
    expect(r.longTermDeduction).toBe(0);
    expect(r.totalTax).toBe(390_310_000);
    expect(r.notes).toContain("multi-heavy-applied"); // R11 회귀 가드
  });

  it("#7 다주택 중과 +30%p (3주택) → 675,060,000원", () => {
    const r = calculateTransferTax({
      ...base, transferWon: 1_500_000_000, acquisitionWon: 500_000_000, expensesWon: 10_000_000,
      holdYears: 5, livedYears: 3, houses: 3,
      isRegulatedAtTransfer: true, isRegulatedAtAcquisition: true,
      transferDate: "2026-05-10",
    });
    expect(r.totalTax).toBe(675_060_000);
  });

  it("#8 단기 + 다주택 중과 max → 341,250,000원 (단기 우세)", () => {
    const r = calculateTransferTax({
      ...base, transferWon: 1_000_000_000, acquisitionWon: 500_000_000, expensesWon: 10_000_000,
      holdYears: 0.5, livedYears: 0, houses: 3,
      isRegulatedAtTransfer: true, isRegulatedAtAcquisition: true,
      transferDate: "2026-05-10",
    });
    expect(r.totalTax).toBe(341_250_000);
  });

  it("#9 1주택 거주 미달 (조정취득) → general 표1 → 149,460,000원", () => {
    const r = calculateTransferTax({
      ...base, transferWon: 1_000_000_000, acquisitionWon: 500_000_000, expensesWon: 10_000_000,
      holdYears: 5, livedYears: 0, houses: 1,
      isRegulatedAtTransfer: true, isRegulatedAtAcquisition: true,
    });
    expect(r.branch).toBe("general");
    expect(r.totalTax).toBe(149_460_000);
    expect(r.appliedRate).toBeCloseTo(0.40); // R12 회귀 가드 (taxBase 438.5M → 40% 구간)
    expect(r.notes).toContain("single-house-fail-live"); // R14 회귀 가드 (dead notes 활성화)
  });

  it("#10 양도차손 → loss → 0", () => {
    const r = calculateTransferTax({
      ...base, transferWon: 500_000_000, acquisitionWon: 550_000_000, expensesWon: 10_000_000,
      holdYears: 5, livedYears: 3, houses: 1,
    });
    expect(r.branch).toBe("loss");
    expect(r.totalTax).toBe(0);
  });

  it("#11 미등기 → 343,000,000원 (장특공·기본공제 모두 배제)", () => {
    const r = calculateTransferTax({
      ...base, transferWon: 1_000_000_000, acquisitionWon: 500_000_000, expensesWon: 10_000_000,
      holdYears: 5, livedYears: 3, houses: 1, isUnregistered: true,
    });
    expect(r.branch).toBe("unregistered");
    expect(r.totalTax).toBe(343_000_000);
    expect(r.notes).toContain("unregistered-70"); // R11 회귀 가드
  });

  it("#12 1주택 보유 1.99y (비과세 라인 탈락) → 단기60% 292,500,000원", () => {
    const r = calculateTransferTax({
      ...base, transferWon: 1_000_000_000, acquisitionWon: 500_000_000, expensesWon: 10_000_000,
      holdYears: 1.99, livedYears: 2, houses: 1,
    });
    expect(r.branch).toBe("general");
    expect(r.totalTax).toBe(292_500_000);
  });

  it("#13 12억 초과 + 보유 2.5y (표2 자격 미달, 표1 폴백) → 378,810,000원", () => {
    const r = calculateTransferTax({
      ...base, transferWon: 1_500_000_000, acquisitionWon: 500_000_000, expensesWon: 10_000_000,
      holdYears: 2.5, livedYears: 2.5, houses: 1,
      isRegulatedAtTransfer: true, isRegulatedAtAcquisition: true,
    });
    expect(r.branch).toBe("general");
    expect(r.totalTax).toBe(378_810_000);
    expect(r.appliedRate).toBeCloseTo(0.42); // R12 회귀 가드 (taxBase 987.5M → 42% 구간)
  });

  it("#14 미등기 + 다주택 → unregistered 우선 343,000,000원", () => {
    const r = calculateTransferTax({
      ...base, transferWon: 1_000_000_000, acquisitionWon: 500_000_000, expensesWon: 10_000_000,
      holdYears: 5, livedYears: 3, houses: 3, isUnregistered: true,
      isRegulatedAtTransfer: true, isRegulatedAtAcquisition: true,
    });
    expect(r.branch).toBe("unregistered");
    expect(r.totalTax).toBe(343_000_000);
  });

  it("#15 양도가 = 12억 정확히 (1주택) → 비과세 0", () => {
    const r = calculateTransferTax({
      ...base, transferWon: 1_200_000_000, acquisitionWon: 500_000_000, expensesWon: 20_000_000,
      holdYears: 5, livedYears: 3, houses: 1,
      isRegulatedAtTransfer: true, isRegulatedAtAcquisition: true,
    });
    expect(r.branch).toBe("single-house-exempt");
    expect(r.totalTax).toBe(0);
  });

  it("#16 R14 신규: 1주택 보유 1.5y (보유 미달) → single-house-fail-hold notes 활성화", () => {
    const r = calculateTransferTax({
      ...base, transferWon: 1_000_000_000, acquisitionWon: 500_000_000, expensesWon: 10_000_000,
      holdYears: 1.5, livedYears: 0, houses: 1,
    });
    expect(r.branch).toBe("general");
    expect(r.notes).toContain("single-house-fail-hold"); // R14 회귀 가드 (dead notes 활성화)
  });
});

describe("진입점 가드 + edge", () => {
  it("amountWon 0 → EMPTY_RESULT", () => {
    const r = calculateTransferTax({ ...base, transferWon: 0, acquisitionWon: 0 });
    expect(r).toEqual(EMPTY_RESULT);
  });

  it("acquisitionWon 0 (transfer 있어도) → EMPTY_RESULT", () => {
    const r = calculateTransferTax({ ...base, transferWon: 1_000_000_000, acquisitionWon: 0 });
    expect(r).toEqual(EMPTY_RESULT);
  });

  it("Infinity 양도가 → EMPTY_RESULT (validateAmount)", () => {
    const r = calculateTransferTax({ ...base, transferWon: Infinity, acquisitionWon: 500_000_000 });
    expect(r).toEqual(EMPTY_RESULT);
  });

  it("음수 양도가 → EMPTY_RESULT", () => {
    const r = calculateTransferTax({ ...base, transferWon: -1, acquisitionWon: 500_000_000 });
    expect(r).toEqual(EMPTY_RESULT);
  });

  it("양도일 정확히 2026-05-09 → 한시배제 적용 (≤ 비교)", () => {
    const r = calculateTransferTax({
      ...base, transferWon: 1_200_000_000, acquisitionWon: 500_000_000, expensesWon: 10_000_000,
      holdYears: 5, livedYears: 3, houses: 2,
      isRegulatedAtTransfer: true, isRegulatedAtAcquisition: true,
      transferDate: "2026-05-09",
    });
    expect(r.appliedTable).toBe("table1");
    expect(r.surchargeTax).toBe(0);
  });

  it("force-exclude override → 한시배제 강제 (날짜 무관)", () => {
    const r = calculateTransferTax({
      ...base, transferWon: 1_200_000_000, acquisitionWon: 500_000_000, expensesWon: 10_000_000,
      holdYears: 5, livedYears: 3, houses: 2,
      isRegulatedAtTransfer: true, isRegulatedAtAcquisition: true,
      transferDate: "2027-01-01", exemptionOverride: "force-exclude",
    });
    expect(r.surchargeTax).toBe(0);
  });

  it("force-apply override → 본래 중과 강제 (한시배제 무시)", () => {
    const r = calculateTransferTax({
      ...base, transferWon: 1_200_000_000, acquisitionWon: 500_000_000, expensesWon: 10_000_000,
      holdYears: 5, livedYears: 3, houses: 2,
      isRegulatedAtTransfer: true, isRegulatedAtAcquisition: true,
      transferDate: "2026-04-01", exemptionOverride: "force-apply",
    });
    expect(r.surchargeTax).toBeGreaterThan(0);
    expect(r.longTermDeduction).toBe(0);
  });
});
