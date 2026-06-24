/**
 * Footer 단위 테스트 — 광고법 컴플라이언스 가드
 * 실행: npx vitest run src/components/__tests__/Footer.test.tsx
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Footer from "@/components/Footer";

describe("Footer — 광고법 면책 조항", () => {
  it("면책 텍스트 노출 — '보장하지 않습니다' + '공인중개사 확인'", () => {
    render(<Footer />);
    expect(
      screen.getByText(/정확성·완전성·적시성을 보장하지 않습니다/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/반드시 공인중개사를 통해 확인/),
    ).toBeInTheDocument();
  });

  it("법적 고지 링크 4종 — /terms · /privacy · /refund · /help", () => {
    render(<Footer />);
    expect(screen.getByRole("link", { name: "이용약관" })).toHaveAttribute(
      "href",
      "/terms",
    );
    expect(
      screen.getByRole("link", { name: "개인정보처리방침" }),
    ).toHaveAttribute("href", "/privacy");
    expect(screen.getByRole("link", { name: "환불정책" })).toHaveAttribute(
      "href",
      "/refund",
    );
    expect(screen.getByRole("link", { name: "도움말" })).toHaveAttribute(
      "href",
      "/help",
    );
  });

  it("데이터 출처 6종 + 카피라이트(연도 포함) 노출", () => {
    render(<Footer />);
    expect(screen.getByText(/네이버 부동산/)).toBeInTheDocument();
    expect(screen.getByText(/국토교통부/)).toBeInTheDocument();
    const year = new Date().getFullYear();
    expect(
      screen.getByText(new RegExp(`© ${year} 2u부동산`)),
    ).toBeInTheDocument();
  });
});
