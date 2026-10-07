/**
 * 정보 위계 회귀 가드 (PR 3a 신설 + PR 6d 데스크톱 통합 후 갱신)
 *
 * PR 6d 이후 = 데스크톱 시세·차트·단지정보 3 섹션이 ComplexDashboard 박스 4 안으로 흡수.
 * 페이지 H2 = "매물" 1개만. 박스 4 라벨 (시세·실거래가·단지정보·면적별 시세) + 매물 섹션이
 * 새로운 위계.
 *
 * e2e 환경은 BE 단지 데이터가 없으면 ComplexLoadState 상태에 머물러 렌더가 안 나옴.
 * 따라서 useQuery mock 으로 vitest 통합 테스트.
 *
 * 실행: npx vitest run src/app/complex/[no]/__tests__/page-hierarchy.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
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

function renderPage() {
  return render(<ComplexDetailPage />, { wrapper: TestQueryProvider });
}

describe("ComplexDetailPage 정보 위계 (PR 6d 데스크톱 통합 후)", () => {
  it("H2 1개 (매물) + ComplexDashboard 박스 4개 (시세·실거래가·단지정보·면적별 시세) 렌더링", async () => {
    renderPage();
    await waitFor(() => {
      // H2 = 매물 1개만 (시세·차트·단지정보 3 섹션은 박스 4 안으로 흡수)
      const h2s = screen.getAllByRole("heading", { level: 2 });
      const texts = h2s.map(h => h.textContent);
      expect(texts).toEqual(["매물"]);

      // 박스 4 = aria-label "단지 종합 대시보드" 안의 4 button (시세·실거래가·단지정보·면적별 시세)
      const dashboard = screen.getByLabelText("단지 종합 대시보드");
      const boxButtons = dashboard.querySelectorAll('button[aria-controls="dashboard-content"]');
      expect(boxButtons).toHaveLength(4);
      const labels = Array.from(boxButtons).map(b => b.getAttribute("aria-label"));
      expect(labels).toEqual([
        "시세 메뉴 열기",
        "실거래가 메뉴 열기",
        "단지정보 메뉴 열기",
        "면적별 시세 메뉴 열기",
      ]);
    });
  });

  it("모바일 필터 시트 트리거가 매물 섹션에 임베드 (PR 3b 회귀 가드)", async () => {
    renderPage();
    await waitFor(() => {
      const trigger = screen.getByRole("button", { name: /필터 창 열기/ });
      expect(trigger).toBeInTheDocument();
    });
  });

  it("PR 4e-3: ArticlePageSizeSelect 가 데스크톱·모바일 양쪽에 렌더된다 (빈 결과 시에도 노출)", async () => {
    renderPage();
    await waitFor(() => {
      // 데스크톱 1개 + 모바일 1개 = 2개 인스턴스 (articles.length=0 인 빈 결과 상태에서도 노출)
      const selects = screen.getAllByLabelText("한 페이지당 매물 개수");
      expect(selects.length).toBe(2);
    });
  });

  it("PR 4e-3: 셀렉트 초기값 = localStorage default 10", async () => {
    renderPage();
    await waitFor(() => {
      // 화면에 "10개" 텍스트가 SelectValue 슬롯에 표시 — 데스크톱·모바일 둘 다
      const tens = screen.getAllByText("10개");
      expect(tens.length).toBeGreaterThanOrEqual(2);
    });
  });
});

describe("매물 페이지네이션 스크롤 복귀 (세션 295)", () => {
  it("'다음' 페이지 클릭 시 매물 섹션으로 scrollIntoView(auto) 호출", async () => {
    const api = await import("@/lib/api");
    vi.mocked(api.getArticles).mockResolvedValue({ articles: [], total: 25 } as never);
    const scrollSpy = vi.fn();
    // test-setup.ts 폴리필이 HTMLElement.prototype 에 박혀 있어 같은 레벨에서 스파이
    const orig = window.HTMLElement.prototype.scrollIntoView;
    window.HTMLElement.prototype.scrollIntoView = scrollSpy;
    try {
      renderPage();
      const nextBtn = await screen.findByRole("button", { name: "다음" });
      scrollSpy.mockClear();
      fireEvent.click(nextBtn);
      // smooth 는 클릭 직후 리렌더에 취소될 수 있어 auto 고정 (메모리 박제 답습)
      expect(scrollSpy).toHaveBeenCalledWith({ behavior: "auto", block: "start" });
    } finally {
      window.HTMLElement.prototype.scrollIntoView = orig;
      vi.mocked(api.getArticles).mockResolvedValue({ articles: [], total: 0 } as never);
    }
  });
});

describe("크롤 안내는 '매물 N건' 줄 안에 한 줄로 (세션 447)", () => {
  it("진행 중 글이 '매물 N건'·'데이터 갱신' 과 같은 줄에 뜨고, 표 위 큰 상자는 없다", async () => {
    crawlState.current = {
      crawling: true, message: "", messageType: "info",
      progress: { complex_no: "12345", status: "running", phase: "articles", article_count: 12 },
    };
    try {
      renderPage();
      const status = await screen.findByText("네이버에서 지금 매물 받는 중 · 12건");
      // 같은 줄 = "매물 0건" 과 "갱신 중..." 버튼을 함께 담은 줄 안
      const row = screen.getByText("매물 0건").closest("div.justify-between");
      expect(row).not.toBeNull();
      expect(row).toContainElement(status);
      expect(row).toContainElement(screen.getByRole("button", { name: "갱신 중..." }));
      // 옛 큰 상자(단계 표시)는 없다
      expect(screen.queryByText("매물 목록 받기")).not.toBeInTheDocument();
    } finally {
      crawlState.current = { crawling: false, message: "", messageType: "", progress: null };
    }
  });

  it("좁은 폭(640px 미만)에선 '매물 N건' 묶음이 한 줄을 다 쓰고 버튼은 다음 줄로 — 640px 이상은 한 줄 (세션 448)", async () => {
    renderPage();
    const group = (await screen.findByText("매물 0건")).parentElement;
    // basis-full = 좁으면 버튼 묶음이 줄바꿈 / sm:basis-0 + grow = 640px 이상은 옛 flex-1 과 같은 한 줄
    expect(group).toHaveClass("basis-full", "sm:basis-0", "grow", "min-w-0");
  });

  it("완료 안내도 같은 줄에 뜬다", async () => {
    crawlState.current = { crawling: false, message: "갱신 완료", messageType: "success", progress: null };
    try {
      renderPage();
      const done = await screen.findByText("갱신 완료");
      const row = screen.getByText("매물 0건").closest("div.justify-between");
      expect(row).toContainElement(done);
    } finally {
      crawlState.current = { crawling: false, message: "", messageType: "", progress: null };
    }
  });
});

describe("저장본 나이로 나누기 — 화면 (세션 447)", () => {
  const idle = { crawling: false, message: "", messageType: "", progress: null };

  it("새 자료 크롤 뒤 바뀐 게 있으면 '데이터 갱신' 자리가 '새 매물 반영 (N건 바뀜)' — 누르면 반영 (2-4)", async () => {
    const apply = vi.fn();
    crawlState.applyPendingRefresh = apply;
    crawlState.current = { ...idle, pendingRefresh: { count: 3 } };
    try {
      renderPage();
      const btn = await screen.findByRole("button", { name: "새 매물 반영 (3건 바뀜)" });
      expect(screen.queryByRole("button", { name: "데이터 갱신" })).not.toBeInTheDocument();
      fireEvent.click(btn);
      expect(apply).toHaveBeenCalledTimes(1);
    } finally {
      crawlState.current = idle;
      crawlState.applyPendingRefresh = () => {};
    }
  });

  it("낡은 자료를 받는 동안 표가 흐려지고 한 줄에 나이 + 진행 (2-5)", async () => {
    crawlState.current = {
      crawling: true, message: "", messageType: "info", staleLabel: "5일 전 자료예요",
      progress: { complex_no: "12345", status: "running", phase: "articles", article_count: 12 },
    };
    try {
      const { container } = renderPage();
      expect(await screen.findByText("5일 전 자료예요 · 네이버에서 지금 매물 받는 중 · 12건")).toBeInTheDocument();
      await waitFor(() => {
        expect(container.querySelector(".transition-opacity.duration-200")).toHaveClass("opacity-50");
      });
    } finally {
      crawlState.current = idle;
    }
  });

  it("새 자료를 받는 동안엔 표를 흐리게 하지 않는다", async () => {
    crawlState.current = {
      crawling: true, message: "", messageType: "info", staleLabel: null,
      progress: { complex_no: "12345", status: "running", phase: "articles", article_count: 12 },
    };
    try {
      const { container } = renderPage();
      expect(await screen.findByText("네이버에서 지금 매물 받는 중 · 12건")).toBeInTheDocument();
      await waitFor(() => {
        expect(container.querySelector(".transition-opacity.duration-200")).toHaveClass("opacity-100");
      });
    } finally {
      crawlState.current = idle;
    }
  });
});
