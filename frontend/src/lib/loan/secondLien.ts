/**
 * 담보 여력 참고 계산 — 2u 전용(세션 482 PR 1b, 설계 §3 S4 ①~④). 금액은 전부 만원.
 * 입력은 화면 상태에서만 오고 어디에도 저장·전송하지 않는다. 규칙 숫자·함수는 미분양 정본 복사본(./loanRules)만 쓴다.
 *
 * ① 지역 한도 = calcLTV(집값, 구역, 시도) — 구역을 모르면(null) 비규제로 셈하고 화면이 "규제지역이면 40%" 를 덧붙인다
 * ② 추가 가능 = ① − 선순위 담보대출 − 임차보증금 (0 아래로 내려가지 않는다)
 * ③ 소득 기준 = maxPrincipalForAnnualPayment(연소득 × DSR 40% − 기존 연 상환, 금리 + 스트레스 가산, 30년)
 *    — 연소득이 없거나 금리가 없으면 계산하지 않는다(incomeSkip)
 * ④ 최종 = min(②, ③) · 월 상환 = 금리가 있고 최종 > 0 일 때만 30년 원리금균등
 */
import {
  DSR_LIMIT_BANK,
  LOAN_TERM_YEARS,
  calcLTV,
  calcMonthlyPayment,
  maxPrincipalForAnnualPayment,
  stressAddFor,
} from "./loanRules";
import { metroSidoOf } from "./regulation-codes";

export interface SecondLienInput {
  /** 집값(만원) */
  price: number;
  /** 규제 구역 — null 이면 모름(비규제로 셈) */
  zone: "overheated" | "normal" | null;
  /** 시도 표기(흔들려도 됨 — 수도권 판정에 짧은 이름으로 바꿔 쓴다) */
  sido: string | null | undefined;
  /** 선순위 담보대출 잔액(만원) */
  firstLien?: number | null;
  /** 임차보증금(만원) */
  deposit?: number | null;
  /** 연소득(세전, 만원) — 빈칸·0 이하 = 입력 안 함 */
  income?: number | null;
  /** 기존 대출 월 상환(만원) */
  existingMonthly?: number | null;
  /** 금리(연 %) — 빈칸·0 이하 = 입력 안 함 */
  ratePct?: number | null;
}

export interface SecondLienResult {
  regionLimit: number;
  afterLiens: number;
  incomeLimit: number | null;
  incomeSkip: "no-income" | "no-rate" | null;
  stressRate: number | null;
  loan: number;
  monthly: number | null;
}

/** 0 이하·NaN·빈 값은 "입력 안 함" */
function positiveOrNull(v: number | null | undefined): number | null {
  return v != null && Number.isFinite(v) && v > 0 ? v : null;
}

export function secondLienLimit(input: SecondLienInput): SecondLienResult {
  const zone = input.zone ?? "normal";
  const sido = metroSidoOf(input.sido);
  const regionLimit = calcLTV(input.price, zone, sido);
  const liens = (positiveOrNull(input.firstLien) ?? 0) + (positiveOrNull(input.deposit) ?? 0);
  const afterLiens = Math.max(0, regionLimit - liens);

  const income = positiveOrNull(input.income);
  const rate = positiveOrNull(input.ratePct);
  let incomeLimit: number | null = null;
  let incomeSkip: SecondLienResult["incomeSkip"] = null;
  let stressRate: number | null = null;
  if (income == null) incomeSkip = "no-income";
  else if (rate == null) incomeSkip = "no-rate";
  else {
    stressRate = Math.round((rate + stressAddFor(zone, sido)) * 100) / 100;
    const existingAnnual = (positiveOrNull(input.existingMonthly) ?? 0) * 12;
    const annual = Math.max(0, income * DSR_LIMIT_BANK - existingAnnual);
    incomeLimit = maxPrincipalForAnnualPayment(annual, stressRate, LOAN_TERM_YEARS);
  }

  const loan = incomeLimit == null ? afterLiens : Math.min(afterLiens, incomeLimit);
  const pay = rate != null && loan > 0 ? Math.round(calcMonthlyPayment(loan, rate, LOAN_TERM_YEARS)) : 0;
  return { regionLimit, afterLiens, incomeLimit, incomeSkip, stressRate, loan, monthly: pay > 0 ? pay : null };
}
