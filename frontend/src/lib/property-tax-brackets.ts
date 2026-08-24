/**
 * 보유세 (재산세 + 종부세) 누진세율 + 누진공제 + 헬퍼 (2026 기준).
 * 권위 출처: 재산세(지방세법 §111·§111의2·§110③·시행령 §109) + 종부세(종합부동산세법 §8·§9·
 * §10·시행령 §4의2 + 국세청 종부세 법령 안내자료 PDF + 세액계산 흐름도 PDF + 세율 PDF +
 * 합산배제 PDF). 조문별 정확한 근거는 각 상수·함수 주석에 개별 표기(세션 384 법령 재검증 —
 * 총괄 주석이 종부세 PDF만 가리켜 재산세 §111 출처가 불명확했던 것 정정, 세율값 자체는
 * 처음부터 정확했음. 세부담상한 조번호 §122→§10/§110③ 정정은 아래 상수 주석 참조).
 * 모든 세율·누진공제는 공식 법령·PDF 표 그대로 박제 (추측 0건).
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

/**
 * 종부세 세부담 상한 150% (종합부동산세법 §10).
 *
 * ⚠ 세션 384 근본수정: 옛 이름 `TAX_BURDEN_CAP_RATE` 는 "지방세법 §122" 를 근거로 재산세
 * 포함 전체 보유세(grandTotal)에 이 150% 를 적용했었다. 그러나 법령 재검증 결과 지방세법
 * §122 는 2023.3.14. 개정으로 "다만, 주택의 경우에는 적용하지 아니한다" 단서가 신설돼
 * **주택 재산세에는 이 조문 자체가 적용되지 않는다**(CaseNote 원문 직접 확인). 150% 상한은
 * 종합부동산세법 §10(종부세 세부담상한) 소관이라 종부세(+농어촌특별세) 몫에만 적용해야
 * 정확하다. 재산세의 진짜 상한은 지방세법 §110③(과세표준상한제, 아래 참조).
 */
export const COMPREHENSIVE_TAX_BURDEN_CAP_RATE = 1.5;

/**
 * 재산세 과세표준상한율 5% (지방세법 §110③ + 시행령 §109조의2②).
 *
 * 세션 384 신설 — 옛 "세부담상한 105/110/130%"(지방세법 §122 구간표)는 2023.3.14. 개정으로
 * 완전히 삭제됐다(법률 제19230호 개정이유: "주택 재산세의 과세표준상한제 도입에 따라 주택의
 * 세부담상한제는 폐지함"). 대체 제도인 과세표준상한제는 "전년도 과세표준"을 기준으로 당해년도
 * 과세표준의 증가를 연 5% 이내로 제한한다(세액이 아니라 과세표준 자체를 제한 — applyBracket
 * 으로 세율을 곱하기 *전* 단계에 적용). 2024~2028년은 옛 세부담상한(전년세액×105~130%)과
 * 병행 적용되는 경과기간이나(부칙 경과조치, 정확한 부칙 조번호는 미확정), 이 계산기는
 * "손님 상담용 추정치" 성격상 2029년 이후 확정 제도(과세표준상한제 단독)만 반영한다 —
 * 전환기 105/110/130% 는 곧 사라질 한시 제도라 신규 반영하지 않는다(안내문으로 고지).
 */
export const PROPERTY_TAX_STD_BASE_CAP_RATE = 0.05;

/**
 * 재산세 과세표준상한 적용 (지방세법 §110③) — 전년도 과세표준이 있을 때만 활성화.
 * 과세표준상한액 = 전년도 과세표준 × (1 + 5%). 당해년도 과세표준이 이보다 크면 상한액으로 제한.
 * @returns cap 적용 후 과세표준, 실제 cap 발동 여부
 */
export function applyPropertyTaxBaseCap(
  currentTaxBase: number,
  prevYearTaxBase: number | undefined,
): { cappedBase: number; wasCapped: boolean } {
  if (prevYearTaxBase === undefined || prevYearTaxBase <= 0) {
    return { cappedBase: currentTaxBase, wasCapped: false };
  }
  const capBase = Math.floor(prevYearTaxBase * (1 + PROPERTY_TAX_STD_BASE_CAP_RATE));
  if (currentTaxBase <= capBase) {
    return { cappedBase: currentTaxBase, wasCapped: false };
  }
  return { cappedBase: capBase, wasCapped: true };
}

// ===== 헬퍼 함수 =====

export function applyBracket(taxBase: number, brackets: TaxBracket[]): { tax: number; rate: number } {
  if (taxBase <= 0) return { tax: 0, rate: 0 };
  const b = brackets.find((br) => taxBase <= br.max);
  if (!b) return { tax: 0, rate: 0 };
  return { tax: Math.max(0, taxBase * b.rate - b.deduction), rate: b.rate };
}

/**
 * 표준세율 적용 (누진공제 미차감) — 종부세 시행령 §4의2 "재산세 상당액" 산정 전용.
 * elitelaw.kr/23 계산례: "구간세율로 적용하지 않고(누진공제 미차감) 재산세 표준세율만 적용".
 * applyBracket() 과 달리 해당 구간 세율을 과세표준 전체에 곱하기만 한다 (누진공제 0).
 */
export function applyStandardRate(taxBase: number, brackets: TaxBracket[]): { tax: number; rate: number } {
  if (taxBase <= 0) return { tax: 0, rate: 0 };
  const b = brackets.find((br) => taxBase <= br.max);
  if (!b) return { tax: 0, rate: 0 };
  return { tax: taxBase * b.rate, rate: b.rate };
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
 * 산식 (elitelaw.kr/23 구체 계산례 + 국세청 공식 흐름도 기반, 세션 384 재검증):
 *   공제할 재산세액 = 재산세 부과액 × (분자 ÷ 분모)
 *   분자 = applyStandardRate((공시가 - 종부세 기준금액) × 종부세FMR × 재산세FMR, propertyBrackets).tax
 *   분모 = applyStandardRate(공시가 × 재산세FMR, propertyBrackets).tax
 *
 * ⚠ 세션 384 근본수정: 분자·분모는 "표준세율"(누진공제 미차감, applyStandardRate)로 계산한다.
 * 옛 버전(~세션 383)은 applyBracket(누진공제 차감)을 썼는데, elitelaw.kr/23 계산례가
 * "④ 구간세율로 적용하지 않고(3억 초과 구간 570,000원 누진공제 더하지 않음) 재산세
 * 표준세율만 적용"이라고 명시 — "표준세율"은 지자체 조례 가감 전 법정 기본세율이라는
 * 뜻일 뿐 "누진 여부"와 무관하다고 오독했던 게 착오였다. 실제로는 해당 구간 세율을
 * 과세표준 전체에 곱하고 누진공제는 빼지 않는 방식이 맞다(법령상 "표준세율로 계산한
 * 재산세 상당액" 문구 자체가 이 방식을 가리킴).
 *
 * 권위 출처 (모두 직접 검증):
 *   - 종부세법 시행령 §4의2 (LBOX 법령 + elitelaw.kr/23 직접 fetch, 계산례 숫자 재검산)
 *   - 대법원 2019두39796 판결 — "재산세 표준세율로 계산한 재산세 상당액" 문구
 *   - 국세청 공식 흐름도 (nts.go.kr cntntsId=7735) — 종부세 = 산출세액 - 공제할 재산세액 - 세액공제
 *   - KILF 한국지방세연구원 — 법인에도 동일 적용
 *
 * ⚠ 근거 강도 재확인 완료 (세션 384 사후 적대적 검증 → 국세청 공식 자료로 최종 확정):
 * 사후 검증 1차에서 "누진공제 미차감" 방식이 elitelaw.kr 구체 계산례 1건에만 의존한다는
 * 한계가 지적됐으나, 이어서 국세청 공식 홈택스 페이지(nts.go.kr cntntsId=7739, "개인신고
 * 안내 - 종합부동산세")를 직접 재확인 — "주택분 재산세 표준세율만 적용하며, 구간세율로
 * 적용하지 않습니다"라는 문구를 국세청이 직접 명시. 또한 구 종합부동산세법 시행령 §4의2
 * 조문 원문("… × 재산세 표준세율" 형태, 뒤에 "− 누진공제" 항 자체가 없음)도 같은 결론을
 * 뒷받침 — 즉 elitelaw.kr 단일소스가 아니라 국세청 공식 문서 + 법조문 원문 + elitelaw.kr
 * 계산례 3건이 모두 일치. 로그인 필요한 홈택스 모의계산기(개별 사례 입력)까지 가지 않아도
 * 이 세 소스로 결론이 확정됐다고 판단해 반영.
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

  // 분자: 종부세 과세표준 부분의 재산세 상당액 (표준세율, 누진공제 미차감)
  const numeratorBase = Math.max(0, publishedPriceWon - comprehensiveDeduction) * comprehensiveFmRatio * propertyFmRatio;
  const numerator = applyStandardRate(numeratorBase, propertyBrackets).tax;

  // 분모: 전체 주택의 재산세 상당액 (표준세율, 누진공제 미차감)
  const denominatorBase = publishedPriceWon * propertyFmRatio;
  const denominator = applyStandardRate(denominatorBase, propertyBrackets).tax;

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
