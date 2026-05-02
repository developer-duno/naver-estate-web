/**
 * /pricing 마케팅 페이지 테스트 — Hero/플랜 카드/CTA 링크
 * 실행: npx vitest run src/app/__tests__/pricing.test.tsx
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import PricingPage from "../pricing/page";

describe("/pricing 마케팅 페이지", () => {
  it("Hero 제목과 7일 무료 체험 안내가 렌더된다", () => {
    const { container } = render(<PricingPage />);
    expect(screen.getByText(/매물·시세 분석 도구/)).toBeInTheDocument();
    // "7일 무료 체험" 은 <strong> 으로 감싸져 있어 텍스트 노드가 분할됨 → 본문 전체에서 검색
    expect(container.textContent).toMatch(/7일 무료 체험/);
  });

  it("기본·프로 두 플랜 카드가 모두 표시된다", () => {
    render(<PricingPage />);
    expect(screen.getByRole("heading", { name: "기본", level: 3 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "프로", level: 3 })).toBeInTheDocument();
    // "추후 공개" placeholder 가 두 카드 모두에 있음
    expect(screen.getAllByText(/추후 공개/).length).toBeGreaterThanOrEqual(2);
    // "인기" 뱃지가 프로 카드에 있음
    expect(screen.getByText("인기")).toBeInTheDocument();
  });

  it("'무료 체험 시작' / '회원가입' CTA 가 모두 /signup 으로 링크된다", () => {
    render(<PricingPage />);
    const links = screen.getAllByRole("link");
    const signupLinks = links.filter((a) => a.getAttribute("href") === "/signup");
    // Hero CTA + 카드 2개 + 푸터 CTA = 최소 4개
    expect(signupLinks.length).toBeGreaterThanOrEqual(4);
    // "무료 체험 시작" 텍스트가 카드 버튼에 들어감 (PlanCards 통합 검증)
    expect(screen.getAllByText("무료 체험 시작").length).toBe(2);
  });
});
