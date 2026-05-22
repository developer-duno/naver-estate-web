/**
 * /search 페이지 회귀 가드 (PR 4 단계 6)
 * - H1 "검색" (파라미터 없을 때)
 * - 키워드 검색 input (aria-label "단지명 검색")
 * - 모바일 FilterBarMobileSheet 트리거 (PR 4 단계 5 임베드 가드)
 * - 지역 선택 H2 (hasSearchParams=false 시)
 *
 * complex/[no]/__tests__/page-hierarchy.test.tsx 답습 (PR 3a + PR 3b 단계 6 답습).
 * 실행: npx vitest run src/app/search/__tests__/page-search-hierarchy.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";

// API 모킹
vi.mock("@/lib/api", () => ({
  searchComplexes: vi.fn().mockResolvedValue({ complexes: [] }),
  getComplexesByRegion: vi.fn().mockResolvedValue({ complexes: [] }),
  getRegions: vi.fn().mockResolvedValue({}),
}));

// next/navigation: 검색 파라미터 없음 (hasSearchParams=false)
vi.mock("next/navigation", async () => {
  const actual = await vi.importActual<typeof import("next/navigation")>("next/navigation");
  return {
    ...actual,
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
    usePathname: () => "/search",
    useSearchParams: () => new URLSearchParams(),
  };
});

// 의존 훅 mock
vi.mock("@/hooks/useFilterParams", () => ({
  useFilterParams: () => ({
    filters: {}, setFilters: vi.fn(), filterKey: 0,
  }),
}));
vi.mock("@/hooks/useCompare", () => ({
  useCompare: () => ({
    list: [], toggle: vi.fn(), remove: vi.fn(), clear: vi.fn(), isInCompare: () => false, isFull: false,
  }),
}));
vi.mock("@/hooks/useSearchHistory", () => ({
  useSearchHistory: () => ({ history: [], add: vi.fn(), remove: vi.fn() }),
}));
vi.mock("@/hooks/useSmartBack", () => ({
  useSmartBack: () => vi.fn(),
}));

// supabase mock — auth.getSession / getUser 가 null 반환 (비로그인)
vi.mock("@/lib/supabase", () => ({
  createClient: () => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
    from: () => ({
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }),
    }),
  }),
}));

import SearchPage from "../page";

function renderPage() {
  return render(<SearchPage />, { wrapper: TestQueryProvider });
}

describe("/search 페이지 회귀 가드 (PR 4 단계 6)", () => {
  it("H1 '검색' 노출 (파라미터 없을 때)", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1, name: "검색" })).toBeInTheDocument();
    });
  });

  it("키워드 검색 input 노출 (aria-label '단지명 검색', hasSearchParams=false)", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByLabelText("단지명 검색")).toBeInTheDocument();
    });
  });

  it("지역 선택 H2 노출 (hasSearchParams=false)", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "지역 선택" })).toBeInTheDocument();
    });
  });

  it("모바일 FilterBarMobileSheet 트리거 임베드 (PR 4 단계 5 회귀 가드)", async () => {
    renderPage();
    await waitFor(() => {
      const trigger = screen.getByRole("button", { name: /필터 창 열기/ });
      expect(trigger).toBeInTheDocument();
    });
  });
});
