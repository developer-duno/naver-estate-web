/**
 * 후순위 담보대출 한도·이자 계산 시험(세션 508)
 * 한도 = max(0, 시세 × 비율 − 남은 대출) · 매달 이자 = 한도 × 연 이자율 ÷ 12 (금액은 원)
 * 실행: npx vitest run src/lib/__tests__/second-mortgage.test.ts
 */
import { describe, it, expect } from "vitest";
import {
  calcSecondMortgage,
  formatWonKorean,
  parseAmount,
  type SecondMortgageInput,
} from "../second-mortgage";

// 시험 입력 팩토리 — 시세 5억 · 남은 대출 2억 · 70% · 연 6%
const input = (over: Partial<SecondMortgageInput> = {}): SecondMortgageInput => ({
  priceWon: 500_000_000,
  debtWon: 200_000_000,
  ltvPct: 70,
  ratePct: 6,
  ...over,
});

describe("calcSecondMortgage — 정상", () => {
  it("5억 × 70% − 2억 = 1억 5천만 · 이자 = 1억 5천만 × 6% ÷ 12 = 75만", () => {
    expect(calcSecondMortgage(input())).toEqual({ status: "ok", limitWon: 150_000_000, monthlyInterestWon: 750_000 });
  });
  it("남은 대출이 0 이면 시세 × 비율 전부가 한도", () => {
    const r = calcSecondMortgage(input({ debtWon: 0, ltvPct: 60 }));
    expect(r).toEqual({ status: "ok", limitWon: 300_000_000, monthlyInterestWon: 1_500_000 });
  });
  it("비율을 직접 넣은 소수(65.5%)도 계산한다", () => {
    const r = calcSecondMortgage(input({ ltvPct: 65.5 }));
    expect(r).toEqual({ status: "ok", limitWon: 127_500_000, monthlyInterestWon: 637_500 });
  });
});

describe("calcSecondMortgage — 한도 0 이하", () => {
  it("남은 대출이 시세 × 비율보다 크면 한도 0 · 이자 0", () => {
    expect(calcSecondMortgage(input({ debtWon: 400_000_000 }))).toEqual({
      status: "ok", limitWon: 0, monthlyInterestWon: 0,
    });
  });
  it("딱 같으면 0", () => {
    const r = calcSecondMortgage(input({ debtWon: 350_000_000 }));
    expect(r).toEqual({ status: "ok", limitWon: 0, monthlyInterestWon: 0 });
  });
});

describe("calcSecondMortgage — 빈 입력·잘못된 입력", () => {
  it.each([
    ["시세", { priceWon: null }],
    ["남은 대출", { debtWon: null }],
    ["비율", { ltvPct: null }],
    ["이자율", { ratePct: null }],
    ["시세 0", { priceWon: 0 }],
    ["남은 대출 음수", { debtWon: -1 }],
    ["이자율 음수", { ratePct: -1 }],
    ["숫자 아님", { priceWon: Number.NaN }],
  ])("%s 이(가) 비면 계산하지 않는다", (_label, over) => {
    expect(calcSecondMortgage(input(over as Partial<SecondMortgageInput>))).toEqual({ status: "incomplete" });
  });
  it("비율이 0 이하이거나 100 을 넘으면 invalid-ltv", () => {
    expect(calcSecondMortgage(input({ ltvPct: 0 }))).toEqual({ status: "invalid-ltv" });
    expect(calcSecondMortgage(input({ ltvPct: 120 }))).toEqual({ status: "invalid-ltv" });
  });
  it("비율 100 은 계산한다", () => {
    expect(calcSecondMortgage(input({ ltvPct: 100 }))).toMatchObject({ status: "ok", limitWon: 300_000_000 });
  });
});

describe("calcSecondMortgage — 소수 이자율·큰 수", () => {
  it("연 4.35% — 1억 5천만 × 4.35% ÷ 12 = 543,750", () => {
    expect(calcSecondMortgage(input({ ratePct: 4.35 }))).toMatchObject({ monthlyInterestWon: 543_750 });
  });
  it("이자가 원 아래로 떨어지면 반올림(1원 단위)", () => {
    // 한도 1,000,001원 × 5% ÷ 12 = 4166.67 → 4167
    const r = calcSecondMortgage({ priceWon: 1_000_001, debtWon: 0, ltvPct: 100, ratePct: 5 });
    expect(r).toEqual({ status: "ok", limitWon: 1_000_001, monthlyInterestWon: 4_167 });
  });
  it("시세 300억 · 80% · 남은 대출 10억 → 230억, 이자 연 7.5% 월 1억 4,375만", () => {
    const r = calcSecondMortgage({ priceWon: 30_000_000_000, debtWon: 1_000_000_000, ltvPct: 80, ratePct: 7.5 });
    expect(r).toEqual({ status: "ok", limitWon: 23_000_000_000, monthlyInterestWon: 143_750_000 });
  });
});

describe("parseAmount · formatWonKorean", () => {
  it("쉼표를 지우고 빈칸은 null", () => {
    expect(parseAmount("500,000,000")).toBe(500_000_000);
    expect(parseAmount(" ")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("4.5")).toBe(4.5);
  });
  it("억·만 단위로 적는다", () => {
    expect(formatWonKorean(150_000_000)).toBe("1억 5,000만원");
    expect(formatWonKorean(300_000_000)).toBe("3억원");
    expect(formatWonKorean(750_000)).toBe("75만원");
    expect(formatWonKorean(5_000)).toBe("5,000원");
    expect(formatWonKorean(0)).toBe("0원");
  });
});
