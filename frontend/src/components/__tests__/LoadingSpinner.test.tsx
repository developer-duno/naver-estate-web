/**
 * LoadingSpinner 컴포넌트 테스트
 * 실행: npx vitest run src/components/__tests__/LoadingSpinner.test.tsx
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import LoadingSpinner from "../LoadingSpinner";

describe("LoadingSpinner", () => {
  it("기본 렌더링 — role=status 존재", () => {
    render(<LoadingSpinner />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("message prop → 텍스트 표시", () => {
    render(<LoadingSpinner message="로딩 중입니다" />);
    expect(screen.getByText("로딩 중입니다")).toBeInTheDocument();
  });

  it("message 없으면 텍스트 미표시", () => {
    const { container } = render(<LoadingSpinner />);
    expect(container.querySelector("p")).toBeNull();
  });

  it("size=sm → h-6 w-6 클래스 적용", () => {
    render(<LoadingSpinner size="sm" />);
    const spinner = screen.getByRole("status");
    expect(spinner.className).toContain("h-6");
    expect(spinner.className).toContain("w-6");
  });
});
