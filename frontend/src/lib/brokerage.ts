/**
 * 중개수수료 계산 진입점 (공인중개사법 시행규칙 별표1, 2021.10.19 개정)
 * 모든 금액은 원(KRW) 단위. UI에서 만원→원(×10000) 변환 후 호출.
 */

import {
  type BrokerageBracket,
  HOUSE_SALE_BRACKETS, HOUSE_LEASE_BRACKETS,
  OFFICETEL_RATE, NEGOTIABLE_MAX_RATE, MAX_AMOUNT_WON,
} from "./brokerage-brackets";
import { fmt, pct, bracketLabelText, buildResult } from "./brokerage-format";

export type { BrokerageBracket } from "./brokerage-brackets";
export { HOUSE_SALE_BRACKETS, HOUSE_LEASE_BRACKETS, OFFICETEL_RATE, NEGOTIABLE_MAX_RATE, MAX_AMOUNT_WON } from "./brokerage-brackets";

export type TradeType = "sale" | "lease" | "monthly" | "non-residential";
export type PropertyType = "house" | "officetel-residential" | "officetel-non-residential";
export type TaxType = "general" | "simplified";

export interface BrokerageInput {
  tradeType: TradeType;
  propertyType: PropertyType;
  amountWon: number;
  deposit?: number;
  monthlyRent?: number;
  taxType: TaxType;
}

export interface BrokerageResult {
  convertedAmount: number;
  conversionFormula?: string;
  bracket: BrokerageBracket | null;
  bracketLabel: string;
  rawFee: number;
  capApplied: boolean;
  feeBeforeTax: number;
  vat: number;
  total: number;
  isNegotiable: boolean;
  formulaSteps: string[];
}

export const validateAmount = (won: number): boolean =>
  won >= 0 && Number.isFinite(won) && won <= MAX_AMOUNT_WON;

export function convertMonthlyRentToAmount(deposit: number, monthly: number): { amount: number; formula: string } {
  if (monthly === 0) return { amount: deposit, formula: fmt(deposit) };
  const first = deposit + monthly * 100;
  if (first < 50_000_000) {
    const second = deposit + monthly * 70;
    return { amount: second, formula: `${fmt(deposit)} + ${fmt(monthly)}×70 = ${fmt(second)} (×100 결과 5천만 미만→×70 재적용)` };
  }
  return { amount: first, formula: `${fmt(deposit)} + ${fmt(monthly)}×100 = ${fmt(first)}` };
}

const findBracket = (brackets: BrokerageBracket[], amount: number) =>
  brackets.find((b) => amount >= b.min && amount < b.max) ?? null;

const empty: BrokerageResult = {
  convertedAmount: 0, bracket: null, bracketLabel: "", rawFee: 0, capApplied: false,
  feeBeforeTax: 0, vat: 0, total: 0, isNegotiable: false, formulaSteps: [],
};

export function calculateBrokerageFee(input: BrokerageInput): BrokerageResult {
  let amount = input.amountWon;
  let conversionFormula: string | undefined;
  if (input.tradeType === "monthly") {
    const conv = convertMonthlyRentToAmount(input.deposit ?? 0, input.monthlyRent ?? 0);
    amount = conv.amount;
    conversionFormula = conv.formula;
  }
  if (!validateAmount(amount) || amount === 0) return { ...empty, convertedAmount: amount, conversionFormula };

  const isNegotiable = input.propertyType === "officetel-non-residential" || input.tradeType === "non-residential";
  const isLease = input.tradeType !== "sale";

  if (isNegotiable) {
    const built = buildResult({
      amount, conversionFormula, bracket: null, bracketLabel: "협의형 (0.9% 이내 협상)",
      rate: NEGOTIABLE_MAX_RATE, cap: null, taxType: input.taxType, isNegotiable: true, rateNote: " (참고)",
    });
    return { convertedAmount: amount, conversionFormula, bracket: null, bracketLabel: "협의형 (0.9% 이내 협상)", isNegotiable: true, ...built };
  }
  if (input.propertyType === "officetel-residential") {
    const rate = isLease ? OFFICETEL_RATE.lease : OFFICETEL_RATE.sale;
    const bracketLabel = `오피스텔 주거용 ${isLease ? "임대" : "매매"}, ${pct(rate)}, 한도 없음`;
    const bracket = { min: 0, max: Infinity, rate, cap: null };
    const built = buildResult({ amount, conversionFormula, bracket, bracketLabel, rate, cap: null, taxType: input.taxType, isNegotiable: false });
    return { convertedAmount: amount, conversionFormula, bracket, bracketLabel, isNegotiable: false, ...built };
  }

  const brackets = isLease ? HOUSE_LEASE_BRACKETS : HOUSE_SALE_BRACKETS;
  const bracket = findBracket(brackets, amount);
  if (!bracket) return { ...empty, convertedAmount: amount, conversionFormula };
  const bracketLabel = bracketLabelText(bracket);
  const built = buildResult({ amount, conversionFormula, bracket, bracketLabel, rate: bracket.rate, cap: bracket.cap, taxType: input.taxType, isNegotiable: false });
  return { convertedAmount: amount, conversionFormula, bracket, bracketLabel, isNegotiable: false, ...built };
}
