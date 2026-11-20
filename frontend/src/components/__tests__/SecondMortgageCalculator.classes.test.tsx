/**
 * 후순위 계산기 모양 고정 시험(세션 530 · B40 PR 3a) — 클래스를 공용 상수(components/tools/tool-classes.ts)로 옮긴 뒤에도
 * 렌더된 className 글자가 옮기기 전과 한 글자도 같은지 본다(홈 대출 판·후순위 장이 같은 부품이라 모양이 바뀌면 안 된다).
 * 아래 기대 글자는 옮기기 전 SecondMortgageCalculator.tsx 의 글자를 그대로 적은 것이다.
 * 실행: npx vitest run src/components/__tests__/SecondMortgageCalculator.classes.test.tsx
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SecondMortgageCalculator from "../SecondMortgageCalculator";

const INPUT =
  "h-12 w-full rounded-[10px] border border-brand-line bg-white px-3.5 text-base text-brand-navy placeholder:text-brand-muted focus:outline-none focus:ring-2 focus:ring-brand-orange";
const CHOICE_BASE = "h-11 min-w-16 rounded-[10px] border px-3 text-sm font-bold";

describe("SecondMortgageCalculator 클래스 글자(전/후 같음)", () => {
  it("입력 칸·라벨·비율 단추(고른 것/안 고른 것)의 className 이 옛 글자와 같다", async () => {
    const user = userEvent.setup();
    render(<SecondMortgageCalculator />);
    expect(screen.getByLabelText("우리 집 시세").className).toBe(INPUT);
    expect(screen.getByLabelText("지금 남아 있는 대출").className).toBe(INPUT);
    expect(screen.getByLabelText("연 이자율").className).toBe(INPUT);
    expect(screen.getByLabelText("담보 인정 비율 직접 입력").className).toBe(`${INPUT} h-11 w-28`);
    expect(screen.getByText("우리 집 시세").className).toBe("text-[13px] text-brand-muted");
    expect(screen.getByText("연 이자율").className).toBe("text-[13px] text-brand-muted");
    expect(screen.getByText("담보 인정 비율").className).toBe("mb-1.5 text-[13px] text-brand-muted");
    expect(screen.getByRole("button", { name: "60%" }).className).toBe(
      `${CHOICE_BASE} border-brand-line bg-white text-brand-navy hover:bg-brand-bg`,
    );
    await user.click(screen.getByRole("button", { name: "70%" }));
    expect(screen.getByRole("button", { name: "70%" }).className).toBe(
      `${CHOICE_BASE} border-brand-navy bg-brand-navy text-white`,
    );
  });

  it("결과 값 칸 두 개의 className 이 옛 글자와 같다", async () => {
    const user = userEvent.setup();
    render(<SecondMortgageCalculator />);
    expect(screen.getByTestId("sm-guide").className).toBe("rounded-[10px] bg-brand-bg p-3.5 text-sm text-brand-muted");
    await user.type(screen.getByLabelText("우리 집 시세"), "500000000");
    await user.type(screen.getByLabelText("지금 남아 있는 대출"), "200000000");
    await user.click(screen.getByRole("button", { name: "70%" }));
    await user.type(screen.getByLabelText("연 이자율"), "6");
    for (const id of ["sm-limit", "sm-monthly"]) {
      expect(screen.getByTestId(id).parentElement?.className).toBe("rounded-[10px] bg-brand-bg p-3.5");
    }
  });
});
