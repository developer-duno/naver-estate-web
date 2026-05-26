/**
 * ArticleViewToggle 컴포넌트 테스트 — 매물 카드 보기 모양 토글
 * 실행: npx vitest run src/components/__tests__/ArticleViewToggle.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ArticleViewToggle from "../ArticleViewToggle";

describe("ArticleViewToggle", () => {
  it("3 옵션 (크게/중간/작게) 렌더", () => {
    render(<ArticleViewToggle value="medium" onChange={() => {}} />);
    expect(screen.getByRole("radio", { name: "크게" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "중간" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "작게" })).toBeInTheDocument();
  });

  it("클릭 시 onChange(value) 호출", () => {
    const handler = vi.fn();
    render(<ArticleViewToggle value="medium" onChange={handler} />);
    fireEvent.click(screen.getByRole("radio", { name: "작게" }));
    expect(handler).toHaveBeenCalledWith("compact");
  });

  it("value prop 반영 (medium 선택 상태)", () => {
    render(<ArticleViewToggle value="medium" onChange={() => {}} />);
    const mediumBtn = screen.getByRole("radio", { name: "중간" });
    expect(mediumBtn).toHaveAttribute("data-state", "on");
  });

  it("aria-label='매물 카드 모양' 존재 (a11y)", () => {
    render(<ArticleViewToggle value="medium" onChange={() => {}} />);
    expect(screen.getByRole("group", { name: "매물 카드 모양" })).toBeInTheDocument();
  });
});
