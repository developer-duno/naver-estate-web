/**
 * 후순위 대출 한도·이자 계산기 화면 시험(세션 508)
 * - 처음엔 비율 기본 선택이 없고 결과 자리에 안내 글
 * - 네 칸을 채우면 한도·매달 이자가 나온다 · 직접 입력 비율도 쓴다
 * 실행: npx vitest run src/components/__tests__/SecondMortgageCalculator.test.tsx
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SecondMortgageCalculator from "../SecondMortgageCalculator";

describe("SecondMortgageCalculator", () => {
  it("처음엔 비율이 하나도 선택돼 있지 않고 안내 글을 보여 준다", () => {
    render(<SecondMortgageCalculator />);
    for (const v of ["60%", "70%", "80%"]) {
      expect(screen.getByRole("button", { name: v })).toHaveAttribute("aria-pressed", "false");
    }
    expect(screen.getByTestId("sm-guide")).toHaveTextContent("값을 넣으면 계산됩니다");
    expect(screen.queryByTestId("sm-limit")).not.toBeInTheDocument();
    expect(screen.getByText("계산 결과는 입력하신 값으로 계산한 예시입니다.")).toBeInTheDocument();
  });

  it("네 칸을 채우면 한도와 매달 이자를 보여 준다(5억·2억·70%·6%)", async () => {
    const user = userEvent.setup();
    render(<SecondMortgageCalculator />);
    await user.type(screen.getByLabelText("우리 집 시세"), "500000000");
    await user.type(screen.getByLabelText("지금 남아 있는 대출"), "200000000");
    await user.click(screen.getByRole("button", { name: "70%" }));
    expect(screen.getByTestId("sm-guide")).toHaveTextContent("값을 넣으면 계산됩니다");
    await user.type(screen.getByLabelText("연 이자율"), "6");
    expect(screen.getByLabelText("우리 집 시세")).toHaveValue("500,000,000");
    expect(screen.getByTestId("sm-limit")).toHaveTextContent("1억 5,000만원");
    expect(screen.getByTestId("sm-monthly")).toHaveTextContent("750,000원");
  });

  it("직접 입력한 비율을 쓰고, 고른 단추 선택은 풀린다", async () => {
    const user = userEvent.setup();
    render(<SecondMortgageCalculator />);
    await user.type(screen.getByLabelText("우리 집 시세"), "500000000");
    await user.type(screen.getByLabelText("지금 남아 있는 대출"), "0");
    await user.click(screen.getByRole("button", { name: "80%" }));
    await user.type(screen.getByLabelText("담보 인정 비율 직접 입력"), "50");
    expect(screen.getByRole("button", { name: "80%" })).toHaveAttribute("aria-pressed", "false");
    await user.type(screen.getByLabelText("연 이자율"), "4.8");
    expect(screen.getByTestId("sm-limit")).toHaveTextContent("2억 5,000만원");
    expect(screen.getByTestId("sm-monthly")).toHaveTextContent("1,000,000원");
  });

  it("비율이 100 을 넘으면 고쳐 넣으라는 글", async () => {
    const user = userEvent.setup();
    render(<SecondMortgageCalculator />);
    await user.type(screen.getByLabelText("우리 집 시세"), "500000000");
    await user.type(screen.getByLabelText("지금 남아 있는 대출"), "0");
    await user.type(screen.getByLabelText("담보 인정 비율 직접 입력"), "120");
    await user.type(screen.getByLabelText("연 이자율"), "5");
    expect(screen.getByTestId("sm-guide")).toHaveTextContent("100 이하로 넣어 주세요");
  });
});
