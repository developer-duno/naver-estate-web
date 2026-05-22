import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ComplexSortDropdown from "../ComplexSortDropdown";

describe("ComplexSortDropdown", () => {
  // 기본 렌더 + 트리거 클릭 시 7개 옵션 노출 (PR 4 단계 2: shadcn Select 패턴 답습,
  // Radix Select 는 trigger 닫혀있을 때 SelectItem 이 portal 안에 렌더 안 됨 →
  // userEvent.click 으로 trigger 열고 옵션 query)
  it("라벨 '정렬:' + 트리거 클릭 시 7개 옵션 노출", async () => {
    const user = userEvent.setup();
    render(<ComplexSortDropdown value="default" onChange={() => {}} />);
    expect(screen.getByText("정렬:")).toBeInTheDocument();
    const trigger = screen.getByLabelText("단지 정렬");
    expect(trigger).toBeInTheDocument();

    await user.click(trigger);

    expect(screen.getByRole("option", { name: "기본순" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "단지명↓" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "세대수↓" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "세대수↑" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "신축순" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "오래된순" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "매물 많은순" })).toBeInTheDocument();
  });

  // value prop 반영: SelectValue 에 현 옵션 라벨 표시
  it("value='household_desc' 전달 시 트리거에 '세대수↓' 라벨 표시", () => {
    render(<ComplexSortDropdown value="household_desc" onChange={() => {}} />);
    const trigger = screen.getByLabelText("단지 정렬");
    expect(trigger.textContent).toContain("세대수↓");
  });

  // onChange 호출: 옵션 선택 시 onValueChange → onChange 콜백
  it("옵션 선택 시 onChange 에 새 값 전달", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ComplexSortDropdown value="default" onChange={onChange} />);
    const trigger = screen.getByLabelText("단지 정렬");
    await user.click(trigger);
    await user.click(screen.getByRole("option", { name: "신축순" }));
    expect(onChange).toHaveBeenCalledWith("year_desc");
  });
});
