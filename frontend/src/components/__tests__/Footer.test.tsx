/**
 * Footer 단위 테스트 — 광고법 컴플라이언스 가드
 * 실행: npx vitest run src/components/__tests__/Footer.test.tsx
 */
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
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

  it("법적 고지 링크 5종 — /terms · /privacy · /refund · /updates · /help", () => {
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
    // 세션 437 의견함 — "고쳤습니다" 는 도움말 바로 앞
    expect(screen.getByRole("link", { name: "고쳤습니다" })).toHaveAttribute(
      "href",
      "/updates",
    );
    const legal = screen.getByRole("navigation", { name: "법적 고지" });
    const labels = Array.from(legal.querySelectorAll("a")).map((a) => a.textContent);
    expect(labels).toEqual(["이용약관", "개인정보처리방침", "환불정책", "고쳤습니다", "도움말"]);
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

  /**
   * 세션 432 — "함께 보면 좋은 사이트" 외부 링크 2개. 새 창 + noopener 보안 속성 회귀 가드.
   * 세션 438 — 카드형으로 변경: 이름 + 설명 + "준비 중" 꼬리표를 각각 단언.
   */
  it("함께 보면 좋은 사이트 — 외부 링크 2개가 새 창·noopener 로 연다", () => {
    render(<Footer />);
    const navi = screen.getByRole("navigation", {
      name: "함께 보면 좋은 사이트",
    });
    expect(navi).toBeInTheDocument();

    const mibunyangLink = screen.getByRole("link", {
      name: /미분양 아파트 비교/,
    });
    expect(mibunyangLink).toHaveAttribute(
      "href",
      "https://mibunyang-peach.vercel.app",
    );
    expect(mibunyangLink).toHaveAttribute("target", "_blank");
    expect(mibunyangLink.getAttribute("rel")).toContain("noopener");
    expect(
      screen.getByText("전국 미분양 아파트를 모아 비교해요"),
    ).toBeInTheDocument();

    const sanggaLink = screen.getByRole("link", {
      name: /상가 공간분석/,
    });
    expect(sanggaLink).toHaveAttribute(
      "href",
      "https://sangga-one.vercel.app",
    );
    expect(sanggaLink).toHaveAttribute("target", "_blank");
    expect(sanggaLink.getAttribute("rel")).toContain("noopener");
    expect(
      screen.getByText("상가 자리와 주변 상권을 살펴봐요"),
    ).toBeInTheDocument();
    expect(within(sanggaLink).getByText("준비 중")).toBeInTheDocument();
  });
});
