/**
 * HintIcon 컴포넌트 테스트 — 인라인 도움말 툴팁
 * 실행: npx vitest run src/components/__tests__/HintIcon.test.tsx
 */
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import HintIcon from "../HintIcon";

describe("HintIcon", () => {
  it("? 아이콘이 렌더링된다", () => {
    render(<HintIcon text="도움말 텍스트" />);
    expect(screen.getByText("?")).toBeInTheDocument();
  });

  it("title 속성에 도움말 텍스트가 있다", () => {
    render(<HintIcon text="필터링 안내" />);
    expect(screen.getByTitle("필터링 안내")).toBeInTheDocument();
  });

  it("aria-label이 도움말로 설정된다", () => {
    render(<HintIcon text="테스트" />);
    expect(screen.getByLabelText("도움말")).toBeInTheDocument();
  });

  it("클릭 시 툴팁이 표시된다 (모바일 터치 대응)", () => {
    render(<HintIcon text="클릭 테스트" />);
    const btn = screen.getByLabelText("도움말");
    const tooltip = screen.getByRole("tooltip");

    // 초기: 숨김
    expect(tooltip.className).toContain("invisible");

    // 클릭: 표시
    fireEvent.click(btn);
    expect(tooltip.className).toContain("opacity-100");
    expect(tooltip.className).not.toContain("invisible");

    // 다시 클릭: 숨김
    fireEvent.click(btn);
    expect(tooltip.className).toContain("invisible");
  });

  it("tooltip role이 있다", () => {
    render(<HintIcon text="역할 테스트" />);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });
});
