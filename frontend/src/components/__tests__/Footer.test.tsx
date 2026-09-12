/**
 * Footer 단위 테스트 — 광고법 컴플라이언스 가드
 * 실행: npx vitest run src/components/__tests__/Footer.test.tsx
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Footer from "@/components/Footer";
import { LOCKED_PATHS } from "@/lib/locked-paths";

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

  /**
   * 세션 400 — 잠긴 경로로 가는 뒷문이 푸터에 없는지. 헤더 메뉴만 막고 푸터 링크를
   * 남기면 사용자가 그리로 들어간다(무료 전환의 구멍). 상수를 순회하므로 나중에
   * 잠기는 경로가 늘어도 함께 본다. LOCKED_PATHS 가 비면 0단언 = 의도된 상태.
   */
  it("잠긴 경로(LOCKED_PATHS)로 가는 링크가 푸터에 없다", () => {
    render(<Footer />);
    for (const locked of LOCKED_PATHS) {
      expect(document.querySelector(`a[href^="${locked}"]`)).toBeNull();
    }
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
