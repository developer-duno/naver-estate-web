/**
 * HomeToolCards 컴포넌트 테스트 — 홈 「계산기 모음」 7칸(세션 508: 옛 4칸 미분양·계산기·블로그·도움말에서 바뀜 ·
 * 세션 514: 끝에 「계약 체크 목록」 /checklist)
 * 실행: npx vitest run src/components/__tests__/HomeToolCards.test.tsx
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import HomeToolCards from "../HomeToolCards";

describe("HomeToolCards — 계산기 모음 7칸", () => {
  it("카드 7개를 정확한 href 로, 후순위 대출 한도가 맨 앞 · 계약 체크 목록이 맨 끝", () => {
    render(<HomeToolCards />);
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual([
      "/tools/second-mortgage",
      "/tools/acquisition-tax",
      "/tools/transfer-tax",
      "/tools/property-tax",
      "/tools/brokerage-fee",
      "/tools/area-converter",
      "/checklist",
    ]);
    expect(screen.getByRole("link", { name: "계약 체크 목록 — 전세 세입자 · 집주인" })).toHaveAttribute("href", "/checklist");
  });

  it("후순위 대출 한도 칸만 주황 강조", () => {
    render(<HomeToolCards />);
    expect(screen.getByRole("link", { name: /후순위 대출 한도/ }).className).toContain("bg-brand-orange");
    expect(screen.getByRole("link", { name: /취득세/ }).className).not.toContain("bg-brand-orange");
    expect(screen.getByRole("heading", { level: 2, name: "계산기 모음" })).toBeInTheDocument();
  });
});
