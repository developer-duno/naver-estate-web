/**
 * Pagination 컴포넌트 테스트 — 페이지 버튼 UI
 * 실행: npx vitest run src/components/__tests__/Pagination.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Pagination from "../Pagination";

describe("Pagination 컴포넌트", () => {
  const onPageChange = vi.fn();

  /** 기본 렌더링 */
  it("현재 페이지 버튼이 활성 스타일로 표시된다", () => {
    render(<Pagination currentPage={3} totalPages={10} onPageChange={onPageChange} />);
    const activeBtn = screen.getByText("3");
    expect(activeBtn.className).toContain("bg-blue-600");
  });

  /** 이전 버튼 — 첫 페이지면 비활성 */
  it("첫 페이지에서 이전 버튼이 비활성화된다", () => {
    render(<Pagination currentPage={1} totalPages={5} onPageChange={onPageChange} />);
    const prevBtn = screen.getByText("이전");
    expect(prevBtn).toBeDisabled();
  });

  /** 다음 버튼 — 마지막 페이지면 비활성 */
  it("마지막 페이지에서 다음 버튼이 비활성화된다", () => {
    render(<Pagination currentPage={5} totalPages={5} onPageChange={onPageChange} />);
    const nextBtn = screen.getByText("다음");
    expect(nextBtn).toBeDisabled();
  });

  /** 이전 버튼 클릭 → currentPage - 1 */
  it("이전 버튼 클릭 시 currentPage - 1로 onPageChange가 호출된다", () => {
    const changeFn = vi.fn();
    render(<Pagination currentPage={3} totalPages={10} onPageChange={changeFn} />);

    fireEvent.click(screen.getByText("이전"));
    expect(changeFn).toHaveBeenCalledWith(2);
  });

  /** 다음 버튼 클릭 → currentPage + 1 */
  it("다음 버튼 클릭 시 currentPage + 1로 onPageChange가 호출된다", () => {
    const changeFn = vi.fn();
    render(<Pagination currentPage={3} totalPages={10} onPageChange={changeFn} />);

    fireEvent.click(screen.getByText("다음"));
    expect(changeFn).toHaveBeenCalledWith(4);
  });

  /** 페이지 번호 클릭 */
  it("페이지 번호 버튼 클릭 시 해당 페이지로 onPageChange가 호출된다", () => {
    const changeFn = vi.fn();
    render(<Pagination currentPage={3} totalPages={10} onPageChange={changeFn} />);

    fireEvent.click(screen.getByText("5"));
    expect(changeFn).toHaveBeenCalledWith(5);
  });

  /** 말줄임 표시 — 시작/끝에서 먼 경우 */
  it("totalPages가 큰 경우 말줄임(...)이 표시된다", () => {
    render(<Pagination currentPage={5} totalPages={20} onPageChange={onPageChange} />);
    const ellipsis = screen.getAllByText("...");
    expect(ellipsis.length).toBeGreaterThanOrEqual(1);
  });

  /** 1페이지만 있으면 이전/다음 모두 비활성 */
  it("totalPages=1이면 이전/다음 버튼 모두 비활성화된다", () => {
    render(<Pagination currentPage={1} totalPages={1} onPageChange={onPageChange} />);
    expect(screen.getByText("이전")).toBeDisabled();
    expect(screen.getByText("다음")).toBeDisabled();
  });
});
