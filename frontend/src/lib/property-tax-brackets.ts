/**
 * 보유세 (재산세 + 종부세) 누진세율 + 누진공제 + 헬퍼 (2026 기준).
 * 권위 출처: 국세청 종부세 법령 안내자료 PDF + 세액계산 흐름도 PDF + 세율 PDF + 합산배제 PDF.
 * 모든 세율·누진공제는 PDF 표 그대로 박제 (추측 0건).
 */

export interface TaxBracket {
  max: number;       // 과세표준 상한 (원), Infinity = 초과
  rate: number;      // 세율 (소수, 예: 0.005 = 0.5%)
  deduction: number; // 누진공제액 (원)
}

// ===== 재산세 (지방세법 §111, 주택분, 2026) =====

/** 1세대1주택 9억 이하 특례 (지방세법 §111의2) */
export const PROPERTY_TAX_BRACKETS_SINGLE: TaxBracket[] = [
  { max: 60_000_000,       rate: 0.0005, deduction: 0 },         // 6천만 이하 0.05%
  { max: 150_000_000,      rate: 0.001,  deduction: 30_000 },    // 1.5억 이하 0.1%
  { max: 300_000_000,      rate: 0.002,  deduction: 180_000 },   // 3억 이하 0.2%
  { max: Infinity,         rate: 0.0035, deduction: 630_000 },   // 3억 초과 0.35%
];

/** 일반 (다주택 또는 1주택 9억 초과) */
export const PROPERTY_TAX_BRACKETS_GENERAL: TaxBracket[] = [
  { max: 60_000_000,       rate: 0.001,  deduction: 0 },         // 6천만 이하 0.1%
  { max: 150_000_000,      rate: 0.0015, deduction: 30_000 },    // 1.5억 이하 0.15%
  { max: 300_000_000,      rate: 0.0025, deduction: 180_000 },   // 3억 이하 0.25%
  { max: Infinity,         rate: 0.004,  deduction: 630_000 },   // 3억 초과 0.4%
];

// ===== 종합부동산세 (종부세법 §8 §9, 2026) =====

/** 개인 2주택 이하 7구간 누진 */
export const COMPREHENSIVE_BRACKETS_2: TaxBracket[] = [
  { max: 300_000_000,      rate: 0.005, deduction: 0 },           // 3억 이하 0.5%
  { max: 600_000_000,      rate: 0.007, deduction: 600_000 },     // 6억 이하 0.7%
  { max: 1_200_000_000,    rate: 0.010, deduction: 2_400_000 },   // 12억 이하 1.0%
  { max: 2_500_000_000,    rate: 0.013, deduction: 6_000_000 },   // 25억 이하 1.3%
  { max: 5_000_000_000,    rate: 0.015, deduction: 11_000_000 },  // 50억 이하 1.5%
  { max: 9_400_000_000,    rate: 0.020, deduction: 36_000_000 },  // 94억 이하 2.0%
  { max: Infinity,         rate: 0.027, deduction: 101_800_000 }, // 94억 초과 2.7%
];

/** 법인 2주택 이하 단일세율 (종부세법 §9③) — 누진 X, 공제 0 */
export const COMPREHENSIVE_BRACKETS_CORP_2: TaxBracket[] = [
  { max: Infinity, rate: 0.027, deduction: 0 },  // 단일 2.7%
];

/** 법인 3주택 이상 단일세율 (종부세법 §9③) — 누진 X, 공제 0 */
export const COMPREHENSIVE_BRACKETS_CORP_3: TaxBracket[] = [
  { max: Infinity, rate: 0.050, deduction: 0 },  // 단일 5.0%
];

/** 개인 3주택 이상 7구간 누진 (25억 초과부터 중과) */
export const COMPREHENSIVE_BRACKETS_3: TaxBracket[] = [
  { max: 300_000_000,      rate: 0.005, deduction: 0 },           // 3억 이하 0.5%
  { max: 600_000_000,      rate: 0.007, deduction: 600_000 },     // 6억 이하 0.7%
  { max: 1_200_000_000,    rate: 0.010, deduction: 2_400_000 },   // 12억 이하 1.0%
  { max: 2_500_000_000,    rate: 0.020, deduction: 14_400_000 },  // 25억 이하 2.0% ← 중과
  { max: 5_000_000_000,    rate: 0.030, deduction: 39_400_000 },  // 50억 이하 3.0%
  { max: 9_400_000_000,    rate: 0.040, deduction: 89_400_000 },  // 94억 이하 4.0%
  { max: Infinity,         rate: 0.050, deduction: 183_400_000 }, // 94억 초과 5.0%
];

// ===== 핵심 상수 (PDF 박제) =====

export const FAIR_MARKET_RATIO = 0.60;          // 종부세 + 재산세 일반 공정시장가액비율 (2026)

// 1세대1주택 재산세 차등 공정시장가액비율 (지방세법 시행령 §109, 2025년 납세의무, 2026년 유지)
// 권위 출처: LBOX 법령 (lbox.kr) §109 본문 + 한국세정신문 274811 + 정책브리핑 148941752 + 행안부 FILE_00135228WqBEC5V
// 9억 초과 1주택도 45% 적용 (한도 없음)
export const SINGLE_HOUSE_FMR_3E = 0.43;        // 시가표준액 3억 이하
export const SINGLE_HOUSE_FMR_6E = 0.44;        // 3억 초과 6억 이하
export const SINGLE_HOUSE_FMR_OVER = 0.45;      // 6억 초과 (한도 없음)

export const SINGLE_HOUSE_DEDUCTION = 1_200_000_000; // 1세대1주택 종부세 공제 12억
export const GENERAL_DEDUCTION = 900_000_000;        // 일반(2주택+) 종부세 공제 9억
export const RURAL_TAX_RATE = 0.20;             // 농어촌특별세: 종부세액의 20%
export const MAX_TOTAL_CREDIT = 0.80;           // 합산 최대 80% (연령+보유 세액공제 한도)
export const TAX_BURDEN_CAP_RATE = 1.5;         // 세부담 상한 — 전년도 보유세의 150% (지방세법 §122)

// ===== 헬퍼 함수 =====

export function applyBracket(taxBase: number, brackets: TaxBracket[]): { tax: number; rate: number } {
  if (taxBase <= 0) return { tax: 0, rate: 0 };
  const b = brackets.find((br) => taxBase <= br.max);
  if (!b) return { tax: 0, rate: 0 };
  return { tax: Math.max(0, taxBase * b.rate - b.deduction), rate: b.rate };
}

/**
 * 1세대1주택 재산세 공정시장가액비율 (지방세법 시행령 §109).
 * 시가표준액 = 공시가격 (지방세법 §4 + 시행령 §109).
 * 9억 초과 1주택도 45% 적용 (한도 없음 — LBOX 직접 검증).
 */
export function singleHouseFairMarketRatio(publishedPriceWon: number): number {
  if (publishedPriceWon <= 300_000_000) return SINGLE_HOUSE_FMR_3E;       // 3억 이하 43%
  if (publishedPriceWon <= 600_000_000) return SINGLE_HOUSE_FMR_6E;       // 6억 이하 44%
  return SINGLE_HOUSE_FMR_OVER;                                            // 6억 초과 45%
}

/**
 * 종부세 공제할 재산세액 (이중과세 방지) — 종부세법 시행령 §4의2.
 *
 * 산식 (대법원 2023.8.31. 선고 2019두39796 판결 + 국세청 공식 흐름도 기반):
 *   공제할 재산세액 = 재산세 부과액 × (분자 ÷ 분모)
 *   분자 = applyBracket((공시가 - 종부세 기준금액) × 종부세FMR × 재산세FMR, propertyBrackets).tax
 *   분모 = applyBracket(공시가 × 재산세FMR, propertyBrackets).tax
 *
 * 권위 출처 (모두 직접 검증):
 *   - 종부세법 시행령 §4의2 (LBOX 법령 + elitelaw.kr/23 직접 fetch)
 *   - 대법원 2023.8.31. 선고 2019두39796 판결 (분자·분모 모두 누진세율 적용 명시)
 *   - 국세청 공식 흐름도 (nts.go.kr cntntsId=7735) — 종부세 = 산출세액 - 공제할 재산세액 - 세액공제
 *   - KILF 한국지방세연구원 — 법인에도 동일 적용
 *
 * 적용: 1주택·다주택·법인 모든 분기 (comprehensiveTaxBase > 0 인 경우만)
 * 법인: 기준금액 = 0 (개인 공제 미적용 → 공시가 전체로 분자 산정)
 *
 * 분모 0 가드: 정상 입력에선 도달 불가하나 방어용으로 0 반환.
 */
export function comprehensivePropertyTaxCredit(args: {
  publishedPriceWon: number;
  comprehensiveDeduction: number; // 1주택 12억 / 일반 9억 / 법인 0
  comprehensiveFmRatio: number;   // 종부세 공정시장가액비율 (현재 0.60)
  propertyFmRatio: number;        // 재산세 공정시장가액비율 (1주택 차등 0.43~0.45 또는 일반 0.60)
  propertyTax: number;            // 실제 재산세 부과액 (이중과세분 비율 곱할 대상)
  propertyBrackets: TaxBracket[]; // 1주택 SINGLE / 일반 GENERAL
}): number {
  const { publishedPriceWon, comprehensiveDeduction, comprehensiveFmRatio, propertyFmRatio, propertyTax, propertyBrackets } = args;

  // 분자: 종부세 과세표준 부분의 재산세 상당액
  const numeratorBase = Math.max(0, publishedPriceWon - comprehensiveDeduction) * comprehensiveFmRatio * propertyFmRatio;
  const numerator = applyBracket(numeratorBase, propertyBrackets).tax;

  // 분모: 전체 주택의 재산세 상당액
  const denominatorBase = publishedPriceWon * propertyFmRatio;
  const denominator = applyBracket(denominatorBase, propertyBrackets).tax;

  if (denominator <= 0) return 0;
  return Math.floor(propertyTax * (numerator / denominator));
}

/** 1세대1주택 연령 세액공제율 (60세 20% / 65세 30% / 70세+ 40%) */
export function ageDeductionRate(ageYears: number): number {
  if (ageYears >= 70) return 0.40;
  if (ageYears >= 65) return 0.30;
  if (ageYears >= 60) return 0.20;
  return 0;
}

/** 1세대1주택 보유 세액공제율 (5년 20% / 10년 40% / 15년+ 50%) */
export function holdDeductionRate(holdYears: number): number {
  if (holdYears >= 15) return 0.50;
  if (holdYears >= 10) return 0.40;
  if (holdYears >= 5)  return 0.20;
  return 0;
}

/** 합산 세액공제율 (한도 80%) */
export function totalCreditRate(ageYears: number, holdYears: number): number {
  return Math.min(MAX_TOTAL_CREDIT, ageDeductionRate(ageYears) + holdDeductionRate(holdYears));
}
