/**
 * CrawlProgressBanner 단위 테스트
 * 실행: npx vitest run src/components/__tests__/CrawlProgressBanner.test.tsx
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { CrawlProgress } from "@/types";
import CrawlProgressBanner from "../CrawlProgressBanner";

describe("CrawlProgressBanner — 크롤 진행률 배너", () => {
  it("crawling=false 이면 null 렌더 (unmount)", () => {
    const { container } = render(
      <CrawlProgressBanner progress={null} crawling={false} />,
    );
    expect(container.textContent).toBe("");
  });

  it("progress=null + crawling=true → fallback 뷰 ('크롤링 준비 중...' + 2단계 전부 대기)", () => {
    render(<CrawlProgressBanner progress={null} crawling={true} />);
    expect(screen.getByText("크롤링 준비 중...")).toBeInTheDocument();
    expect(screen.getByText("매물 목록 받기")).toBeInTheDocument();
    expect(screen.getByText("매물 상세 받기")).toBeInTheDocument();
  });

  it("progress=null + crawling=true + fallbackMessage 제공 시 문구 교체", () => {
    render(
      <CrawlProgressBanner
        progress={null}
        crawling={true}
        fallbackMessage="서버 응답 확인 중..."
      />,
    );
    expect(screen.getByText("서버 응답 확인 중...")).toBeInTheDocument();
  });

  it("phase=articles → 1단계 활성 + article_count/current_page 카운터 표시", () => {
    const progress: CrawlProgress = {
      complex_no: "5817",
      status: "running",
      phase: "articles",
      article_count: 42,
      current_page: 3,
    };
    render(<CrawlProgressBanner progress={progress} crawling={true} />);
    expect(screen.getByText("매물 목록 받는 중 · 42건 (3페이지)")).toBeInTheDocument();
    // 1단계 라벨 + 2단계 라벨 모두 렌더
    expect(screen.getByText("매물 목록 받기")).toBeInTheDocument();
    expect(screen.getByText("매물 상세 받기")).toBeInTheDocument();
  });

  it("phase=details + detail_total=120 + detail_crawled_count=34 → '34/120건' + 진행바 width 28%", () => {
    const progress: CrawlProgress = {
      complex_no: "5817",
      status: "running",
      phase: "details",
      detail_crawled_count: 34,
      detail_total: 120,
    };
    const { container } = render(<CrawlProgressBanner progress={progress} crawling={true} />);
    expect(screen.getByText("매물 상세 받는 중 · 34/120건")).toBeInTheDocument();
    // 진행바 inner div 의 style.width 확인 (34/120 = 28.33% → round 28%)
    const bars = container.querySelectorAll("div[style*='width']");
    const widths = Array.from(bars).map(
      (b) => (b as HTMLElement).style.width,
    );
    expect(widths).toContain("28%");
  });

  it("phase=enriching → 2단계 활성 ('매물 상세 준비 중...')", () => {
    const progress: CrawlProgress = {
      complex_no: "5817",
      status: "running",
      phase: "enriching",
    };
    render(<CrawlProgressBanner progress={progress} crawling={true} />);
    expect(screen.getByText("매물 상세 준비 중...")).toBeInTheDocument();
  });

  it("role=status + aria-live=polite 접근성 속성 렌더 확인", () => {
    render(<CrawlProgressBanner progress={null} crawling={true} />);
    const banner = screen.getByRole("status");
    expect(banner).toHaveAttribute("aria-live", "polite");
    expect(banner.className).toContain("no-print");
  });
});
