/**
 * HomeToolCards 컴포넌트 테스트 — 홈 도구 4종 카드 (미분양/계산기/블로그/도움말)
 * 실행: npx vitest run src/components/__tests__/HomeToolCards.test.tsx
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import HomeToolCards from "../HomeToolCards";

describe("HomeToolCards — 도구 4종 카드", () => {
  it("카드 4개를 정확한 href 로 렌더한다", () => {
    render(<HomeToolCards />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(4);

    const hrefs = links.map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/mibunyang", "/tools", "/blog", "/help"]);
  });

  it("각 카드에 접근성 aria-label 이 있다", () => {
    render(<HomeToolCards />);
    expect(screen.getByRole("link", { name: /미분양 현황/ })).toHaveAttribute("href", "/mibunyang");
    expect(screen.getByRole("link", { name: /부동산 계산기/ })).toHaveAttribute("href", "/tools");
    expect(screen.getByRole("link", { name: /블로그/ })).toHaveAttribute("href", "/blog");
    expect(screen.getByRole("link", { name: /도움말/ })).toHaveAttribute("href", "/help");
  });
});
