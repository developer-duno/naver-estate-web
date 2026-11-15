/**
 * 홈 개편 화면(세션 508 · 사장님 결정 2026-11-15) — 옛 「2u부동산은 무엇을 하나요」 소개·「무료로 시작하기」·단지/매물 숫자 시험을 갈음.
 * - 머리: 「로그인 없이 · 무료」 · h1 · 설명, 매물·단지 숫자와 getStats 호출 없음
 * - 대출 판 · 지역별 실거래가 17곳(/region#시도, 미리 받기 끔) · 계산기 모음(후순위 대출 한도) · 가이드 3편(대출 글 맨 앞)
 * 실행: npx vitest run src/app/__tests__/home-intro-cta.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";

const { mockRouter, mockSearchParams, getStats } = vi.hoisted(() => ({
  mockRouter: { push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() },
  mockSearchParams: new URLSearchParams(),
  getStats: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => mockSearchParams,
  usePathname: () => "/",
}));

// next/link 가짜 — prefetch 값을 data-prefetch 로 드러낸다(지역 링크의 미리 받기 끔 확인)
vi.mock("next/link", async () => {
  const React = await import("react");
  return {
    default: ({ children, href, prefetch, ...props }: { children: React.ReactNode; href: string; prefetch?: boolean }) =>
      React.createElement("a", { href, "data-prefetch": String(prefetch), ...props }, children),
  };
});

vi.mock("@/lib/api", () => ({
  getStats,
  getRegions: vi.fn().mockResolvedValue({}),
  searchComplexes: vi.fn().mockResolvedValue({ complexes: [] }),
  getComplexesByRegion: vi.fn().mockResolvedValue({ complexes: [] }),
  getRegionHubTrend: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/hooks/useSessionToken", () => ({
  useSessionToken: () => ({ sessionToken: undefined, tokenReady: true, tokenError: false, dismissTokenError: vi.fn() }),
}));

import HomePage from "../page";

function renderHome() {
  return render(<HomePage />, { wrapper: TestQueryProvider });
}

describe("홈 개편 — 머리", () => {
  it("작은 줄·h1·설명을 그리고 h1 은 하나", () => {
    renderHome();
    expect(screen.getByText("로그인 없이 · 무료")).toBeInTheDocument();
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent("우리 아파트, 요즘 얼마에 거래됐을까요");
    expect(screen.getByText("국토교통부 실거래가 · 공시가격 · 한국부동산원 지역 시세를 한곳에서 봅니다.")).toBeInTheDocument();
  });

  it("매물·단지 숫자·통계 로딩·옛 소개·가입 단추가 없고 getStats 를 부르지 않는다", () => {
    renderHome();
    expect(getStats).not.toHaveBeenCalled();
    expect(screen.queryByText(/통계 로딩/)).not.toBeInTheDocument();
    expect(screen.queryByText("2u부동산은 무엇을 하나요")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "무료로 시작하기" })).not.toBeInTheDocument();
    expect(screen.queryByText("매물")).not.toBeInTheDocument();
  });
});

describe("홈 개편 — 칸", () => {
  it("대출 판 h2·설명·불법 대출 글 링크 · 「후순위 담보대출이 뭔가요」 링크는 없다", () => {
    renderHome();
    expect(screen.getByRole("heading", { level: 2, name: "집을 담보로 더 받을 수 있는 한도부터 확인하세요" })).toBeInTheDocument();
    expect(screen.getByText("아파트 후순위 담보대출")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /불법 대출 광고 거르는 법/ })).toHaveAttribute("href", "/blog/illegal-loan-filter");
    expect(screen.queryByText("후순위 담보대출이 뭔가요")).not.toBeInTheDocument();
    expect(screen.getByLabelText("우리 집 시세")).toBeInTheDocument();
  });

  it("지역별 실거래가 — 시·도 17곳 /region#시도 + 전체 보기, 전부 미리 받기 끔", () => {
    const { container } = renderHome();
    const sido = container.querySelectorAll('a[href^="/region#"]');
    expect(sido).toHaveLength(17);
    expect(sido[0]).toHaveAttribute("href", "/region#서울");
    const all = container.querySelectorAll('a[href^="/region"]');
    all.forEach((a) => expect(a).toHaveAttribute("data-prefetch", "false"));
    expect(screen.getAllByRole("link", { name: /시·군·구 전체 보기/ }).length).toBeGreaterThan(0);
  });

  it("계산기 모음 6칸(후순위 대출 한도 포함) · 가이드 3편(대출 글 맨 앞) · 글 전체 보기", () => {
    const { container } = renderHome();
    expect(screen.getByRole("heading", { level: 2, name: "계산기 모음" })).toBeInTheDocument();
    expect(container.querySelector('a[href="/tools/second-mortgage"]')).not.toBeNull();
    const guide = screen.getByRole("heading", { level: 2, name: "가이드" }).closest("section")!;
    const posts = guide.querySelectorAll('a[href^="/blog/"]');
    expect(posts).toHaveLength(3);
    expect(posts[0]).toHaveAttribute("href", "/blog/illegal-loan-filter");
    expect(screen.getByRole("link", { name: "글 전체 보기 →" })).toHaveAttribute("href", "/blog");
  });

  it("분양·미분양 소식 · 거래 많은 단지 · 방금 신고된 실거래 칸은 없다(1차 범위 밖)", () => {
    renderHome();
    expect(screen.queryByText(/분양 · 미분양 소식/)).not.toBeInTheDocument();
    expect(screen.queryByText(/거래 많은 단지/)).not.toBeInTheDocument();
    expect(screen.queryByText(/방금 신고된 실거래/)).not.toBeInTheDocument();
  });
});
