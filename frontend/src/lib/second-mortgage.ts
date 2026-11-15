/**
 * 후순위 담보대출 한도·이자 계산(세션 508 · 사장님 결정 2026-11-15) — 금액은 전부 원.
 * 손님이 넣은 네 값으로만 계산한다(규제 비율·금리 예시를 우리가 정하지 않는다 — 금융위 등록 전).
 *   예상 추가 한도 = max(0, 시세 × 담보 인정 비율 − 남은 대출)
 *   매달 이자(이자만 낼 때) = 한도 × 연 이자율 ÷ 12
 * 단지 화면의 규제 반영 계산(lib/loan/secondLien.ts)과는 다른 계산이다 — 그쪽은 지역 규칙을 쓰고, 이쪽은 손님이 비율을 고른다.
 */

export interface SecondMortgageInput {
  /** 우리 집 시세(원) — 빈칸이면 null */
  priceWon: number | null;
  /** 지금 남아 있는 대출(원) — 없으면 0, 빈칸이면 null */
  debtWon: number | null;
  /** 담보 인정 비율(%) — 손님이 고른 값, 빈칸이면 null */
  ltvPct: number | null;
  /** 연 이자율(%) — 빈칸이면 null */
  ratePct: number | null;
}

export type SecondMortgageResult =
  | { status: "incomplete" }
  | { status: "invalid-ltv" }
  | { status: "ok"; limitWon: number; monthlyInterestWon: number };

const isNum = (v: number | null): v is number => v != null && Number.isFinite(v);

export function calcSecondMortgage(input: SecondMortgageInput): SecondMortgageResult {
  const { priceWon, debtWon, ltvPct, ratePct } = input;
  if (!isNum(priceWon) || priceWon <= 0 || !isNum(debtWon) || debtWon < 0 || !isNum(ltvPct) || !isNum(ratePct) || ratePct < 0) {
    return { status: "incomplete" };
  }
  if (ltvPct <= 0 || ltvPct > 100) return { status: "invalid-ltv" };
  const limitWon = Math.max(0, Math.round((priceWon * ltvPct) / 100 - debtWon));
  const monthlyInterestWon = Math.round((limitWon * ratePct) / 100 / 12);
  return { status: "ok", limitWon, monthlyInterestWon };
}

/** 입력 글자 → 숫자(빈칸 = null). 쉼표·공백은 지운다. 숫자가 아니면 null */
export function parseAmount(text: string): number | null {
  const t = text.replace(/[,\s]/g, "");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** 원 → "1억 5,000만원" 꼴(1만원 미만은 "5,000원" · 0 은 "0원") */
export function formatWonKorean(won: number): string {
  if (won <= 0) return "0원";
  if (won < 10_000) return `${Math.round(won).toLocaleString()}원`;
  const manwon = Math.round(won / 10_000);
  const eok = Math.floor(manwon / 10_000);
  const rest = manwon % 10_000;
  if (eok === 0) return `${rest.toLocaleString()}만원`;
  return rest > 0 ? `${eok}억 ${rest.toLocaleString()}만원` : `${eok}억원`;
}
