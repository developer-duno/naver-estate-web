/**
 * 단지 화면 공개 전환 (세션 481) — 비로그인도 화면을 보고, 네이버 매물은 잠금 카드, 자동 새로 받기는 승인 중개사만.
 *
 * - 비로그인: 매물·평형·호가·추이 API 를 아예 안 부른다(보완 F4) → 잠금 카드 "로그인하면 볼 수 있어요"
 *   · 단지 대시보드(공공 카드)는 보임 · 자동 새로 받기 옵션 auto=false(네이버 호출 0)
 * - 미승인 로그인: 매물은 보이지만 auto=false
 * - 승인 중개사: auto=true · autoEnabled=true
 * 승인 판정 = /api/users/me 의 is_approved_broker(BE get_approved_user 와 같은 판정 — 보완 F5).
 * mock 묶음은 page-pyeong-ready.test.tsx 와 같다(useCrawlAction 만 받은 옵션을 기록).
 * 실행: npx vitest run src/app/complex/[no]/__tests__/page-public-s481.test.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";

const state = vi.hoisted(() => ({
  token: undefined as string | undefined,
  me: null as null | { is_approved_broker?: boolean },
  anon: true,
  crawlOpts: [] as { auto?: boolean; autoEnabled?: boolean }[],
}));

vi.mock("@/lib/api", async () => {
  const { ApiError: E } = await vi.importActual<typeof import("@/lib/api/core")>("@/lib/api/core");
  const gate = <T,>(v: T) => () => (state.anon ? Promise.reject(new E("인증이 필요합니다", 401)) : Promise.resolve(v));
  return {
    getComplex: vi.fn().mockResolvedValue({
      complex_no: "6139",
      complex_name: "공개단지",
      real_estate_type_name: "아파트",
      address: "대전 유성구",
      total_household_count: 500,
      total_dong_count: 7,
      rep_area_m2: 59,
      nearby_median_price: 17200,
      area_prices: [],
      region_jeonse_ratio: 71.2,
      region_name: "대전 유성구",
    }),
    getArticles: vi.fn(gate({ articles: [], total: 0 })),
    getPyeongDetails: vi.fn(gate({ pyeong_details: [] })),
    getPriceStats: vi.fn(gate({ complex_no: "6139", total_articles: 0, by_area: [], by_floor: [] })),
    getPriceHistory: vi.fn(gate({ complex_no: "6139", items: [] })),
    startPriceCollect: vi.fn(),
    getPriceCollectStatus: vi.fn(),
    fetchApi: vi.fn(() => Promise.resolve(state.me)),
  };
});

vi.mock("next/navigation", async () => {
  const actual = await vi.importActual<typeof import("next/navigation")>("next/navigation");
  return {
    ...actual,
    useParams: () => ({ no: "6139" }),
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
    usePathname: () => "/complex/6139",
    useSearchParams: () => new URLSearchParams(),
  };
});

vi.mock("@/hooks/useCrawlAction", () => ({
  useCrawlAction: (_no: string, opts: { auto?: boolean; autoEnabled?: boolean }) => {
    state.crawlOpts.push({ auto: opts.auto, autoEnabled: opts.autoEnabled });
    return {
      crawling: false, message: "", messageType: "", progress: null, staleLabel: null, pendingRefresh: null,
      applyPendingRefresh: vi.fn(), clearMessage: vi.fn(), handleCrawl: vi.fn(),
    };
  },
}));
vi.mock("@/hooks/useExport", () => ({
  useExport: () => ({ exporting: false, exportError: "", clearExportError: vi.fn(), handleExport: vi.fn() }),
}));
vi.mock("@/hooks/useFilterParams", () => ({
  useFilterParams: () => ({
    filters: {}, page: 1, sortBy: "", setFilters: vi.fn(), setPage: vi.fn(), setSortBy: vi.fn(),
  }),
}));
vi.mock("@/hooks/useFavorites", () => ({ useFavoriteStatus: () => ({ starred: false, toggle: vi.fn() }) }));
vi.mock("@/hooks/useSmartBack", () => ({ useSmartBack: () => vi.fn() }));
vi.mock("@/hooks/useSessionToken", () => ({
  useSessionToken: () => ({
    sessionToken: state.token, tokenReady: true, tokenError: false, dismissTokenError: vi.fn(),
  }),
}));
vi.mock("@/hooks/useArticleViewPreferences", () => ({
  useArticleViewPreferences: () => ({
    articleViewMode: "medium", pageSize: 10, setPageSize: vi.fn(), handleViewModeChange: vi.fn(),
  }),
}));
vi.mock("@/hooks/usePopstateRefresh", () => ({ usePopstateRefresh: () => ({ navKey: 0 }) }));

import ComplexDetailPage from "../page";

const last = () => state.crawlOpts[state.crawlOpts.length - 1];

beforeEach(() => {
  state.crawlOpts.length = 0;
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

describe("단지 화면 공개 전환 (세션 481)", () => {
  it("비로그인: 대시보드는 보이고 매물은 잠금 카드 · 이 단지 전세가율 글자 없음 · 자동 새로 받기 꺼짐", async () => {
    state.token = undefined;
    state.me = null;
    state.anon = true;
    const consoleError = vi.spyOn(console, "error");

    render(<ComplexDetailPage />, { wrapper: TestQueryProvider });

    expect(await screen.findByText("매물 목록은(는) 로그인하면 볼 수 있어요")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /단지정보 메뉴 열기/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^시세 · 전용 59㎡/ })).toHaveTextContent("1억 7,200만");
    expect(screen.getByTestId("box-extra-prices")).toHaveTextContent("대전 유성구 아파트 전세가율 71.2%");
    expect(screen.queryByText(/전세가율\(59㎡\)/)).not.toBeInTheDocument();
    expect(state.crawlOpts.every((o) => o.auto === false && o.autoEnabled === false)).toBe(true);
    expect(consoleError).not.toHaveBeenCalled();
    // 보완 F4: 비로그인이면 네이버 재료 API 요청 0(401 도 안 낸다)
    const api = await import("@/lib/api");
    expect(vi.mocked(api.getArticles)).not.toHaveBeenCalled();
    expect(vi.mocked(api.getPyeongDetails)).not.toHaveBeenCalled();
    expect(vi.mocked(api.getPriceStats)).not.toHaveBeenCalled();
    expect(vi.mocked(api.getPriceHistory)).not.toHaveBeenCalled();
    expect(vi.mocked(api.fetchApi)).not.toHaveBeenCalled();
  });

  it("미승인 로그인: 매물은 받아도 자동 새로 받기는 꺼짐", async () => {
    state.token = "tok-pending";
    state.me = { is_approved_broker: false };
    state.anon = false;

    render(<ComplexDetailPage />, { wrapper: TestQueryProvider });

    await screen.findByText("공개단지");
    await waitFor(() => expect(state.crawlOpts.length).toBeGreaterThan(1));
    expect(screen.queryByText(/로그인하면 볼 수 있어요/)).not.toBeInTheDocument();
    expect(state.crawlOpts.every((o) => o.auto === false && o.autoEnabled === false)).toBe(true);
  });

  it("승인 중개사: 첫 조회가 끝나면 자동 새로 받기 켜짐", async () => {
    state.token = "tok-approved";
    state.me = { is_approved_broker: true };
    state.anon = false;

    render(<ComplexDetailPage />, { wrapper: TestQueryProvider });

    await waitFor(() => expect(last()).toEqual({ auto: true, autoEnabled: true }));
  });

  it("단지 정보가 403(정지 계정)이면 오류 화면이 아니라 '이 계정으로는 볼 수 없어요' 잠금 안내", async () => {
    state.token = "tok-suspended";
    state.me = { is_approved_broker: false };
    state.anon = false;
    const api = await import("@/lib/api");
    const { ApiError: E } = await import("@/lib/api/core");
    vi.mocked(api.getComplex).mockRejectedValueOnce(new E("정지된 계정입니다", 403)).mockRejectedValueOnce(new E("정지된 계정입니다", 403));

    render(<ComplexDetailPage />, { wrapper: TestQueryProvider });

    expect(await screen.findByText("이 계정으로는 볼 수 없어요", undefined, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.queryByText("오류가 발생했습니다")).not.toBeInTheDocument();
  });
});
