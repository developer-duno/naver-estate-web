/**
 * /tools 계산기 허브 페이지 스모크 — 계산기 5종 링크 렌더 검증
 * 실행: npx vitest run src/app/tools/__tests__/page.test.tsx
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ToolsHubPage from "../page";

describe("/tools 계산기 허브", () => {
  it("계산기 5종 링크를 정확한 href 로 렌더한다", () => {
    render(<ToolsHubPage />);
    const links = screen.getAllByRole("link");
    const hrefs = links.map((a) => a.getAttribute("href")).sort();
    expect(hrefs).toEqual(
      [
        "/tools/acquisition-tax",
        "/tools/area-converter",
        "/tools/brokerage-fee",
        "/tools/property-tax",
        "/tools/transfer-tax",
      ].sort(),
    );
  });

  it("타이틀 '부동산 계산기 5종' 을 표시한다", () => {
    render(<ToolsHubPage />);
    expect(screen.getByRole("heading", { name: "부동산 계산기 5종" })).toBeInTheDocument();
  });
});
