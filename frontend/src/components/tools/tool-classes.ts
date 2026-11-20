/**
 * 계산기 새 틀 공용 클래스(세션 530 · B40 PR 3a) — 후순위 대출 계산기(SecondMortgageCalculator)의 글자를 그대로 옮겼다.
 * 홈 대출 판·후순위 장이 같은 부품이라 이 글자를 바꾸면 두 화면 모양이 같이 바뀐다
 * (전/후 같음 시험 = components/__tests__/SecondMortgageCalculator.classes.test.tsx).
 */

/** 입력 칸 */
export const TOOL_INPUT_CLASS =
  "h-12 w-full rounded-[10px] border border-brand-line bg-white px-3.5 text-base text-brand-navy placeholder:text-brand-muted focus:outline-none focus:ring-2 focus:ring-brand-orange";

/** 칸 이름(라벨) */
export const TOOL_LABEL_CLASS = "text-[13px] text-brand-muted";

/** 고르는 단추 — 고른 것 */
export const TOOL_CHOICE_ON = "border-brand-navy bg-brand-navy text-white";

/** 고르는 단추 — 안 고른 것 */
export const TOOL_CHOICE_OFF = "border-brand-line bg-white text-brand-navy hover:bg-brand-bg";

/** 결과 값 칸 */
export const TOOL_VALUE_TILE_CLASS = "rounded-[10px] bg-brand-bg p-3.5";
