/**
 * 평형표를 받기 전엔 매매 매물 평균 요청을 켜지 않는다 — 페이지가 ComplexDashboard 에 pyeongReady 를 잇는지 (세션 475 보완 Q5)
 *
 * 대표 면적·시세가 없는 단지에서, 평형표 요청이 끝나기 전엔 avgEnabled=false · 끝난 뒤엔 true.
 * 페이지의 `pyeongReady={!pyeongQuery.isPending}` 줄을 지우면(기본값 true) 첫 단언이 실패한다.
 * mock 묶음은 page-hierarchy.test.tsx 와 같다(useComplexArticleAvg 만 받은 인자를 기록하게 바꿈).
 * 실행: npx vitest run src/app/complex/[no]/__tests__/page-pyeong-ready.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";

const pyeong = vi.hoisted(() => ({ resolve: null as null | ((v: unknown) => void) }));
const avgCalls = vi.hoisted(() => [] as unknown[][]);

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
  // 평형표 응답은 시험이 직접 풀어 준다 — 그 전까지는 요청 중
  getPyeongDetails: vi.fn(() => new Promise((resolve) => { pyeong.resolve = resolve; })),
  getPriceStats: vi.fn().mockResolvedValue({
    complex_no: "12345", total_articles: 0, by_area: [], by_floor: [],
  }),
  getPriceHistory: vi.fn().mockResolvedValue({ complex_no: "12345", items: [] }),
  startPriceCollect: vi.fn().mockResolvedValue({ complex_no: "12345", status: "fresh" }),
  getPriceCollectStatus: vi.fn().mockResolvedValue({
    complex_no: "12345", status: "idle", collected: 0, failed: 0, total: 0,
  }),
}));

vi.mock("@/hooks/useComplexArticleAvg", () => ({
  useComplexArticleAvg: (...args: unknown[]) => {
    avgCalls.push(args);
    return { avgPrice: null, count: 0, isLoading: false, isError: false };
  },
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
// crawlState 를 바꿔 진행·완료 안내 자리를 시험한다 (세션 447)
const crawlState = vi.hoisted(() => ({
  current: {
    crawling: false, message: "", messageType: "", progress: null as unknown,
  } as Record<string, unknown>,
  applyPendingRefresh: (() => {}) as () => void,
}));
vi.mock("@/hooks/useCrawlAction", () => ({
  useCrawlAction: () => ({
    staleLabel: null, pendingRefresh: null,
    ...crawlState.current,
    applyPendingRefresh: () => crawlState.applyPendingRefresh(),
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
vi.mock("@/hooks/useSessionToken", () => ({
  useSessionToken: () => ({
    sessionToken: undefined,
    tokenError: false,
    dismissTokenError: vi.fn(),
  }),
}));
vi.mock("@/hooks/useArticleViewPreferences", () => ({
  useArticleViewPreferences: () => ({
    articleViewMode: "medium",
    pageSize: 10,
    setPageSize: vi.fn(),
    handleViewModeChange: vi.fn(),
  }),
}));
vi.mock("@/hooks/usePopstateRefresh", () => ({
  usePopstateRefresh: () => ({ navKey: 0 }),
}));

import ComplexDetailPage from "../page";

describe("ComplexDetailPage — 평형표 받기 전 매매 평균 요청 꺼짐 (세션 475 Q5)", () => {
  it("평형표 요청 중엔 avgEnabled=false, 응답을 받은 뒤엔 true", async () => {
    render(<ComplexDetailPage />, { wrapper: TestQueryProvider });

    await waitFor(() => expect(avgCalls.length).toBeGreaterThan(0));
    await waitFor(() => expect(pyeong.resolve).not.toBeNull());
    const opts = (call: unknown[]) => call[2] as { avgEnabled: boolean };
    expect(avgCalls.every((c) => opts(c).avgEnabled === false)).toBe(true);

    pyeong.resolve!({ pyeong_details: [] });
    await waitFor(() => expect(opts(avgCalls[avgCalls.length - 1]).avgEnabled).toBe(true));
  });
});
