/**
 * 양도세 누진세율 8구간 + 표1/표2 장기보유공제 산식 (소득세법 §95②, §104①).
 * 표1: 보유 연 2%, 최대 30%. 표2: 1주택 12억 초과, 보유 연 4% + 거주 연 4%, 합 80%.
 * 출처: 국세청 공식 표 + §95⑤ "100분의 40보다 큰 경우 100분의 40".
 */

// ===== 누진세율 8구간 (소득세법 제104조 제1항, 2026 기준) =====
export interface ProgressiveBracket {
  max: number;       // 과세표준 상한 (원). Infinity = 10억 초과.
  rate: number;      // 세율
  deduction: number; // 누진공제액 (원)
}

export const PROGRESSIVE_BRACKETS: ProgressiveBracket[] = [
  { max: 14_000_000,    rate: 0.06, deduction: 0 },
  { max: 50_000_000,    rate: 0.15, deduction: 1_260_000 },
  { max: 88_000_000,    rate: 0.24, deduction: 5_760_000 },
  { max: 150_000_000,   rate: 0.35, deduction: 15_440_000 },
  { max: 300_000_000,   rate: 0.38, deduction: 19_940_000 },
  { max: 500_000_000,   rate: 0.40, deduction: 25_940_000 },
  { max: 1_000_000_000, rate: 0.42, deduction: 35_940_000 },
  { max: Infinity,      rate: 0.45, deduction: 65_940_000 },
];

// ===== 단기보유 세율 (소득세법 §104①, 보유<2년) =====
export const SHORT_TERM_UNDER_1Y = 0.70;
export const SHORT_TERM_1Y_TO_2Y = 0.60;

// ===== 다주택 중과 가산율 (소득세법 §104⑦, 양도일 > 2026-05-09 시 적용) =====
export const HEAVY_RATE_2_HOUSES = 0.20;
export const HEAVY_RATE_3_HOUSES = 0.30;

// ===== 핵심 상수 =====
export const EXEMPTION_END_DATE = "2026-05-09";   // 한시배제 종료일
export const FOUR_DISTRICT_GRACE_DATE = "2026-09-09"; // 4구 보완 4개월 이내
export const HIGH_VALUE_THRESHOLD = 1_200_000_000;    // 12억 (1주택 비과세·안분)
export const BASIC_DEDUCTION = 2_500_000;             // 기본공제 250만 (소득세법 §103)
export const MAX_AMOUNT_WON = 1_000_000_000_000;      // 1조 (검증 한도)

// ===== 표1: 일반 장기보유공제 (소득세법 §95② 표1) =====
export function computeTable1Rate(holdYears: number): number {
  if (holdYears < 3) return 0;
  return Math.min(0.30, Math.floor(holdYears) * 0.02);
}

export function computeTable1Deduction(holdYears: number, gain: number): number {
  return Math.floor(gain * computeTable1Rate(holdYears));
}

// ===== 표2: 1세대1주택 12억 초과 장기보유공제 (소득세법 §95② 표2) =====
// (a) 보유: 3년 12% ~ 10년+ 40% (연 4%, 최대 40%)
export function computeTable2HoldRate(holdYears: number): number {
  if (holdYears < 3) return 0;
  return Math.min(0.40, Math.floor(holdYears) * 0.04);
}

// (b) 거주: 2년 8% (특례) / 3년 12% ~ 10년+ 40% (연 4%, 최대 40%)
export function computeTable2LiveRate(livedYears: number): number {
  if (livedYears < 2) return 0;
  if (livedYears < 3) return 0.08;
  return Math.min(0.40, Math.floor(livedYears) * 0.04);
}

// 합산 최대 80% (보유 10년+ + 거주 10년+ 동시 충족 시)
export function computeTable2TotalRate(holdYears: number, livedYears: number): number {
  return Math.min(0.80, computeTable2HoldRate(holdYears) + computeTable2LiveRate(livedYears));
}

export function computeTable2Deduction(holdYears: number, livedYears: number, taxableGain: number): number {
  return Math.floor(taxableGain * computeTable2TotalRate(holdYears, livedYears));
}

// ===== 누진세 적용 (taxBase → 산출세액) =====
export function applyProgressive(taxBase: number): number {
  if (taxBase <= 0) return 0;
  const bracket = PROGRESSIVE_BRACKETS.find((b) => taxBase <= b.max);
  if (!bracket) return 0;
  return taxBase * bracket.rate - bracket.deduction;
}
