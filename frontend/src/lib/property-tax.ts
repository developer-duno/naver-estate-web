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
  applyBracket, totalCreditRate, singleHouseFairMarketRatio, comprehensivePropertyTaxCredit,
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
  const effectiveHousesAfterExclusion = Math.max(0, input.houses - excludedHouses);

  // 세션 113 PDF #13: 세율 적용 시 주택 수 산정 제외 — 4종 채수 합계만큼 추가 차감 (세율 분기만 영향)
  // 합산배제(B-2)와 별개 효과로 양립 가능. 합산배제는 종부세 산정 자체에서 빼지만, PDF #13은 세율 분기만.
  const ra = input.specialHousesRateApply;
  const rateApplyExclusionCount = (ra?.inheritedRA?.count ?? 0) + (ra?.unauthorizedLand?.count ?? 0) +
    (ra?.smallNewHouse?.count ?? 0) + (ra?.postCompletionUnsoldRA?.count ?? 0);
  // 세율 산정용 effectiveHouses (BRACKETS 분기 결정용) — 합산배제 + PDF #13 모두 적용
  const effectiveHouses = Math.max(0, effectiveHousesAfterExclusion - rateApplyExclusionCount);
  // normalize 에서 차단된 경우 raw input 으로 사용자 시도 감지 → 안내 push
  if (rawInput.specialHousesRateApply && !ra && rawInput.isCorporation === true) {
    notes.push("rate-apply-exclusion-corp-blocked");
  }
  if (ra && rateApplyExclusionCount > 0) {
    notes.push("rate-apply-exclusion-applied");
    // 효과 발동 판정: 원래 BRACKETS_3 진입 (effectiveHousesAfterExclusion >= 3) 였으나
    // PDF #13 적용 후 BRACKETS_2 다운판정 (effectiveHouses < 3) 시 발동
    if (effectiveHousesAfterExclusion >= 3 && effectiveHouses < 3) {
      notes.push("rate-apply-exclusion-downgraded");
    } else {
      notes.push("rate-apply-exclusion-no-effect");
    }
  }
  const isSpouseJointSingle = input.isSpouseJointSingleHouse === true; // B-5 부부 공동명의 1주택자 특례
  const isSingleProperty = input.isSingleHouseEligible && input.houses === 1;       // 재산세 1주택 특례 (특례세율 §111의2 + 차등 공정시장가액비율 §109)
  // 세션 112: 5종 특례주택 (PDF #12) — normalize 가드 통과 시점에서 specialHouses 존재 시 자격 충족 확정
  // (normalize 에서 houses=1 + isSingleHouseEligible + 비법인 가드 처리, 여기서는 합산만)
  // 카테고리 미입력 시 ?? 0 가드 (NaN 방지)
  const sh = input.specialHouses;
  const specialHousesCount = (sh?.temporary2?.count ?? 0) + (sh?.inherited?.count ?? 0) +
    (sh?.ruralLowPrice?.count ?? 0) + (sh?.populationDecline?.count ?? 0) + (sh?.postCompletionUnsold?.count ?? 0);
  // 세션 113 의미 변경: publishedTotal (합계) → publishedAverage (1주택당 평균)
  // 사용자는 카테고리당 1주택 평균 공시가만 입력 → count × 평균 자동 합산
  // count=1 케이스는 기존 합계 = 신규 평균 × 1 이라 결과 동일 (호환성 100%)
  const specialHousesPublishedTotal = (
    (sh?.temporary2?.publishedAverage ?? 0) * (sh?.temporary2?.count ?? 0) +
    (sh?.inherited?.publishedAverage ?? 0) * (sh?.inherited?.count ?? 0) +
    (sh?.ruralLowPrice?.publishedAverage ?? 0) * (sh?.ruralLowPrice?.count ?? 0) +
    (sh?.populationDecline?.publishedAverage ?? 0) * (sh?.populationDecline?.count ?? 0) +
    (sh?.postCompletionUnsold?.publishedAverage ?? 0) * (sh?.postCompletionUnsold?.count ?? 0)
  ) * 10000; // 만원→원
  const isSingleSpecialHouseEligible = !isSpouseJointSingle && specialHousesCount > 0; // B-5 우선: 부부 공동명의 시 안분 비활성
  // 종부세 1주택 공제: 본인 단독 1세대1주택 OR 부부 공동명의 1주택 특례 OR 5종 특례주택 자격 (PDF: 1인 합산 12억)
  // 1주택 자격 판정은 합산배제(B-2) 만 적용 — PDF #13 세율 다운판정은 자격 무관 (세율 분기만 영향)
  const isSingleComprehensive = (input.isSingleHouseEligible || isSpouseJointSingle || isSingleSpecialHouseEligible) && effectiveHousesAfterExclusion === 1;
  if (excludedHouses > 0) notes.push("exclusion-applied");
  if (sh) {
    if (isSingleSpecialHouseEligible) notes.push("special-houses-applied");
    else if (isSpouseJointSingle) notes.push("special-houses-spouse-joint-priority"); // B-5 우선 적용 안내
  }
  // normalize 에서 차단된 경우 raw input 으로 사용자 시도 감지 → 안내 push
  if (rawInput.specialHouses && !sh) {
    if (rawInput.isCorporation === true) notes.push("special-houses-corp-blocked");
    else if (rawInput.houses !== 1) notes.push("special-houses-multi-house-blocked");
  }

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
  // 세션 111: 법인 9종 일반 누진세율 특례 (PDF #14) — 카테고리 선택 시 단일세율 → 누진세율 + 공제 9억 + 세부담 상한 150%
  const isCorp = input.isCorporation === true;
  const corpCategory = input.corporationGeneralRateCategory;
  const isCorpGeneral = isCorp && corpCategory != null;
  if (isCorp) {
    notes.push(isCorpGeneral ? "corporation-general-rate-applied" : "corporation-flat-rate-applied");
    // raw 입력에 1주택 자격/연령/보유가 있었으면 차단 안내 (법인은 1세대1주택 자격 없음 — 일반세율 신청 무관)
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
  // B-4 법인: 단일세율 시 공제 0원, 일반 누진세율 신청 시 9억 (PDF #2 페이지 3 — 일반과 동일 분기)
  const comprehensiveDeduction = isCorp
    ? (isCorpGeneral ? GENERAL_DEDUCTION : 0)
    : (isSingleComprehensive ? SINGLE_HOUSE_DEDUCTION : GENERAL_DEDUCTION);
  if (!isCorp) notes.push(isSingleComprehensive ? "single-house-deduction-12e" : "general-deduction-9e");
  if (isCorpGeneral) notes.push("general-deduction-9e");

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
      comprehensiveTaxBeforeDeduction: 0, comprehensivePropertyTaxCredit: 0, comprehensiveTaxCredit: 0, comprehensiveTax: 0,
      totalTax: propertyTax, ruralTax: 0,
      grandTotal: cap.capped,
      uncappedGrandTotal: propertyTax,
      wasCapped: cap.wasCapped,
      effectiveRate: input.publishedPriceWon > 0 ? cap.capped / input.publishedPriceWon : 0,
      appliedRate: { property: propertyResult.rate, comprehensive: 0, propertyFairMarketRatio },
      notes,
    };
  }

  // B-2/B-4 BRACKETS 선택: 법인 단일세율 = CORP, 개인 = effectiveHouses 기준
  // 세션 111: 법인 9종 일반 누진세율 (PDF #14 페이지 2 표):
  //   - 카테고리 ① (public-charity-other): 2주택 이하 BRACKETS_2 / 3주택 이상 BRACKETS_3 (effectiveHouses 기준 — 합산배제 양립)
  //   - 카테고리 ②~⑨: BRACKETS_2 일률 (다주택 보유해도 중과 안 함)
  const comprehensiveBrackets = isCorp
    ? (isCorpGeneral
        ? (corpCategory === "public-charity-other"
            ? (effectiveHouses >= 3 ? COMPREHENSIVE_BRACKETS_3 : COMPREHENSIVE_BRACKETS_2)
            : COMPREHENSIVE_BRACKETS_2)
        : (input.houses >= 3 ? COMPREHENSIVE_BRACKETS_CORP_3 : COMPREHENSIVE_BRACKETS_CORP_2))
    : (effectiveHouses >= 3 ? COMPREHENSIVE_BRACKETS_3 : COMPREHENSIVE_BRACKETS_2);
  const compResult = applyBracket(comprehensiveTaxBase, comprehensiveBrackets);
  const comprehensiveTaxBeforeDeduction = Math.floor(compResult.tax);

  // 3주택+ 25억 초과 중과 안내 (개인 + 법인 카테고리 ① 둘 다 BRACKETS_3 진입, effectiveHouses 기준)
  const usesHeavyBrackets = !isCorp ? (effectiveHouses >= 3) : (isCorpGeneral && corpCategory === "public-charity-other" && effectiveHouses >= 3);
  if (usesHeavyBrackets && comprehensiveTaxBase > 1_200_000_000) notes.push("multi-heavy-25e");

  // ===== 3단계: 공제할 재산세액 (종부세법 시행령 §4의2) — v3-A ② =====
  // 1주택·다주택·법인 모두 적용 (KILF + 국세청 공식). 분자·분모 누진세율 (대법원 2019두39796).
  const propertyTaxCreditAmount = comprehensivePropertyTaxCredit({
    publishedPriceWon: effectivePublished,
    comprehensiveDeduction,
    comprehensiveFmRatio: FAIR_MARKET_RATIO,
    propertyFmRatio: propertyFairMarketRatio,
    propertyTax,
    propertyBrackets,
  });
  const comprehensiveTaxAfterPropertyCredit = Math.max(0, comprehensiveTaxBeforeDeduction - propertyTaxCreditAmount);
  if (propertyTaxCreditAmount > 0) notes.push("comprehensive-property-tax-credit");

  // ===== 4단계: 1세대1주택 세액공제 (개인 1주택만, 법인 차단) =====
  // 대법원 2019두39796: 세액공제는 공제할 재산세액 차감 후 종부세액 기준 (이중공제 방지).
  // 세션 112 PDF #12: 5종 특례주택 자격 시 안분 산식 적용 — "산출세액 중 특례주택을 제외한 1주택이 차지하는 부분"
  //   안분 비율 = effectivePublished / (effectivePublished + specialHousesPublishedTotal)
  //   분모 0 시 1.0 fallback (안분 비활성), 분모 단위 = 공시가 (FMR 미적용, PDF 본문 명시 부재 → mdx 면책)
  let comprehensiveTaxCredit = 0;
  if (!isCorp && isSingleComprehensive) {
    const creditRate = totalCreditRate(input.ageYears, input.holdYears);
    // 5종 특례주택 안분 (B-5 우선 시 비활성 — isSingleSpecialHouseEligible 가 false 강제됨)
    const proRationDenominator = effectivePublished + specialHousesPublishedTotal;
    const proRationRatio = (isSingleSpecialHouseEligible && proRationDenominator > 0)
      ? effectivePublished / proRationDenominator
      : 1.0;
    const taxBaseForCredit = Math.floor(comprehensiveTaxAfterPropertyCredit * proRationRatio);
    comprehensiveTaxCredit = Math.floor(taxBaseForCredit * creditRate);
    if (isSingleSpecialHouseEligible && proRationRatio < 1.0) notes.push("special-houses-credit-prorated");
    if (input.ageYears >= 60) notes.push("age-deduction-eligible");
    if (input.holdYears >= 5) {
      notes.push("hold-deduction-eligible");
      notes.push("hold-period-special-eligible"); // PDF #16 안내 (세션 115)
    }
    // PDF #16 산식 단계 가드: mode != none + 연도 입력 + 5+ 모두 충족 시만 push (외부 직접 호출 보호)
    const mode = input.holdPeriodSpecialMode ?? "none";
    const hasOrigYear = (input.originalAcquisitionYear ?? 0) > 0;
    if (mode === "planned" && input.holdYears >= 5 && hasOrigYear) {
      notes.push("hold-period-special-planned");
      notes.push("hold-period-precision-warn");
    }
    if (mode === "applied" && input.holdYears >= 5 && hasOrigYear) {
      notes.push("hold-period-special-applied");
      notes.push("hold-period-precision-warn");
    }
  }
  const comprehensiveTax = Math.max(0, comprehensiveTaxAfterPropertyCredit - comprehensiveTaxCredit);

  // ===== 5단계: 농어촌특별세 (종부세액 × 20%) =====
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
    comprehensiveTaxBeforeDeduction,
    comprehensivePropertyTaxCredit: propertyTaxCreditAmount,
    comprehensiveTaxCredit, comprehensiveTax,
    totalTax, ruralTax,
    grandTotal: cap.capped,
    uncappedGrandTotal,
    wasCapped: cap.wasCapped,
    effectiveRate: input.publishedPriceWon > 0 ? cap.capped / input.publishedPriceWon : 0,
    appliedRate: { property: propertyResult.rate, comprehensive: compResult.rate, propertyFairMarketRatio },
    notes,
  };
}
