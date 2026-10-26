/**
 * 담보 여력 참고 계산 — 2u 전용(세션 482 PR 1b, 설계 §3 S4 ①~④ · 보완 F1 두 모드). 금액은 전부 만원.
 * 입력은 화면 상태에서만 오고 어디에도 저장·전송하지 않는다. 규칙 숫자·함수는 미분양 정본 복사본(./loanRules)만 쓴다.
 *
 * 두 모드(결정 11):
 *  - own(이미 가진 집으로 · 생활안정자금 · 1주택자): ① = 담보가치 × LTV(규제 40% / 그 밖 70%) — 15억·25억 가격별 한도와
 *    수도권 구입 6억은 쓰지 않는다(10·15 FAQ 3-1) · ② = ① − 선순위 − 임차보증금 · 수도권·규제지역이면 ② 를 최대 1억
 *    (LIVING_FUND_CAP_METRO, 2025-06-28 시행). 지방은 금액 상한 없음(금융회사 자율).
 *  - buy(이 집을 사려고 · 무주택 구입): ① = calcLTV(집값, 구역, 시도)(6·4·2억 캡) · ② = ① − 임차보증금(세낀 매매) — 선순위는 없다.
 * 구역을 모르면(null) 비규제로 셈하고 화면이 "규제지역이면 40%" 를 덧붙인다.
 * ③ 소득 기준 = maxPrincipalForAnnualPayment(연소득 × DSR 40% − 기존 연 상환, 금리 + 스트레스 가산, 30년) — 두 모드 공통,
 *    연소득이 없거나 금리가 없으면 계산하지 않는다(incomeSkip)
 * ④ 최종 = min(② 상한 적용 뒤, ③) · 월 상환 = 금리가 있고 최종 > 0 일 때만 30년 원리금균등
 */
import {
  DSR_LIMIT_BANK,
  LIVING_FUND_CAP_METRO,
  LOAN_TERM_YEARS,
  NORMAL_LTV,
  REGULATED_LTV_RATE,
  calcLTV,
  calcMonthlyPayment,
  isMetroRegion,
  maxPrincipalForAnnualPayment,
  stressAddFor,
} from "./loanRules";
import { metroSidoOf } from "./regulation-codes";

export type LoanMode = "own" | "buy";

export interface SecondLienInput {
  /** 계산 모드 — 화면 기본은 own(이미 가진 집). 호출부마다 명시한다 */
  mode: LoanMode;
  /** 집값(만원) */
  price: number;
  /** 규제 구역 — null 이면 모름(비규제로 셈) */
  zone: "overheated" | "normal" | null;
  /** 시도 표기(흔들려도 됨 — 수도권 판정에 짧은 이름으로 바꿔 쓴다) */
  sido: string | null | undefined;
  /** 선순위 담보대출 잔액(만원) — own 모드에서만 뺀다 */
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
  /** ① 지역 규칙 한도 */
  regionLimit: number;
  /** ② ① − 빼는 돈(0 아래로 안 감) — 상한 적용 전 */
  afterLiens: number;
  /** 생활안정자금 상한(own 모드 · 수도권·규제지역일 때만 1억, 그 밖 null) */
  livingFundCap: number | null;
  /** ② 에 상한을 씌운 값 — 담보 기준 추가 가능 */
  available: number;
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

/** own 모드에서 1억 상한이 걸리는 곳인가 — 수도권 또는 규제지역 */
export function livingFundCapApplies(zone: SecondLienInput["zone"], sido: string | null | undefined): boolean {
  return zone === "overheated" || isMetroRegion(metroSidoOf(sido));
}

export function secondLienLimit(input: SecondLienInput): SecondLienResult {
  const mode = input.mode;
  const zone = input.zone ?? "normal";
  const sido = metroSidoOf(input.sido);
  const regionLimit =
    mode === "own"
      ? Math.round(input.price * (zone === "overheated" ? REGULATED_LTV_RATE : NORMAL_LTV))
      : calcLTV(input.price, zone, sido);
  const liens = (mode === "own" ? positiveOrNull(input.firstLien) ?? 0 : 0) + (positiveOrNull(input.deposit) ?? 0);
  const afterLiens = Math.max(0, regionLimit - liens);
  const livingFundCap = mode === "own" && livingFundCapApplies(input.zone, input.sido) ? LIVING_FUND_CAP_METRO : null;
  const available = livingFundCap != null ? Math.min(afterLiens, livingFundCap) : afterLiens;

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

  const loan = incomeLimit == null ? available : Math.min(available, incomeLimit);
  const pay = rate != null && loan > 0 ? Math.round(calcMonthlyPayment(loan, rate, LOAN_TERM_YEARS)) : 0;
  return {
    regionLimit, afterLiens, livingFundCap, available, incomeLimit, incomeSkip, stressRate, loan,
    monthly: pay > 0 ? pay : null,
  };
}
