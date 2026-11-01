/**
 * 홈 '★ 즐겨찾기 매물 →' 링크 — 로그인한 손님에게만 보인다 (세션 493).
 * 매물은 로그인 뒤 기능이라 비로그인·세션 확인 전에는 링크를 그리지 않는다.
 * 실행: npx vitest run src/app/__tests__/home-favorites-link.test.tsx
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

function favoritesLinks() {
  return document.querySelectorAll('a[href="/search/favorites"]');
}

describe("홈 — 즐겨찾기 매물 링크", () => {
  beforeEach(() => {
    sessionState.sessionToken = undefined;
    sessionState.tokenReady = true;
  });

  it("비로그인이면 링크가 없다", () => {
    render(<HomePage />, { wrapper: TestQueryProvider });
    expect(favoritesLinks()).toHaveLength(0);
    expect(screen.queryByText(/즐겨찾기 매물/)).not.toBeInTheDocument();
  });

  it("세션 확인 전(토큰 없음·tokenReady=false)에도 링크가 없다", () => {
    sessionState.tokenReady = false;
    render(<HomePage />, { wrapper: TestQueryProvider });
    expect(favoritesLinks()).toHaveLength(0);
  });

  it("로그인 상태면 링크가 1개 보인다", () => {
    sessionState.sessionToken = "token-abc";
    render(<HomePage />, { wrapper: TestQueryProvider });
    expect(favoritesLinks()).toHaveLength(1);
    expect(screen.getByText(/즐겨찾기 매물/)).toBeInTheDocument();
  });
});
