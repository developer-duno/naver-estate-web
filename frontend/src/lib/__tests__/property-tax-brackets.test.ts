/**
 * 보유세 세율표·헬퍼 단위 테스트.
 * 권위 출처: 국세청 PDF 16개 (정확값 박제, 추측 0건).
 */

import { describe, it, expect } from "vitest";
import {
  PROPERTY_TAX_BRACKETS_SINGLE,
  PROPERTY_TAX_BRACKETS_GENERAL,
  COMPREHENSIVE_BRACKETS_2,
  COMPREHENSIVE_BRACKETS_3,
  applyBracket,
  ageDeductionRate,
  holdDeductionRate,
  totalCreditRate,
  FAIR_MARKET_RATIO,
  SINGLE_HOUSE_DEDUCTION,
  GENERAL_DEDUCTION,
  RURAL_TAX_RATE,
} from "@/lib/property-tax-brackets";

describe("재산세 세율 (지방세법 §111)", () => {
  it("1세대1주택 9억 이하 특례 4구간 정확값", () => {
    expect(PROPERTY_TAX_BRACKETS_SINGLE[0]).toEqual({ max: 60_000_000, rate: 0.0005, deduction: 0 });
    expect(PROPERTY_TAX_BRACKETS_SINGLE[1]).toEqual({ max: 150_000_000, rate: 0.001, deduction: 30_000 });
    expect(PROPERTY_TAX_BRACKETS_SINGLE[2]).toEqual({ max: 300_000_000, rate: 0.002, deduction: 180_000 });
    expect(PROPERTY_TAX_BRACKETS_SINGLE[3].rate).toBe(0.0035);
    expect(PROPERTY_TAX_BRACKETS_SINGLE[3].deduction).toBe(630_000);
  });

  it("일반(다주택) 4구간 정확값", () => {
    expect(PROPERTY_TAX_BRACKETS_GENERAL[0]).toEqual({ max: 60_000_000, rate: 0.001, deduction: 0 });
    expect(PROPERTY_TAX_BRACKETS_GENERAL[1].rate).toBe(0.0015);
    expect(PROPERTY_TAX_BRACKETS_GENERAL[2].rate).toBe(0.0025);
    expect(PROPERTY_TAX_BRACKETS_GENERAL[3].rate).toBe(0.004);
  });
});

describe("종부세 세율 (종부세법 §8 §9)", () => {
  it("개인 2주택 이하 7구간 정확값 (PDF 세액계산 흐름도)", () => {
    expect(COMPREHENSIVE_BRACKETS_2[0]).toEqual({ max: 300_000_000, rate: 0.005, deduction: 0 });
    expect(COMPREHENSIVE_BRACKETS_2[1].deduction).toBe(600_000);
    expect(COMPREHENSIVE_BRACKETS_2[2].deduction).toBe(2_400_000);
    expect(COMPREHENSIVE_BRACKETS_2[3]).toEqual({ max: 2_500_000_000, rate: 0.013, deduction: 6_000_000 });
    expect(COMPREHENSIVE_BRACKETS_2[4]).toEqual({ max: 5_000_000_000, rate: 0.015, deduction: 11_000_000 });
    expect(COMPREHENSIVE_BRACKETS_2[5]).toEqual({ max: 9_400_000_000, rate: 0.020, deduction: 36_000_000 });
    expect(COMPREHENSIVE_BRACKETS_2[6].rate).toBe(0.027);
    expect(COMPREHENSIVE_BRACKETS_2[6].deduction).toBe(101_800_000);
  });

  it("개인 3주택 이상 7구간 — 25억 초과부터 중과 분기", () => {
    // 12억 이하까지 동일
    expect(COMPREHENSIVE_BRACKETS_3[0]).toEqual({ max: 300_000_000, rate: 0.005, deduction: 0 });
    expect(COMPREHENSIVE_BRACKETS_3[2].rate).toBe(0.010);
    // 25억 이하부터 중과
    expect(COMPREHENSIVE_BRACKETS_3[3]).toEqual({ max: 2_500_000_000, rate: 0.020, deduction: 14_400_000 });
    expect(COMPREHENSIVE_BRACKETS_3[4]).toEqual({ max: 5_000_000_000, rate: 0.030, deduction: 39_400_000 });
    expect(COMPREHENSIVE_BRACKETS_3[5]).toEqual({ max: 9_400_000_000, rate: 0.040, deduction: 89_400_000 });
    expect(COMPREHENSIVE_BRACKETS_3[6].rate).toBe(0.050);
    expect(COMPREHENSIVE_BRACKETS_3[6].deduction).toBe(183_400_000);
  });
});

describe("핵심 상수 (PDF 박제)", () => {
  it("공정시장가액비율 60% (종부세 주택분, 2026)", () => {
    expect(FAIR_MARKET_RATIO).toBe(0.60);
  });
  it("종부세 공제: 1세대1주택 12억 / 일반 9억", () => {
    expect(SINGLE_HOUSE_DEDUCTION).toBe(1_200_000_000);
    expect(GENERAL_DEDUCTION).toBe(900_000_000);
  });
  it("농어촌특별세 = 종부세액의 20%", () => {
    expect(RURAL_TAX_RATE).toBe(0.20);
  });
});

describe("applyBracket — 누진세 계산", () => {
  it("0 또는 음수 → 0", () => {
    expect(applyBracket(0, COMPREHENSIVE_BRACKETS_2)).toEqual({ tax: 0, rate: 0 });
    expect(applyBracket(-1000, COMPREHENSIVE_BRACKETS_2)).toEqual({ tax: 0, rate: 0 });
  });

  it("종부세 2주택 이하 5억 → 5e8 × 0.7% - 60만 = 290만", () => {
    const r = applyBracket(500_000_000, COMPREHENSIVE_BRACKETS_2);
    expect(r.tax).toBe(2_900_000);
    expect(r.rate).toBe(0.007);
  });

  it("종부세 3주택 이상 30억 → 3e9 × 3.0% - 3940만 = 5060만", () => {
    const r = applyBracket(3_000_000_000, COMPREHENSIVE_BRACKETS_3);
    expect(r.tax).toBe(50_600_000);
    expect(r.rate).toBe(0.030);
  });

  it("재산세 1세대1주택 특례 5억 (3억 초과) → 5e8 × 0.35% - 63만 = 112만", () => {
    const r = applyBracket(500_000_000, PROPERTY_TAX_BRACKETS_SINGLE);
    expect(r.tax).toBe(1_120_000);
    expect(r.rate).toBe(0.0035);
  });

  it("재산세 일반 5억 (3억 초과) → 5e8 × 0.4% - 63만 = 137만", () => {
    const r = applyBracket(500_000_000, PROPERTY_TAX_BRACKETS_GENERAL);
    expect(r.tax).toBe(1_370_000);
    expect(r.rate).toBe(0.004);
  });
});

describe("1세대1주택 세액공제율", () => {
  it("연령: 60세 20% / 65세 30% / 70세 40% / 미만 0", () => {
    expect(ageDeductionRate(59)).toBe(0);
    expect(ageDeductionRate(60)).toBe(0.20);
    expect(ageDeductionRate(64)).toBe(0.20);
    expect(ageDeductionRate(65)).toBe(0.30);
    expect(ageDeductionRate(69)).toBe(0.30);
    expect(ageDeductionRate(70)).toBe(0.40);
    expect(ageDeductionRate(85)).toBe(0.40);
  });

  it("보유: 5년 20% / 10년 40% / 15년 50% / 미만 0", () => {
    expect(holdDeductionRate(4)).toBe(0);
    expect(holdDeductionRate(5)).toBe(0.20);
    expect(holdDeductionRate(10)).toBe(0.40);
    expect(holdDeductionRate(15)).toBe(0.50);
    expect(holdDeductionRate(30)).toBe(0.50);
  });

  it("합산 한도 80% (70세 40 + 15년 50 = 90 → 80 캡)", () => {
    expect(totalCreditRate(70, 15)).toBe(0.80);
    expect(totalCreditRate(60, 5)).toBe(0.40);  // 20+20
    expect(totalCreditRate(65, 10)).toBe(0.70); // 30+40
    expect(totalCreditRate(50, 3)).toBe(0);     // 둘 다 미만
  });
});
