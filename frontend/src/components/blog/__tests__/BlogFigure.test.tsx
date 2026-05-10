/**
 * BlogFigure 컴포넌트 테스트 — caption + alt + priority + aspect 분기
 * 실행: npx vitest run src/components/blog/__tests__/BlogFigure.test.tsx
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import BlogFigure from "../BlogFigure";

describe("BlogFigure", () => {
  it("src + alt 받아 next/image 렌더한다", () => {
    render(<BlogFigure src="/images/blog/compare-workflow.svg" alt="비교 화면" />);
    const img = screen.getByRole("img");
    expect(img.getAttribute("alt")).toBe("비교 화면");
    expect(img.getAttribute("src")).toContain("compare-workflow");
  });

  it("caption 있으면 figcaption 렌더, 없으면 부재", () => {
    const { rerender, container } = render(
      <BlogFigure src="/images/blog/test.svg" alt="테스트" caption="설명 텍스트" />
    );
    expect(screen.getByText("설명 텍스트")).toBeTruthy();
    expect(container.querySelector("figcaption")).toBeTruthy();

    rerender(<BlogFigure src="/images/blog/test.svg" alt="테스트" />);
    expect(container.querySelector("figcaption")).toBeNull();
  });

  it("priority=true 일 때 next/Image priority 전파 (loading != lazy)", () => {
    render(<BlogFigure src="/images/blog/test.svg" alt="테스트" priority />);
    const img = screen.getByRole("img");
    // BlogHero.test.tsx 답습: priority=true 시 loading 이 lazy 가 아님
    expect(img.getAttribute("loading")).not.toBe("lazy");
  });

  it("aspect prop 별 className 적용 (video / square / portrait)", () => {
    const { rerender, container } = render(
      <BlogFigure src="/test.svg" alt="t" aspect="video" />
    );
    expect(container.querySelector(".aspect-video")).toBeTruthy();

    rerender(<BlogFigure src="/test.svg" alt="t" aspect="square" />);
    expect(container.querySelector(".aspect-square")).toBeTruthy();

    rerender(<BlogFigure src="/test.svg" alt="t" aspect="portrait" />);
    expect(container.querySelector(".aspect-\\[3\\/4\\]")).toBeTruthy();
  });
});
