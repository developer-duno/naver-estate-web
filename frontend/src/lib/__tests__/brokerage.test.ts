/**
 * 중개수수료 계산 테스트 — 함정 4건 + 일반 케이스
 * 시행규칙 별표1 (2021.10.19 개정), 1차 소스 4곳 교차검증
 */
import { describe, it, expect } from "vitest";
import { calculateBrokerageFee, type BrokerageInput } from "../brokerage";

const base: BrokerageInput = {
  tradeType: "sale", propertyType: "house", amountWon: 0, taxType: "general",
};

describe("calculateBrokerageFee — 함정 1: 구간 경계 (이상~미만)", () => {
  it("정확히 5천만원 매매 → 0.5% 구간(5천만~2억), 한도 80만 적용 안 됨", () => {
    const r = calculateBrokerageFee({ ...base, amountWon: 50_000_000 });
    expect(r.bracket?.rate).toBe(0.005);
    expect(r.feeBeforeTax).toBe(250_000); // 5천만 × 0.5% = 25만
  });
  it("4,999만원 매매 → 0.6% 구간, 한도 25만 적용", () => {
    const r = calculateBrokerageFee({ ...base, amountWon: 49_990_000 });
    expect(r.bracket?.rate).toBe(0.006);
    expect(r.feeBeforeTax).toBe(250_000); // 0.6% = 29.9만 > 한도 25만
  });
  it("정확히 2억 매매 → 0.4% 구간(2억~9억), 한도 없음", () => {
    const r = calculateBrokerageFee({ ...base, amountWon: 200_000_000 });
    expect(r.bracket?.rate).toBe(0.004);
    expect(r.bracket?.cap).toBeNull();
  });
});

describe("calculateBrokerageFee — 함정 2: 매매 vs 임대 두 번째 경계", () => {
  it("매매 1억5천 → 0.5% 구간(5천~2억)", () => {
    const r = calculateBrokerageFee({ ...base, amountWon: 150_000_000 });
    expect(r.bracket?.rate).toBe(0.005);
  });
  it("임대 1억5천 → 0.3% 구간(1억~6억)", () => {
    const r = calculateBrokerageFee({ ...base, tradeType: "lease", amountWon: 150_000_000 });
    expect(r.bracket?.rate).toBe(0.003);
  });
  it("동일 1억 입력 — 매매(0.5%) vs 임대(0.3%) 다른 구간", () => {
    const sale = calculateBrokerageFee({ ...base, amountWon: 100_000_000 });
    const lease = calculateBrokerageFee({ ...base, tradeType: "lease", amountWon: 100_000_000 });
    expect(sale.bracket?.rate).toBe(0.005);
    expect(lease.bracket?.rate).toBe(0.003);
  });
});

describe("calculateBrokerageFee — 함정 3: 5천만 미만 한도 차이", () => {
  it("매매 3천만 × 0.6% = 18만 → 한도 25만보다 작음 → 18만", () => {
    const r = calculateBrokerageFee({ ...base, amountWon: 30_000_000 });
    expect(r.feeBeforeTax).toBe(180_000);
    expect(r.capApplied).toBe(false);
  });
  it("매매 4,500만 × 0.6% = 27만 → 한도 25만 적용 → 25만", () => {
    const r = calculateBrokerageFee({ ...base, amountWon: 45_000_000 });
    expect(r.feeBeforeTax).toBe(250_000);
    expect(r.capApplied).toBe(true);
  });
  it("임대 3천만 × 0.5% = 15만 → 한도 20만보다 작음 → 15만", () => {
    const r = calculateBrokerageFee({ ...base, tradeType: "lease", amountWon: 30_000_000 });
    expect(r.feeBeforeTax).toBe(150_000);
    expect(r.capApplied).toBe(false);
  });
  it("임대 4,500만 × 0.5% = 22.5만 → 한도 20만 적용 → 20만", () => {
    const r = calculateBrokerageFee({ ...base, tradeType: "lease", amountWon: 45_000_000 });
    expect(r.feeBeforeTax).toBe(200_000);
    expect(r.capApplied).toBe(true);
  });
});

describe("calculateBrokerageFee — 함정 4: 월세 환산 (1차 결과 기준)", () => {
  it("보증금 1천만 + 월세 30만 → 1차 4천만 < 5천만 → ×70 재적용 = 3,100만", () => {
    const r = calculateBrokerageFee({ ...base, tradeType: "monthly", deposit: 10_000_000, monthlyRent: 300_000 });
    expect(r.convertedAmount).toBe(31_000_000);
  });
  it("보증금 2천만 + 월세 50만 → 1차 7천만 ≥ 5천만 → 7천만 유지", () => {
    const r = calculateBrokerageFee({ ...base, tradeType: "monthly", deposit: 20_000_000, monthlyRent: 500_000 });
    expect(r.convertedAmount).toBe(70_000_000);
  });
  it("보증금 6천만, 월세 0 → 환산식 없이 6천만", () => {
    const r = calculateBrokerageFee({ ...base, tradeType: "monthly", deposit: 60_000_000, monthlyRent: 0 });
    expect(r.convertedAmount).toBe(60_000_000);
  });
  it("월세 환산 후 임대 요율표 적용 (매매 아님) — 1억환산은 임대 0.3%", () => {
    const r = calculateBrokerageFee({ ...base, tradeType: "monthly", deposit: 50_000_000, monthlyRent: 500_000 });
    expect(r.convertedAmount).toBe(100_000_000);
    expect(r.bracket?.rate).toBe(0.003);
  });
});

describe("calculateBrokerageFee — 일반 케이스", () => {
  it("주택 매매 5억 → 0.4% × 5억 = 200만, 부가세 일반 → 220만", () => {
    const r = calculateBrokerageFee({ ...base, amountWon: 500_000_000 });
    expect(r.feeBeforeTax).toBe(2_000_000);
    expect(r.vat).toBe(200_000);
    expect(r.total).toBe(2_200_000);
  });
  it("주택 임대 7억 → 0.4% × 7억 = 280만 (6억~12억)", () => {
    const r = calculateBrokerageFee({ ...base, tradeType: "lease", amountWon: 700_000_000, taxType: "simplified" });
    expect(r.bracket?.rate).toBe(0.004);
    expect(r.feeBeforeTax).toBe(2_800_000);
  });
  it("간이과세 → vat=0, total=fee", () => {
    const r = calculateBrokerageFee({ ...base, amountWon: 500_000_000, taxType: "simplified" });
    expect(r.vat).toBe(0);
    expect(r.total).toBe(r.feeBeforeTax);
  });
  it("일반과세 → vat = fee × 0.1", () => {
    const r = calculateBrokerageFee({ ...base, amountWon: 500_000_000 });
    expect(r.vat).toBe(Math.floor(r.feeBeforeTax * 0.1));
  });
  it("오피스텔 주거용 매매 5억 → 0.5% × 5억 = 250만 (정률)", () => {
    const r = calculateBrokerageFee({ ...base, propertyType: "officetel-residential", amountWon: 500_000_000 });
    expect(r.feeBeforeTax).toBe(2_500_000);
    expect(r.bracket?.cap).toBeNull();
  });
  it("오피스텔 비주거 → isNegotiable=true, 0.9% 참고치", () => {
    const r = calculateBrokerageFee({ ...base, propertyType: "officetel-non-residential", amountWon: 500_000_000 });
    expect(r.isNegotiable).toBe(true);
    expect(r.feeBeforeTax).toBe(4_500_000);
  });
  it("주택 외(토지·상가) → isNegotiable=true, 0.9% 참고치", () => {
    const r = calculateBrokerageFee({ ...base, tradeType: "non-residential", amountWon: 500_000_000 });
    expect(r.isNegotiable).toBe(true);
    expect(r.feeBeforeTax).toBe(4_500_000);
  });
  it("formulaSteps에 적용구간·요율·부가세·합계 포함", () => {
    const r = calculateBrokerageFee({ ...base, amountWon: 500_000_000 });
    expect(r.formulaSteps.some((s) => s.includes("적용 구간"))).toBe(true);
    expect(r.formulaSteps.some((s) => s.includes("부가세"))).toBe(true);
    expect(r.formulaSteps.some((s) => s.includes("합계"))).toBe(true);
  });
  it("0/음수 입력 → total 0, bracket null", () => {
    expect(calculateBrokerageFee({ ...base, amountWon: 0 }).total).toBe(0);
    expect(calculateBrokerageFee({ ...base, amountWon: -1 }).bracket).toBeNull();
  });
  it("Infinity 입력 → total 0 (validateAmount)", () => {
    const r = calculateBrokerageFee({ ...base, amountWon: Infinity });
    expect(r.total).toBe(0);
    expect(r.bracket).toBeNull();
  });
  it("1조원 초과 입력 → total 0 (validateAmount MAX_AMOUNT_WON)", () => {
    const r = calculateBrokerageFee({ ...base, amountWon: 2_000_000_000_000 });
    expect(r.total).toBe(0);
    expect(r.bracket).toBeNull();
  });
});
