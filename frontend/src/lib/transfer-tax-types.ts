/**
 * 양도소득세 계산 타입 정의 (소득세법 §95② + §104, 2026 기준).
 * 9 권위 출처 교차검증 (법제처 §95② 본문 + 국세청 표 + 흠택스 + 세무회계해온 + KB금융
 * + 한경 기사 + 부동산뱅크 표 + 조세심판원 조심2024인3295 + 정부 한시배제 발표).
 */

export type TransferBranch =
  | "empty" | "loss" | "unregistered"
  | "single-house-exempt" | "single-house-prorate" | "general";

export type TransferAppliedTable = "table1" | "table2" | "none";
export type TransferExemptionOverride = "auto" | "force-exclude" | "force-apply";

export type TransferNoticeKey =
  | "disclaimer" | "out-of-scope" | "loss-no-tax" | "unregistered-70"
  | "single-house-exempt-met" | "single-house-prorate"
  | "single-house-fail-hold" | "single-house-fail-live"
  | "short-term-70" | "short-term-60"
  | "multi-heavy-suspended" | "multi-heavy-applied"
  | "local-income-tax" | "four-district-grace" | "relief-rental-house";

export interface TransferInput {
  transferWon: number;
  acquisitionWon: number;
  expensesWon: number;
  acquisitionDate: string;
  transferDate: string;
  holdYears: number;
  livedYears: number;
  houses: 1 | 2 | 3;
  isRegulatedAtTransfer: boolean;
  isRegulatedAtAcquisition: boolean;
  areaM2: number;
  isUnregistered: boolean;
  exemptionOverride: TransferExemptionOverride;
}

export interface TransferResult {
  branch: TransferBranch;
  gain: number;
  taxableGain: number;
  longTermDeduction: number;
  taxBase: number;
  baseTax: number;
  surchargeTax: number;
  totalTax: number;
  effectiveRate: number;
  appliedTable: TransferAppliedTable;
  appliedRate: number;
  notes: TransferNoticeKey[];
}

export const EMPTY_RESULT: TransferResult = {
  branch: "empty",
  gain: 0, taxableGain: 0, longTermDeduction: 0, taxBase: 0,
  baseTax: 0, surchargeTax: 0, totalTax: 0, effectiveRate: 0,
  appliedTable: "none", appliedRate: 0, notes: ["disclaimer"],
};
