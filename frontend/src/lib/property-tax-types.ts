/**
 * 보유세 (재산세 + 종합부동산세) 계산 타입 정의 (2026 기준).
 * 권위 출처: 국세청 PDF 16개 (지방세법 §111 + 종부세법 §8/§9 + 합산배제 + 세율표 + 세액계산 흐름도).
 * - 재산세: 1세대1주택 9억 이하 특례 (0.05/0.1/0.2/0.35%) / 일반 (0.1/0.15/0.25/0.4%)
 * - 종부세: 2주택 이하 / 3주택 이상 7구간 누진
 * - 공정시장가액비율: 종부세 60%, 재산세 60% (1주택 43~45%)
 * - 1세대1주택 세액공제 한도 80% (연령 + 보유)
 * - 농어촌특별세: 종부세액의 20%
 */

export type Houses = 1 | 2 | 3;
export type PropertyTaxBranch = "empty" | "below-threshold" | "single-house" | "multi-house" | "corporation";

export type PropertyTaxNoticeKey =
  | "disclaimer"                  // 면책 안내
  | "single-house-special-rate"   // 1세대1주택 9억 이하 특례 세율 적용
  | "single-house-deduction-12e"  // 1세대1주택 종부세 공제 12억
  | "general-deduction-9e"        // 일반 종부세 공제 9억
  | "below-comprehensive-threshold" // 종부세 과세표준 0 (공제 미만)
  | "fair-market-ratio-60"        // 공정시장가액비율 60% 적용
  | "multi-heavy-25e"             // 3주택 이상 + 25억 초과 = 중과 누진 진입
  | "age-deduction-eligible"      // 연령 세액공제 가능 (1주택만)
  | "hold-deduction-eligible"     // 보유 세액공제 가능 (1주택만)
  | "rural-tax-20"                // 농어촌특별세 종부세액의 20% 별도
  | "tax-burden-cap-150"          // 세부담 상한 150% 가드 (전년도 미입력 시)
  | "tax-burden-cap-applied"      // 세부담 상한 150% 자동 적용됨 (전년도 입력 시)
  | "exclusion-applied"           // 합산배제 신청 주택 N채 → effectiveHouses 산정 (B-2)
  | "ownership-applied"           // 공동명의 본인 지분 N% → 종부세 본인 몫 산정 (B-3)
  | "ownership-single-house-warning" // 공동명의+1세대1주택자 — 명의자별 독립 1주택 자격 충족 필요 안내 (B-3)
  | "spouse-joint-single-house-applied" // 부부 공동명의 1주택자 특례 — 1인 합산 12억 공제 + 세액공제 80% (B-5)
  | "corporation-flat-rate-applied" // 법인 단일세율 적용 (2.7% / 5.0%) (B-4)
  | "corporation-no-credit"       // 법인 1주택 공제·세액공제 자동 차단 안내 (B-4)
  | "consult-experts";            // 세무사 상담 권장

export interface PropertyTaxInput {
  publishedPriceWon: number;      // 공시가격 (원, 공동명의 시 본인 지분 공시가)
  houses: Houses;                 // 보유 주택 수 (3 = "3주택 이상" 의미)
  isSingleHouseEligible: boolean; // 1세대1주택자 여부 (공제 12억 + 특례세율)
  ageYears: number;               // 연령 (1주택 세액공제용, 0=공제없음)
  holdYears: number;              // 보유연수 (1주택 세액공제용, 0=공제없음)
  prevYearTax?: number;           // 전년도 보유세 합계 (원, 옵션) — 세부담 상한 150% cap 자동 적용용
  excludedHouses?: number;        // 합산배제 신청 주택 수 (옵션, 임대등록·종교/사원용 등) — 종부세 산정 전용
  ownershipRatio?: number;        // 공동명의 본인 지분 비율 (0 < x ≤ 1, 옵션) — 종부세 산정 전용
  isCorporation?: boolean;        // 법인 보유 여부 (옵션) — 단일세율 + 공제·세액공제 자동 off
  isSpouseJointSingleHouse?: boolean; // 부부 공동명의 1주택자 특례 신청 (옵션, B-5) — 1인 합산 12억 공제 + 세액공제 80%
}

export interface PropertyTaxResult {
  branch: PropertyTaxBranch;
  // 재산세
  propertyTaxBase: number;        // 재산세 과세표준 = 공시 × 60%
  propertyTax: number;            // 재산세 산출세액 (누진공제 적용)
  // 종부세
  comprehensiveDeduction: number; // 종부세 공제금액 (12억/9억/0)
  comprehensiveTaxBase: number;   // 종부세 과세표준 = max(0, 공시 - 공제) × 60%
  comprehensiveTaxBeforeDeduction: number; // 종부세 산출세액 (공제할 재산세액 적용 전)
  comprehensiveTaxCredit: number; // 1세대1주택 세액공제 (연령+보유, 한도 80%)
  comprehensiveTax: number;       // 종부세 최종 (세액공제 후)
  // 합계
  totalTax: number;               // 보유세 합계 (재산세 + 종부세)
  ruralTax: number;               // 농어촌특별세 (종부세 × 20%)
  grandTotal: number;             // 총 부담 (cap 적용 후 최종 — 보유세 + 농특세)
  uncappedGrandTotal: number;     // cap 적용 전 원본 (cap 미적용 시 grandTotal 과 동일)
  wasCapped: boolean;             // 세부담 상한 150% cap 이 실제 적용됐는지
  effectiveRate: number;          // 공시가격 대비 실효세율 (cap 후 grandTotal 기준)
  appliedRate: {                  // 적용된 누진세율 (UI 표시용)
    property: number;
    comprehensive: number;
  };
  notes: PropertyTaxNoticeKey[];
}

export const EMPTY_PROPERTY_TAX_RESULT: PropertyTaxResult = {
  branch: "empty",
  propertyTaxBase: 0, propertyTax: 0,
  comprehensiveDeduction: 0, comprehensiveTaxBase: 0,
  comprehensiveTaxBeforeDeduction: 0, comprehensiveTaxCredit: 0, comprehensiveTax: 0,
  totalTax: 0, ruralTax: 0, grandTotal: 0,
  uncappedGrandTotal: 0, wasCapped: false,
  effectiveRate: 0,
  appliedRate: { property: 0, comprehensive: 0 },
  notes: ["disclaimer"],
};
