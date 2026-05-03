/**
 * 양도세 6분기 branch 함수 (loss/unregistered/single-exempt/single-prorate/general).
 * 메인 진입점 transfer-tax.ts 100줄 룰 회피용 분리. 산식 상수는 transfer-brackets.
 */

import {
  type TransferInput, type TransferResult, type TransferNoticeKey,
  EMPTY_RESULT,
} from "./transfer-tax-types";
import {
  applyProgressive, computeTable1Deduction, computeTable2Deduction,
  PROGRESSIVE_BRACKETS,
  SHORT_TERM_UNDER_1Y, SHORT_TERM_1Y_TO_2Y,
  HIGH_VALUE_THRESHOLD, BASIC_DEDUCTION,
} from "./transfer-brackets";

function buildResult(over: Partial<TransferResult>): TransferResult {
  const merged = { ...EMPTY_RESULT, ...over } as TransferResult;
  merged.effectiveRate = merged.gain > 0 ? merged.totalTax / merged.gain : 0;
  return merged;
}

export function lossBranch(): TransferResult {
  return buildResult({ branch: "loss", notes: ["disclaimer", "out-of-scope", "loss-no-tax"] });
}

export function unregisteredBranch(gain: number): TransferResult {
  // 미등기: 70% 단독, 장특공·기본공제 모두 배제 (소득세법 §104①).
  const taxBase = gain;
  const baseTax = Math.floor(taxBase * 0.70);
  return buildResult({
    branch: "unregistered", gain, taxableGain: gain, taxBase,
    baseTax, totalTax: baseTax, appliedRate: 0.70,
    notes: ["disclaimer", "unregistered-70"],
  });
}

export function singleHouseExemptBranch(gain: number): TransferResult {
  return buildResult({
    branch: "single-house-exempt", gain, taxableGain: 0,
    notes: ["disclaimer", "single-house-exempt-met"],
  });
}

export function singleHouseProrateBranch(input: TransferInput, gain: number): TransferResult {
  // 12억 안분: gain × (transferWon - 12억) / transferWon.
  const taxableGain = Math.floor(gain * (input.transferWon - HIGH_VALUE_THRESHOLD) / input.transferWon);
  const longTermDeduction = computeTable2Deduction(input.holdYears, input.livedYears, taxableGain);
  const taxBase = Math.max(0, taxableGain - longTermDeduction - BASIC_DEDUCTION);
  const baseTax = Math.floor(applyProgressive(taxBase));
  const appliedRate = PROGRESSIVE_BRACKETS.find((b) => taxBase <= b.max)?.rate ?? 0;
  return buildResult({
    branch: "single-house-prorate", gain, taxableGain, longTermDeduction, taxBase,
    baseTax, totalTax: baseTax, appliedTable: "table2", appliedRate,
    notes: ["disclaimer", "single-house-prorate", "local-income-tax"],
  });
}

export function generalBranch(input: TransferInput, gain: number, shortRate: number, heavyAddRate: number): TransferResult {
  // 단기·중과 시 장특공 미적용 (§95② 단서 + §104⑦). 한시배제 시 표1 적용 가능.
  const longTermDeduction = (shortRate > 0 || heavyAddRate > 0)
    ? 0
    : computeTable1Deduction(input.holdYears, gain);
  const taxBase = Math.max(0, gain - longTermDeduction - BASIC_DEDUCTION);
  const progressiveTax = applyProgressive(taxBase);
  const surchargeTax = Math.floor(taxBase * heavyAddRate);
  const shortTax = taxBase * shortRate;
  // 단기·중과 경합 → max (소득세법 §104① 단서).
  const finalTax = (shortRate > 0 && heavyAddRate > 0)
    ? Math.max(progressiveTax + surchargeTax, shortTax)
    : (shortRate > 0) ? shortTax
    : progressiveTax + surchargeTax;
  const baseTax = Math.floor(finalTax);
  const notes: TransferNoticeKey[] = ["disclaimer"];
  if (shortRate === SHORT_TERM_UNDER_1Y) notes.push("short-term-70");
  else if (shortRate === SHORT_TERM_1Y_TO_2Y) notes.push("short-term-60");
  if (input.houses >= 2 && input.isRegulatedAtTransfer) {
    notes.push(heavyAddRate > 0 ? "multi-heavy-applied" : "multi-heavy-suspended");
  }
  if (baseTax > 0) notes.push("local-income-tax");
  // R12: 누진 일반 케이스 progressiveRate fallback (singleHouseProrateBranch L51 패턴 답습).
  const progressiveRate = PROGRESSIVE_BRACKETS.find((b) => taxBase <= b.max)?.rate ?? 0;
  return buildResult({
    branch: "general", gain, taxableGain: gain, longTermDeduction, taxBase,
    baseTax, surchargeTax: heavyAddRate > 0 ? surchargeTax : 0, totalTax: baseTax,
    appliedTable: longTermDeduction > 0 ? "table1" : "none",
    appliedRate: shortRate > 0 ? shortRate : (heavyAddRate > 0 ? heavyAddRate : 0) || progressiveRate,
    notes,
  });
}
