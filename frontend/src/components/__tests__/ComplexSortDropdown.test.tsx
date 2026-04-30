import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ComplexSortDropdown from "../ComplexSortDropdown";

describe("ComplexSortDropdown", () => {
  // 기본 렌더 + 라벨/옵션 7종 노출 확인
  it("라벨 '정렬:'과 7개 옵션 노출", () => {
    render(<ComplexSortDropdown value="default" onChange={() => {}} />);
    expect(screen.getByText("정렬:")).toBeInTheDocument();
    expect(screen.getByLabelText("단지 정렬")).toBeInTheDocument();
    // 7개 option 존재 확인
    expect(screen.getByRole("option", { name: "기본순" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "단지명↓" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "세대수↓" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "세대수↑" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "신축순" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "오래된순" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "매물 많은순" })).toBeInTheDocument();
  });

  // value prop 반영: 외부 상태가 select에 반영되는지 검증
  it("value='household_desc' 전달 시 해당 옵션 selected", () => {
    render(<ComplexSortDropdown value="household_desc" onChange={() => {}} />);
    const select = screen.getByLabelText("단지 정렬") as HTMLSelectElement;
    expect(select.value).toBe("household_desc");
  });

  // onChange 호출: 선택 변경 시 콜백에 새 값이 전달되는지 검증
  it("select 변경 시 onChange에 새 값 전달", () => {
    const onChange = vi.fn();
    render(<ComplexSortDropdown value="default" onChange={onChange} />);
    const select = screen.getByLabelText("단지 정렬") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "year_desc" } });
    expect(onChange).toHaveBeenCalledWith("year_desc");
  });
});
