/**
 * PR 3a 정보 위계 회귀 가드 — spec L323 "시세 → 매물 → 실거래가 추이 → 단지 정보".
 * 누군가 page.tsx 의 section 한 줄 옮기면 즉시 회귀.
 *
 * e2e 환경은 BE 단지 데이터가 없으면 ComplexLoadState 상태에 머물러 H2 가 안 나옴.
 * 따라서 useQuery mock 으로 vitest 통합 테스트.
 *
 * 실행: npx vitest run src/app/complex/[no]/__tests__/page-hierarchy.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";

// 모든 API 모킹 — 단지/매물/면적/시세 fresh 응답
vi.mock("@/lib/api", () => ({
  getComplex: vi.fn().mockResolvedValue({
    complex_no: "12345",
    complex_name: "테스트단지",
    real_estate_type_name: "아파트",
    address: "서울시 강남구",
    total_household_count: 500,
    filter_options: {},
  }),
  getArticles: vi.fn().mockResolvedValue({ articles: [], total: 0 }),
  getPyeongDetails: vi.fn().mockResolvedValue({ pyeong_details: [] }),
  getPriceStats: vi.fn().mockResolvedValue({
    complex_no: "12345", total_articles: 0, by_area: [], by_floor: [],
  }),
  getPriceHistory: vi.fn().mockResolvedValue({ complex_no: "12345", items: [] }),
  startPriceCollect: vi.fn().mockResolvedValue({ complex_no: "12345", status: "fresh" }),
  getPriceCollectStatus: vi.fn().mockResolvedValue({
    complex_no: "12345", status: "idle", collected: 0, failed: 0, total: 0,
  }),
}));

// next/navigation: useParams override
vi.mock("next/navigation", async () => {
  const actual = await vi.importActual<typeof import("next/navigation")>("next/navigation");
  return {
    ...actual,
    useParams: () => ({ no: "12345" }),
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
    usePathname: () => "/complex/12345",
    useSearchParams: () => new URLSearchParams(),
  };
});

// useCrawlAction · useExport · useFilterParams · useFavorites · useSmartBack mock
vi.mock("@/hooks/useCrawlAction", () => ({
  useCrawlAction: () => ({
    crawling: false, message: "", messageType: "", progress: null,
    clearMessage: vi.fn(), handleCrawl: vi.fn(),
  }),
}));
vi.mock("@/hooks/useExport", () => ({
  useExport: () => ({
    exporting: false, exportError: "", clearExportError: vi.fn(), handleExport: vi.fn(),
  }),
}));
vi.mock("@/hooks/useFilterParams", () => ({
  useFilterParams: () => ({
    filters: {}, page: 1, sortBy: "", setFilters: vi.fn(), setPage: vi.fn(), setSortBy: vi.fn(),
  }),
}));
vi.mock("@/hooks/useFavorites", () => ({
  useFavoriteStatus: () => ({ starred: false, toggle: vi.fn() }),
}));
vi.mock("@/hooks/useSmartBack", () => ({
  useSmartBack: () => vi.fn(),
}));

import ComplexDetailPage from "../page";

function renderPage() {
  return render(<ComplexDetailPage />, { wrapper: TestQueryProvider });
}

describe("ComplexDetailPage 정보 위계 (spec L323)", () => {
  it("H2 4개가 시세 → 매물 → 실거래가 추이 → 단지 정보 순서로 렌더링", async () => {
    renderPage();
    await waitFor(() => {
      const h2s = screen.getAllByRole("heading", { level: 2 });
      const texts = h2s.map(h => h.textContent);
      expect(texts).toEqual(["시세", "매물", "실거래가 추이", "단지 정보"]);
    });
  });
});
