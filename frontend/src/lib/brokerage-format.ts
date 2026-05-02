/**
 * 중개수수료 계산기 결과 빌더 — buildResult 헬퍼와 포맷 유틸
 * brokerage.ts 의 100줄 룰 준수를 위해 분리.
 */

import type { BrokerageBracket } from "./brokerage-brackets";

export const fmt = (won: number): string => `${Math.round(won / 10_000).toLocaleString()}만`;
export const pct = (rate: number): string => `${(rate * 100).toFixed(1)}%`;

export const bracketLabelText = (b: BrokerageBracket): string => {
  const minLabel = b.min === 0 ? "0" : fmt(b.min);
  const maxLabel = b.max === Infinity ? "이상" : `${fmt(b.max)} 미만`;
  const capLabel = b.cap == null ? "한도 없음" : `한도 ${fmt(b.cap)}원`;
  return `${minLabel} ~ ${maxLabel}, ${pct(b.rate)}, ${capLabel}`;
};

export interface BuildResultInput {
  amount: number;
  conversionFormula?: string;
  bracket: BrokerageBracket | null;
  bracketLabel: string;
  rate: number;
  cap: number | null;
  taxType: "general" | "simplified";
  isNegotiable: boolean;
  rateNote?: string;
}

export interface BuiltResult {
  rawFee: number;
  capApplied: boolean;
  feeBeforeTax: number;
  vat: number;
  total: number;
  formulaSteps: string[];
}

export function buildResult(opts: BuildResultInput): BuiltResult {
  const rawFee = Math.floor(opts.amount * opts.rate);
  const capApplied = opts.cap != null && rawFee > opts.cap;
  const feeBeforeTax = capApplied ? opts.cap! : rawFee;
  const vat = opts.taxType === "general" ? Math.floor(feeBeforeTax * 0.1) : 0;
  const total = feeBeforeTax + vat;
  const steps = [
    opts.conversionFormula ? `환산금액: ${opts.conversionFormula}` : `거래금액: ${fmt(opts.amount)}원`,
    `적용 구간: ${opts.bracketLabel}`,
    `수수료: ${fmt(opts.amount)} × ${pct(opts.rate)} = ${fmt(rawFee)}원${opts.rateNote ?? ""}`,
  ];
  if (opts.cap != null) {
    steps.push(capApplied
      ? `한도 적용: ${fmt(rawFee)} > ${fmt(opts.cap)} → ${fmt(opts.cap)}원`
      : `한도 비적용: ${fmt(rawFee)} ≤ ${fmt(opts.cap)}`);
  }
  steps.push(opts.taxType === "general" ? `부가세(10%): ${fmt(vat)}원` : `부가세: 간이과세 면제`);
  steps.push(`합계: ${fmt(total)}원`);
  return { rawFee, capApplied, feeBeforeTax, vat, total, formulaSteps: steps };
}
