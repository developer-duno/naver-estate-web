/**
 * 대출 규칙 복사본 동일성 — 미분양 정본 함수로 직접 뽑은 입력 → 출력 20건(세션 482 PR 1b, 설계 L4).
 *
 * 기대값 출처: 2026-10-26 F:/mibunyang @ 415729ee(main 0722cf97) 의 원본 파일
 *   src/constants/regulations.ts(calcLTV) · src/constants/loanRules.ts(stressAddFor) ·
 *   src/lib/fundingPlan.ts(maxPrincipalForAnnualPayment) · src/lib/loanRates.ts(calcMonthlyPayment)
 * 를 node(타입 지우기)로 불러 그대로 실행한 결과 — 손계산 아님. 원본이 바뀌면 이 표를 원본으로 다시 뽑는다.
 */
import { describe, expect, it } from "vitest";
import {
  DSR_LIMIT_BANK,
  LOAN_RULES_BASIS,
  LOAN_TERM_YEARS,
  METRO_LOAN_CAP,
  NORMAL_LTV,
  REGULATED_LTV_RATE,
  STRESS_RATE_LOCAL,
  STRESS_RATE_METRO,
  calcLTV,
  calcMonthlyPayment,
  maxPrincipalForAnnualPayment,
  stressAddFor,
  type Zone,
} from "../loanRules";

// [집값, 구역, 시도, 원본 결과]
const CALC_LTV: [number, Zone, string | null, number][] = [
  [15700, "normal", "대전", 10990],        // 6139 59㎡ 보수적 집값 — 지방 비규제 70%
  [100000, "overheated", "서울", 40000],   // 규제 10억 → 40%
  [160000, "overheated", "서울", 40000],   // 규제 16억 → 15억 초과 캡 4억
  [260000, "overheated", "서울", 20000],   // 규제 26억 → 25억 초과 캡 2억
  [100000, "normal", "경기", 60000],       // 수도권 6억 캡
  [100000, "normal", "인천", 60000],
  [200000, "normal", "부산", 140000],      // 지방 무캡
  [160000, "overheated", "부산", 40000],
  [150000, "overheated", "경기", 60000],   // 정확히 15억 = 캡 아님(초과만) → 40% 6억
  [0, "normal", null, 0],
];
const STRESS: [Zone, string | null, number][] = [
  ["normal", "대전", 0.75],
  ["normal", "서울", 3],
  ["overheated", "부산", 3],
  ["normal", null, 0.75],
];
const MAX_PRINCIPAL: [number, number, number, number][] = [
  [6000, 4.5, 30, 98680],
  [0, 4, 30, 0],
  [6000, 0, 30, 0],
  [3600, 7.75, 30, 41875],
];
const MONTHLY: [number, number, number, number][] = [
  [10990, 4, 30, 52.46794097165337],
  [0, 4, 30, 0],
];

describe("미분양 정본 복사본 동일성 20건", () => {
  it.each(CALC_LTV)("calcLTV(%d, %s, %s) = %d", (price, zone, region, want) => {
    expect(calcLTV(price, zone, region)).toBe(want);
  });
  it.each(STRESS)("stressAddFor(%s, %s) = %d", (zone, region, want) => {
    expect(stressAddFor(zone, region)).toBe(want);
  });
  it.each(MAX_PRINCIPAL)("maxPrincipalForAnnualPayment(%d, %d, %d) = %d", (pay, rate, years, want) => {
    expect(maxPrincipalForAnnualPayment(pay, rate, years)).toBe(want);
  });
  it.each(MONTHLY)("calcMonthlyPayment(%d, %d, %d) = %d", (p, rate, years, want) => {
    expect(calcMonthlyPayment(p, rate, years)).toBe(want);
  });
  it("표 크기 = 20건", () => {
    expect(CALC_LTV.length + STRESS.length + MAX_PRINCIPAL.length + MONTHLY.length).toBe(20);
  });
});

describe("상수 — 원본 값", () => {
  it("규칙 숫자", () => {
    expect({ NORMAL_LTV, REGULATED_LTV_RATE, METRO_LOAN_CAP, LOAN_RULES_BASIS, DSR_LIMIT_BANK, LOAN_TERM_YEARS,
      STRESS_RATE_METRO, STRESS_RATE_LOCAL }).toEqual({
      NORMAL_LTV: 0.7, REGULATED_LTV_RATE: 0.4, METRO_LOAN_CAP: 60000, LOAN_RULES_BASIS: "2026년 10월",
      DSR_LIMIT_BANK: 0.4, LOAN_TERM_YEARS: 30, STRESS_RATE_METRO: 3, STRESS_RATE_LOCAL: 0.75,
    });
  });
});
