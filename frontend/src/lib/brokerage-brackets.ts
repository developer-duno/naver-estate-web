/**
 * 중개수수료 요율표 상수 (공인중개사법 시행규칙 별표1, 2021.10.19 개정)
 * 1차 소스: 법제처/서울시/경기도/창원시 4곳 교차검증, 2026-05 유효
 */

export interface BrokerageBracket {
  min: number;
  max: number;
  rate: number;
  cap: number | null;
}

export const HOUSE_SALE_BRACKETS: BrokerageBracket[] = [
  { min: 0,             max: 50_000_000,    rate: 0.006, cap: 250_000 },
  { min: 50_000_000,    max: 200_000_000,   rate: 0.005, cap: 800_000 },
  { min: 200_000_000,   max: 900_000_000,   rate: 0.004, cap: null },
  { min: 900_000_000,   max: 1_200_000_000, rate: 0.005, cap: null },
  { min: 1_200_000_000, max: 1_500_000_000, rate: 0.006, cap: null },
  { min: 1_500_000_000, max: Infinity,      rate: 0.007, cap: null },
];

export const HOUSE_LEASE_BRACKETS: BrokerageBracket[] = [
  { min: 0,             max: 50_000_000,    rate: 0.005, cap: 200_000 },
  { min: 50_000_000,    max: 100_000_000,   rate: 0.004, cap: 300_000 },
  { min: 100_000_000,   max: 600_000_000,   rate: 0.003, cap: null },
  { min: 600_000_000,   max: 1_200_000_000, rate: 0.004, cap: null },
  { min: 1_200_000_000, max: 1_500_000_000, rate: 0.005, cap: null },
  { min: 1_500_000_000, max: Infinity,      rate: 0.006, cap: null },
];

export const OFFICETEL_RATE = { sale: 0.005, lease: 0.004 } as const;
export const NEGOTIABLE_MAX_RATE = 0.009;
export const MAX_AMOUNT_WON = 1_000_000_000_000;
