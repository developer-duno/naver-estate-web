/**
 * 홈 소개 문단 + "무료로 시작하기" 버튼 (세션 458 SEO·GEO 2단계)
 * - 소개 문단(h2·설명·링크 3개)은 로그인 여부와 무관하게 항상 보인다(검색·AI 봇이 읽는 본문).
 * - 가입 버튼은 세션 확인이 끝났고(tokenReady) 토큰이 없을 때만 보인다 — 로그인한 사람에겐 안 보인다.
 * 실행: npx vitest run src/app/__tests__/home-intro-cta.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";

const { mockRouter, mockSearchParams, sessionState } = vi.hoisted(() => ({
  mockRouter: { push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() },
  mockSearchParams: new URLSearchParams(),
  sessionState: { sessionToken: undefined as string | undefined, tokenReady: true },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => mockSearchParams,
  usePathname: () => "/",
}));

vi.mock("@/lib/api", () => ({
  getStats: vi.fn().mockResolvedValue({ complex_count: 100, article_count: 200 }),
  getRegions: vi.fn().mockResolvedValue({}),
  searchComplexes: vi.fn().mockResolvedValue({ complexes: [] }),
  getComplexesByRegion: vi.fn().mockResolvedValue({ complexes: [] }),
}));

vi.mock("@/hooks/useSessionToken", () => ({
  useSessionToken: () => ({
    sessionToken: sessionState.sessionToken,
    tokenReady: sessionState.tokenReady,
    tokenError: false,
    dismissTokenError: vi.fn(),
  }),
}));

import HomePage from "../page";

function renderHome() {
  return render(<HomePage />, { wrapper: TestQueryProvider });
}

describe("홈 — 서비스 소개 문단과 가입 버튼", () => {
  beforeEach(() => {
    sessionState.sessionToken = undefined;
    sessionState.tokenReady = true;
  });

  it("소개 문단(h2·설명·계산기/블로그/도움말 링크)이 항상 보인다", () => {
    renderHome();
    expect(screen.getByRole("heading", { level: 2, name: "2u부동산은 무엇을 하나요" })).toBeInTheDocument();
    expect(screen.getByText(/네이버 부동산에\s*올라온 매물을 실시간으로/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "부동산 계산기 5종" })).toHaveAttribute("href", "/tools");
    expect(screen.getByRole("link", { name: "실무 가이드 블로그" })).toHaveAttribute("href", "/blog");
    expect(screen.getByRole("link", { name: "사용 가이드" })).toHaveAttribute("href", "/help");
  });

  it("비로그인(세션 확인 끝·토큰 없음)이면 '무료로 시작하기' → /signup 버튼이 보인다", () => {
    renderHome();
    expect(screen.getByRole("link", { name: "무료로 시작하기" })).toHaveAttribute("href", "/signup");
    expect(screen.getByText(/관리자 승인/)).toBeInTheDocument();
  });

  it("로그인 상태면 가입 버튼이 없다", () => {
    sessionState.sessionToken = "token-abc";
    renderHome();
    expect(screen.queryByRole("link", { name: "무료로 시작하기" })).not.toBeInTheDocument();
  });

  it("세션 확인이 아직 안 끝났으면(tokenReady=false) 버튼을 미리 그리지 않는다", () => {
    sessionState.tokenReady = false;
    renderHome();
    expect(screen.queryByRole("link", { name: "무료로 시작하기" })).not.toBeInTheDocument();
  });
});
