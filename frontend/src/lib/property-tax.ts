/**
 * 보유세(재산세 + 종합부동산세) 계산기 진입점.
 * 1년 보유세 = 재산세 + 종부세 (공제할 재산세액은 단순화로 0 가정 — 손님 상담용 추정치).
 * 권위 출처: 국세청 PDF 16개 (지방세법 §111 + 종부세법 §8/§9 + 합산배제 + 세율표).
 */

import { validateAmount } from "./brokerage";
import { normalizeInput } from "./property-tax-rules";
import {
  type PropertyTaxInput, type PropertyTaxResult, type PropertyTaxNoticeKey,
  EMPTY_PROPERTY_TAX_RESULT,
} from "./property-tax-types";
import {
  PROPERTY_TAX_BRACKETS_SINGLE, PROPERTY_TAX_BRACKETS_GENERAL,
  COMPREHENSIVE_BRACKETS_2, COMPREHENSIVE_BRACKETS_3,
  COMPREHENSIVE_BRACKETS_CORP_2, COMPREHENSIVE_BRACKETS_CORP_3,
  applyBracket, totalCreditRate, singleHouseFairMarketRatio,
  FAIR_MARKET_RATIO, SINGLE_HOUSE_DEDUCTION, GENERAL_DEDUCTION, RURAL_TAX_RATE,
  TAX_BURDEN_CAP_RATE,
} from "./property-tax-brackets";

/**
 * 세부담 상한 150% cap 적용 — 전년도 보유세가 양수일 때만 활성화.
 * grandTotal 만 cap (내부 분해 propertyTax/comprehensiveTax/ruralTax 는 보존).
 * @returns { capped: cap 적용 후 grandTotal, wasCapped: 실제 cap 발동 여부, capNote: notes 에 추가할 키 }
 */
function applyTaxBurdenCap(grandTotal: number, prevYearTax: number | undefined): {
  capped: number; wasCapped: boolean; capNote: PropertyTaxNoticeKey;
} {
  if (prevYearTax === undefined || prevYearTax <= 0) {
    return { capped: grandTotal, wasCapped: false, capNote: "tax-burden-cap-150" };
  }
  const cap = Math.floor(prevYearTax * TAX_BURDEN_CAP_RATE);
  if (grandTotal <= cap) {
    return { capped: grandTotal, wasCapped: false, capNote: "tax-burden-cap-applied" };
  }
  return { capped: cap, wasCapped: true, capNote: "tax-burden-cap-applied" };
}

/**
 * 보유세 계산 (재산세 + 종합부동산세 통합).
 * - 입력: 공시가격, 주택수, 1세대1주택 여부, 연령, 보유연수
 * - 출력: 재산세 / 종부세 / 합계 / 농특세 / 총 부담 / 안내문 키
 */
export function calculatePropertyTax(rawInput: PropertyTaxInput): PropertyTaxResult {
  // GATE 0: 입력 검증
  if (!validateAmount(rawInput.publishedPriceWon) || rawInput.publishedPriceWon === 0) {
    return EMPTY_PROPERTY_TAX_RESULT;
  }
  // GATE 0b: 정규화 (clamp + corp 강제) — Phase A-0 인프라
  const input = normalizeInput(rawInput);

  const notes: PropertyTaxNoticeKey[] = ["disclaimer"];
  // B-2 합산배제: effectiveHouses = 종부세 산정용 실효 주택 수 (재산세는 houses 그대로)
  const excludedHouses = input.excludedHouses ?? 0;
  const effectiveHouses = Math.max(0, input.houses - excludedHouses);
  const isSpouseJointSingle = input.isSpouseJointSingleHouse === true; // B-5 부부 공동명의 1주택자 특례
  const isSingleProperty = input.isSingleHouseEligible && input.houses === 1;       // 재산세 1주택 특례 (특례세율 §111의2 + 차등 공정시장가액비율 §109)
  // 종부세 1주택 공제: 본인 단독 1세대1주택 OR 부부 공동명의 1주택 특례 (PDF: 1인 합산 12억)
  const isSingleComprehensive = (input.isSingleHouseEligible || isSpouseJointSingle) && effectiveHouses === 1;
  if (excludedHouses > 0) notes.push("exclusion-applied");

  // B-3 공동명의: ratio 는 종부세 진입값 (effectivePublished) 에만 적용. 재산세는 영향 없음 (사용자 입력 = 본인 지분 공시가 가정).
  // B-5 특례 적용 시: 1인 합산 납세 → ratio=1 강제 (인별 과세 우회), ownership-applied 미푸시
  const ownershipRatio = isSpouseJointSingle ? 1 : (input.ownershipRatio ?? 1);
  const effectivePublished = input.publishedPriceWon * ownershipRatio;
  if (isSpouseJointSingle) {
    notes.push("spouse-joint-single-house-applied");
  } else if (ownershipRatio < 1) {
    notes.push("ownership-applied");
    if (input.isSingleHouseEligible) notes.push("ownership-single-house-warning");
  }

  // B-4 법인: 종부세 단일세율 (2.7%/5.0%) + 공제 0원 + 1주택 공제·세액공제 자동 차단 (normalize 에서 isSingleHouseEligible=false 강제됨)
  const isCorp = input.isCorporation === true;
  if (isCorp) {
    notes.push("corporation-flat-rate-applied");
    // raw 입력에 1주택 자격/연령/보유가 있었으면 차단 안내 (normalize 후엔 false/0 이므로 raw 비교)
    const hadCreditAttempt = rawInput.isSingleHouseEligible || (rawInput.ageYears ?? 0) > 0 || (rawInput.holdYears ?? 0) > 0;
    if (hadCreditAttempt) notes.push("corporation-no-credit");
  }

  // ===== 1단계: 재산세 (지방세법 §111) =====
  // v3-A ①: 1세대1주택은 시가표준액 구간별 차등 공정시장가액비율 (§109, 43~45%) 적용. 그 외는 60%.
  const propertyFairMarketRatio = isSingleProperty ? singleHouseFairMarketRatio(input.publishedPriceWon) : FAIR_MARKET_RATIO;
  notes.push(isSingleProperty ? "single-house-fair-market-ratio" : "fair-market-ratio-60");
  const propertyTaxBase = Math.floor(input.publishedPriceWon * propertyFairMarketRatio);
  const propertyBrackets = isSingleProperty ? PROPERTY_TAX_BRACKETS_SINGLE : PROPERTY_TAX_BRACKETS_GENERAL;
  const propertyResult = applyBracket(propertyTaxBase, propertyBrackets);
  const propertyTax = Math.floor(propertyResult.tax);
  if (isSingleProperty) notes.push("single-house-special-rate");

  // ===== 2단계: 종합부동산세 (종부세법 §8 §9) =====
  // B-4 법인: 공제 0원 (개인 공제 9억/12억 미적용)
  const comprehensiveDeduction = isCorp ? 0 : (isSingleComprehensive ? SINGLE_HOUSE_DEDUCTION : GENERAL_DEDUCTION);
  if (!isCorp) notes.push(isSingleComprehensive ? "single-house-deduction-12e" : "general-deduction-9e");

  const afterDeduction = Math.max(0, effectivePublished - comprehensiveDeduction);
  const comprehensiveTaxBase = Math.floor(afterDeduction * FAIR_MARKET_RATIO);

  // 종부세 과세표준 0 = 공제 미만 (납부 의무 없음)
  if (comprehensiveTaxBase === 0) {
    notes.push("below-comprehensive-threshold");
    const cap = applyTaxBurdenCap(propertyTax, input.prevYearTax);
    notes.push(cap.capNote);
    notes.push("consult-experts");
    return {
      branch: isCorp ? "corporation" : "below-threshold",
      propertyTaxBase, propertyTax,
      comprehensiveDeduction, comprehensiveTaxBase: 0,
      comprehensiveTaxBeforeDeduction: 0, comprehensiveTaxCredit: 0, comprehensiveTax: 0,
      totalTax: propertyTax, ruralTax: 0,
      grandTotal: cap.capped,
      uncappedGrandTotal: propertyTax,
      wasCapped: cap.wasCapped,
      effectiveRate: input.publishedPriceWon > 0 ? cap.capped / input.publishedPriceWon : 0,
      appliedRate: { property: propertyResult.rate, comprehensive: 0, propertyFairMarketRatio },
      notes,
    };
  }

  // B-2/B-4 BRACKETS 선택: 법인은 CORP, 개인은 effectiveHouses 기준
  const comprehensiveBrackets = isCorp
    ? (input.houses >= 3 ? COMPREHENSIVE_BRACKETS_CORP_3 : COMPREHENSIVE_BRACKETS_CORP_2)
    : (effectiveHouses >= 3 ? COMPREHENSIVE_BRACKETS_3 : COMPREHENSIVE_BRACKETS_2);
  const compResult = applyBracket(comprehensiveTaxBase, comprehensiveBrackets);
  const comprehensiveTaxBeforeDeduction = Math.floor(compResult.tax);

  // 3주택+ 25억 초과 중과 안내 (개인만, effectiveHouses 기준)
  if (!isCorp && effectiveHouses >= 3 && comprehensiveTaxBase > 1_200_000_000) notes.push("multi-heavy-25e");

  // ===== 3단계: 1세대1주택 세액공제 (개인 1주택만, 법인 차단) =====
  let comprehensiveTaxCredit = 0;
  if (!isCorp && isSingleComprehensive) {
    const creditRate = totalCreditRate(input.ageYears, input.holdYears);
    comprehensiveTaxCredit = Math.floor(comprehensiveTaxBeforeDeduction * creditRate);
    if (input.ageYears >= 60) notes.push("age-deduction-eligible");
    if (input.holdYears >= 5) notes.push("hold-deduction-eligible");
  }
  const comprehensiveTax = Math.max(0, comprehensiveTaxBeforeDeduction - comprehensiveTaxCredit);

  // ===== 4단계: 농어촌특별세 (종부세액 × 20%) =====
  const ruralTax = Math.floor(comprehensiveTax * RURAL_TAX_RATE);
  if (ruralTax > 0) notes.push("rural-tax-20");

  const totalTax = propertyTax + comprehensiveTax;
  const uncappedGrandTotal = totalTax + ruralTax;
  const cap = applyTaxBurdenCap(uncappedGrandTotal, input.prevYearTax);
  notes.push(cap.capNote);
  notes.push("consult-experts");

  return {
    branch: isCorp ? "corporation" : (isSingleComprehensive ? "single-house" : "multi-house"),
    propertyTaxBase, propertyTax,
    comprehensiveDeduction, comprehensiveTaxBase,
    comprehensiveTaxBeforeDeduction, comprehensiveTaxCredit, comprehensiveTax,
    totalTax, ruralTax,
    grandTotal: cap.capped,
    uncappedGrandTotal,
    wasCapped: cap.wasCapped,
    effectiveRate: input.publishedPriceWon > 0 ? cap.capped / input.publishedPriceWon : 0,
    appliedRate: { property: propertyResult.rate, comprehensive: compResult.rate, propertyFairMarketRatio },
    notes,
  };
}
