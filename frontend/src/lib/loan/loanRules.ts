/**
 * 대출 규칙 숫자와 계산 함수 — 미분양 정본의 **복사본**(세션 482 PR 1b). 손으로 고치지 말 것.
 *
 * 원본 = F:/mibunyang 의 아래 파일 @ 커밋 415729ee(미분양 main 0722cf97) · 2026-10-26 복사.
 *   - src/constants/regulations.ts : Zone · NORMAL_LTV · METRO_LOAN_CAP · METRO_REGIONS · REGULATED_LTV_RATE ·
 *     REGULATED_LTV_CAPS · isMetroRegion · calcLTV
 *   - src/constants/loanRules.ts   : LOAN_RULES_BASIS · DSR_LIMIT_BANK · LOAN_TERM_YEARS · STRESS_RATE_METRO ·
 *     STRESS_RATE_LOCAL · STRESS_RATE_LOCAL_UNTIL · stressAddFor
 *   - src/lib/fundingPlan.ts       : maxPrincipalForAnnualPayment
 *   - src/lib/loanRates.ts         : calcMonthlyPayment (fundingPlan.ts 가 여기서 import 한다)
 * 정본은 미분양이다 — 원본이 바뀌면 이 파일을 다시 복사하고 loanRules.test.ts 의 동일성 표를 원본으로 다시 뽑는다.
 * 분양 전용(ltvForPresale·경과규정·GRANDFATHER_RULES·planFunding)과 이름 판정(getZone·ZONE_MAP)은 복사하지 않는다 —
 * 2u 의 규제지역 판정은 시군구 코드로 한다(./regulation-codes.ts).
 */

// ── src/constants/regulations.ts ─────────────────────────────────────────────

export type Zone = "speculative" | "overheated" | "normal";

// 비규제지역 LTV (무주택자 기준) — 70% 하나. 금융위 10·15 대책 FAQ(2025-10-17)의 비규제지역 70%.
// 옛 "9억 이하 70% / 초과분 60%" 나눔은 공식 기준이 아니어서 지웠다(세션592).
export const NORMAL_LTV = 0.7;

// 수도권(서울·경기·인천) 주택구입 주담대 최대 한도 (만원) — 구역(규제·비규제)과 상관없이 6억.
// 금융위 「가계부채 관리 강화 방안」 2025-06-27 발표, 2025-06-28 시행. 지방은 이 한도가 없다.
export const METRO_LOAN_CAP = 60000;
export const METRO_REGIONS: readonly string[] = ["서울", "경기", "인천"];

// 규제지역 LTV 비율 (무주택자 기준, 10·15 대책)
export const REGULATED_LTV_RATE = 0.4;

// 규제지역 주택가격별 대출한도 캡 (만원 단위). 비싼 구간부터 검사한다.
export const REGULATED_LTV_CAPS: ReadonlyArray<{ overPrice: number; cap: number }> = [
  { overPrice: 250000, cap: 20000 }, // 25억 초과 → 2억
  { overPrice: 150000, cap: 40000 }, // 15억 초과 → 4억
];

/** 수도권(서울·경기·인천)인가 — region 이 "경기,서울" 같은 복합값이면 `getZone` 처럼 첫 값으로 본다. */
export function isMetroRegion(region?: string | null): boolean {
  const r = (region ?? "").split(",")[0].trim().normalize("NFC");
  return METRO_REGIONS.includes(r);
}

/**
 * LTV 대출한도 계산 (만원 단위, **무주택자 기준** — 실제 한도는 소득·신용·기존 대출에 따라
 * 더 낮아질 수 있으니 금융기관 확인이 필요하다).
 *
 * - 비규제지역: 70% (금융위 10·15 대책 FAQ)
 * - 규제지역: 40% 단일 비율. 단 집값이 비싸면 금액 자체에 뚜껑이 씌워진다
 *   (15억 초과 4억 / 25억 초과 2억). 2025 「10·15 대책」.
 * - 수도권(서울·경기·인천)은 위 결과에 다시 최대 6억(`METRO_LOAN_CAP`) — 2025-06-28 시행.
 *   그래서 시도(`region`)를 꼭 받는다. 지방 비규제는 금액 한도가 없다.
 */
export function calcLTV(price: number | null | undefined, zone: Zone, region: string | null | undefined): number {
  const p = price ?? 0;
  let loan: number;
  if (zone === "normal") {
    loan = Math.round(p * NORMAL_LTV);
  } else {
    const base = Math.round(p * REGULATED_LTV_RATE);
    const capped = REGULATED_LTV_CAPS.find((c) => p > c.overPrice);
    loan = capped ? Math.min(base, capped.cap) : base;
  }
  return isMetroRegion(region) ? Math.min(loan, METRO_LOAN_CAP) : loan;
}

// ── src/constants/loanRules.ts ───────────────────────────────────────────────

/** 화면에 적는 기준일 — 금융 탭의 "2026년 10월 기준" 글자는 전부 이 값에서 조립한다(한 곳만 바꾸면 된다). */
export const LOAN_RULES_BASIS = "2026년 10월";

/**
 * 은행권 DSR 한도 40% — 연소득 대비 모든 대출의 연 원리금 상환액 비율.
 * 2금융권(저축은행·여신전문·보험)은 50% — 계산기는 은행 기준으로만 계산하고 2금융권은 안내 문장으로만 말한다.
 */
export const DSR_LIMIT_BANK = 0.4;

/** 원리금균등 상환 기간(년) — 금융 탭 "한 달에 갚을 돈"(`BankLoanBlocks.tsx` LOAN_YEARS)과 같은 30년 */
export const LOAN_TERM_YEARS = 30;

/**
 * 스트레스 DSR 3단계 가산 금리(%p) — 수도권(서울·경기·인천)·규제지역 주담대. 2025-10-16 부터 3.0% 이상
 * (금융위 10·15 대책). 변동금리 기준 값이다(고정·주기형은 가산이 줄어든다 — 계산기는 큰 쪽으로 잡아 한도가 작게 나온다).
 */
export const STRESS_RATE_METRO = 3.0;

/**
 * 지방(수도권·규제지역 밖) 주담대 스트레스 가산(%p) — 2단계 비율 유지, 2026-12-31 까지.
 * 원문: 금융위원회공고 제2026-362호 「3단계 스트레스 DSR 제도」 행정지도 변경 예고(2026-06-18)
 *   "수도권·규제지역 外 주담대의 경우 2단계 비율을 적용(~'26.12.31일 까지)"
 *   https://better.fsc.go.kr/fsc_new/status/adminMap/PrvntcDetail.do?muNo=144&postNo=5349&stNo=11
 * 0.75 = 스트레스금리 1.5% × 2단계 50% (공고에 숫자가 직접 나오지 않는다 — 은행연합회 2026-06-30 인용 보도
 *   "실제로 적용되는 지방 주담대의 스트레스 금리는 1.5%의 절반인 0.75%포인트 수준" https://view.asiae.co.kr/article/2026063015591295914).
 */
export const STRESS_RATE_LOCAL = 0.75;
/** `STRESS_RATE_LOCAL` 이 유효한 마지막 날 — 스트레스 금리는 6월·12월에 다시 정해진다(그 뒤는 미정) */
export const STRESS_RATE_LOCAL_UNTIL = "2026-12-31";

/** 스트레스 가산(%p) — 수도권 또는 규제지역이면 3.0, 아니면 0.75 */
export function stressAddFor(zone: Zone, region?: string | null): number {
  return zone !== "normal" || isMetroRegion(region) ? STRESS_RATE_METRO : STRESS_RATE_LOCAL;
}

// ── src/lib/fundingPlan.ts ───────────────────────────────────────────────────

/**
 * 연 상환 가능액으로 갚을 수 있는 최대 원금(만원, 내림) — 원리금균등. 금리 %·기간 년.
 * 월 상환 m, 월 금리 r, 횟수 n → 원금 = m × (1 − (1+r)^−n) / r.
 */
export function maxPrincipalForAnnualPayment(annualPayment: number, annualRatePct: number, years: number): number {
  if (!(annualPayment > 0) || !(annualRatePct > 0) || !(years > 0)) return 0;
  const m = annualPayment / 12;
  const r = annualRatePct / 100 / 12;
  const n = years * 12;
  return Math.floor((m * (1 - Math.pow(1 + r, -n))) / r);
}

// ── src/lib/loanRates.ts ─────────────────────────────────────────────────────

/** 원리금균등 월 상환액 (원금과 같은 단위 — 만원이면 만원) */
export function calcMonthlyPayment(principal: number, annualRate: number, years: number): number {
  if (!principal || !annualRate || !years) return 0;
  const r = annualRate / 100 / 12;
  const n = years * 12;
  return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}
