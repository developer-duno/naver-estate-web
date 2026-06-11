/**
 * 취득세 계산 진입점 (지방세법 제11조/13조의2 + 지방세특례제한법 제36조의3 + 농특세법, 2026 기준).
 * 도메인 주의: 기존 매물 표시용 acquisition_tax (article.py / estate.ts) 와 별개의 신규 도구.
 * 매물 표시는 네이버 추정값 string, 본 도구는 사용자 입력 정확 계산 number.
 */

import type { AcquisitionInput, AcquisitionResult } from "./acquisition-types";
import { EMPTY_RESULT, NATIONAL_HOUSING_AREA_M2 } from "./acquisition-types";
import { validateAmount } from "./brokerage";
import { 표준세율, 중과세율, 농특세율, 교육세율, 생애최초가능, 감면액_원 } from "./acquisition-brackets";

// types re-export (brokerage 패턴) — 외부 import 경로 통일
export type { AcquisitionInput, AcquisitionResult, AcquisitionPropertyType, AcquisitionNoticeKey } from "./acquisition-types";
export { EMPTY_RESULT, NATIONAL_HOUSING_AREA_M2, DEFAULT_AREA_M2 } from "./acquisition-types";

export function calculateAcquisitionTax(input: AcquisitionInput): AcquisitionResult {
  if (!validateAmount(input.amountWon) || input.amountWon === 0) return EMPTY_RESULT;

  if (input.propertyType === "officetel-commercial") return officetelBranch(input);

  if (input.isFirstTime && input.amountWon > 1_200_000_000) {
    const std = standardBranch(input);
    return { ...std, branch: "first-time-rejected", notes: ["disclaimer", "first-time-rejected"] };
  }

  if (생애최초가능(input)) return firstTimeBranch(input);

  const heavyRate = 중과세율(input.houses, input.isRegulatedArea);
  if (heavyRate > 0) return multiHouseBranch(input, heavyRate);

  return standardBranch(input);
}

function standardBranch(input: AcquisitionInput): AcquisitionResult {
  const rate = 표준세율(input.amountWon);
  const baseTax = Math.floor(input.amountWon * rate);
  const ruralTax = Math.floor(input.amountWon * 농특세율(rate, input.area_m2, "standard"));
  const educationTax = Math.floor(input.amountWon * 교육세율(rate));
  return buildResult({ input, baseTax, exemption: 0, ruralTax, educationTax, rate, branch: "standard" });
}

function multiHouseBranch(input: AcquisitionInput, rate: number): AcquisitionResult {
  const baseTax = Math.floor(input.amountWon * rate);
  const ruralTax = Math.floor(input.amountWon * 농특세율(rate, input.area_m2, "multi-house"));
  const educationTax = Math.floor(input.amountWon * 교육세율(rate));
  return buildResult({ input, baseTax, exemption: 0, ruralTax, educationTax, rate, branch: "multi-house" });
}

function firstTimeBranch(input: AcquisitionInput): AcquisitionResult {
  const rate = 표준세율(input.amountWon);
  const baseTaxBeforeExemption = Math.floor(input.amountWon * rate);
  const exemption = Math.min(baseTaxBeforeExemption, 감면액_원);
  const ruralTax = Math.floor(input.amountWon * 농특세율(rate, input.area_m2, "standard"));
  const educationTax = Math.floor(input.amountWon * 교육세율(rate));
  return buildResult({ input, baseTax: baseTaxBeforeExemption, exemption, ruralTax, educationTax, rate, branch: "first-time" });
}

function officetelBranch(input: AcquisitionInput): AcquisitionResult {
  const rate = 0.04;
  const baseTax = Math.floor(input.amountWon * rate);
  const ruralTax = Math.floor(input.amountWon * 농특세율(rate, input.area_m2, "officetel"));
  const educationTax = Math.floor(input.amountWon * 교육세율(rate));
  return buildResult({ input, baseTax, exemption: 0, ruralTax, educationTax, rate, branch: "officetel" });
}

function buildResult(opts: {
  input: AcquisitionInput;
  baseTax: number;
  exemption: number;
  ruralTax: number;
  educationTax: number;
  rate: number;
  branch: AcquisitionResult["branch"];
}): AcquisitionResult {
  const total = opts.baseTax - opts.exemption + opts.ruralTax + opts.educationTax;
  const effectiveRate = opts.input.amountWon > 0 ? total / opts.input.amountWon : 0;

  const notes: AcquisitionResult["notes"] = ["disclaimer"];
  if (opts.branch === "multi-house") notes.push("multi-house-rural");
  if (opts.branch === "first-time") notes.push("first-time-base-only");
  // 농특세 면적 비과세 안내 — standard·first-time·multi-house 공통 (85m² 이하, 중과세율 무관)
  if ((opts.branch === "standard" || opts.branch === "first-time" || opts.branch === "multi-house")
      && opts.input.area_m2 > 0 && opts.input.area_m2 <= NATIONAL_HOUSING_AREA_M2) {
    notes.push("area-85-exempt");
  }

  return {
    baseTax: opts.baseTax,
    exemption: opts.exemption,
    ruralTax: opts.ruralTax,
    educationTax: opts.educationTax,
    total,
    effectiveRate,
    appliedRate: opts.rate,
    branch: opts.branch,
    area_m2: opts.input.area_m2,
    notes,
  };
}
