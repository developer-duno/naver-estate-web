/**
 * 단지 화면 공개 전환 (세션 481) + 소비자 화면 분기 (세션 482 PR 1b) — 자동 새로 받기는 승인 중개사만.
 *
 * - 비로그인: 소비자 화면(질문 4개) + 맨 아래 잠금 카드 1장 · 매물·평형·호가·추이 API 를 아예 안 부른다(보완 F4)
 *   · 필터 바·데이터 갱신·엑셀 없음 · 자동 새로 받기 옵션 auto=false(네이버 호출 0)
 * - 미승인 로그인(일반 회원): 소비자 화면 + 맨 아래 기존 매물 섹션 · 데이터 갱신·엑셀 없음 · auto=false
 * - 승인 중개사: 기존 작업 화면(대시보드) · 데이터 갱신·엑셀 있음 · auto=true · autoEnabled=true
 * 승인 판정 = /api/users/me 의 is_approved_broker(BE get_approved_user 와 같은 판정 — 보완 F5).
 * mock 묶음은 page-pyeong-ready.test.tsx 와 같다(useCrawlAction 만 받은 옵션을 기록).
 * 실행: npx vitest run src/app/complex/[no]/__tests__/page-public-s481.test.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";

const state = vi.hoisted(() => ({
  token: undefined as string | undefined,
  me: null as null | { is_approved_broker?: boolean },
  anon: true,
  tokenError: false,
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
      cortar_no: "3020012300",
      sido: "대전",
      rep_area_m2: 59,
      nearby_median_price: 17200,
      area_prices: [
        { area_m2: 59, households: 116, price_median: 17200, trade_count: 3, price_min: 15700, price_max: 18000, trades: [] },
      ],
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

// 소비자 화면 공개 자료 래퍼 — 비어 있는 응답(카드는 숨김). 네이버 재료가 아니다
vi.mock("@/lib/api/complex", () => ({
  getOfficialPrices: vi.fn().mockResolvedValue({ complex_no: "6139", year: null, items: [] }),
  getComplexKapt: vi.fn().mockResolvedValue(null),
  getComplexSubway: vi.fn().mockResolvedValue({ stations: [] }),
  getComplexNeighborhood: vi.fn().mockResolvedValue(null),
  getPublicPriceHistory: vi.fn().mockResolvedValue({ area_m2: 59, months: [], two_year: null, basis: null }),
  getRegionTrend: vi.fn().mockResolvedValue({ region_code: null, region_name: null, source: "", items: [] }),
}));

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
    sessionToken: state.token, tokenReady: true, tokenError: state.tokenError, dismissTokenError: vi.fn(),
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
  state.tokenError = false;
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

const QUESTIONS = ["1 · 얼마짜리 집인가", "2 · 어떻게 변해 왔나", "3 · 주변은 어떤가", "4 · 내 돈으로 가능한가"];

function expectNoBrokerButtons() {
  expect(screen.queryByRole("button", { name: "데이터 갱신" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "엑셀 내보내기" })).not.toBeInTheDocument();
}

describe("단지 화면 공개 전환 (세션 481) · 소비자 화면 분기 (세션 482)", () => {
  it("비로그인: 소비자 화면 + 잠금 카드 1장 · 필터·갱신·엑셀 없음 · 네이버 재료 요청 0 · 자동 새로 받기 꺼짐", async () => {
    state.token = undefined;
    state.me = null;
    state.anon = true;
    const consoleError = vi.spyOn(console, "error");

    render(<ComplexDetailPage />, { wrapper: TestQueryProvider });

    // 보완 F3: "가격 추이" 는 일반 회원에게도 안 열리므로 약속하지 않는다
    expect(await screen.findByText("지금 나온 매물과 호가는 로그인하면 볼 수 있어요")).toBeInTheDocument();
    expect(screen.queryByText(/가격 추이/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/로그인하면 볼 수 있어요/)).toHaveLength(1); // 잠금 카드 1장
    expect(screen.getByText("1 · 얼마짜리 집인가")).toBeInTheDocument();
    expect(screen.getByText(/^4 · 내 돈으로 가능한가/)).toBeInTheDocument();
    expect(screen.getByTestId("consumer-summary")).toHaveTextContent("최대 약 1억 990만");
    expect(screen.queryByLabelText("단지 종합 대시보드")).not.toBeInTheDocument();
    expect(screen.queryByText(/필터 접기|필터 펼치기/)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "매물" })).not.toBeInTheDocument();
    expectNoBrokerButtons();
    expect(screen.queryByText(/1억 7,200만/)).not.toBeInTheDocument(); // 이 단지 중위값 글자 0
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

  it("일반 회원(미승인 로그인): 소비자 화면 + 맨 아래 매물 섹션 · 갱신·엑셀 없음 · 자동 새로 받기 꺼짐", async () => {
    state.token = "tok-pending";
    state.me = { is_approved_broker: false };
    state.anon = false;
    const pyeongBefore = vi.mocked((await import("@/lib/api")).getPyeongDetails).mock.calls.length;

    render(<ComplexDetailPage />, { wrapper: TestQueryProvider });

    expect(await screen.findByText("1 · 얼마짜리 집인가")).toBeInTheDocument();
    // S2·S3 은 이 시험 자료가 비어 숨김 — 보이는 질문은 1·4
    for (const q of [QUESTIONS[0], QUESTIONS[3]]) expect(screen.getByText(new RegExp(`^${q}`))).toBeInTheDocument();
    for (const q of [QUESTIONS[1], QUESTIONS[2]]) expect(screen.queryByText(q)).not.toBeInTheDocument();
    expect(await screen.findByText("매물 0건")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "매물" })).toBeInTheDocument();
    expect(screen.queryByText(/로그인하면 볼 수 있어요/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("단지 종합 대시보드")).not.toBeInTheDocument();
    expectNoBrokerButtons();
    await waitFor(() => expect(state.crawlOpts.length).toBeGreaterThan(1));
    expect(state.crawlOpts.every((o) => o.auto === false && o.autoEnabled === false)).toBe(true);
    // 보완 F3: 평형 정보는 중개사 대시보드만 쓴다 — 일반 회원에겐 부르지 않는다
    const api = await import("@/lib/api");
    expect(vi.mocked(api.getPyeongDetails).mock.calls.length).toBe(pyeongBefore);
  });

  it("승인 중개사: 기존 작업 화면 · 갱신·엑셀 있음 · 첫 조회가 끝나면 자동 새로 받기 켜짐", async () => {
    state.token = "tok-approved";
    state.me = { is_approved_broker: true };
    state.anon = false;

    render(<ComplexDetailPage />, { wrapper: TestQueryProvider });

    expect(await screen.findByLabelText("단지 종합 대시보드")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "데이터 갱신" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "엑셀 내보내기" })).toBeInTheDocument();
    expect(screen.queryByText("1 · 얼마짜리 집인가")).not.toBeInTheDocument();
    await waitFor(() => expect(last()).toEqual({ auto: true, autoEnabled: true }));
  });

  it("승인 판정 중엔 로딩 — 단지 정보는 이미 받았어도 중개사에게 소비자 화면이 비치지 않는다(보완 A-2)", async () => {
    state.token = "tok-slow";
    state.me = { is_approved_broker: true };
    state.anon = false;
    const api = await import("@/lib/api");
    let release: (v: unknown) => void = () => {};
    vi.mocked(api.fetchApi).mockImplementationOnce(() => new Promise((r) => { release = r; }));

    const getComplex = vi.mocked(api.getComplex);
    const before = getComplex.mock.calls.length; // 앞 시험의 호출은 빼고 이번 렌더의 호출만 본다

    render(<ComplexDetailPage />, { wrapper: TestQueryProvider });

    // 단지 정보 응답이 끝나 React 가 그 결과로 다시 그린 뒤에도(= 남은 대기 조건은 승인 판정뿐) 로딩이어야 한다
    await waitFor(() => expect(getComplex.mock.calls.length).toBeGreaterThan(before));
    await act(async () => {
      await getComplex.mock.results[before].value;
    });
    await act(async () => {}); // 쿼리 결과 반영 렌더 한 번 더 흘려 보낸다
    expect(vi.mocked(api.fetchApi)).toHaveBeenCalled();
    expect(screen.getByText("단지 정보를 불러오는 중...")).toBeInTheDocument();
    expect(screen.queryByText("1 · 얼마짜리 집인가")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("단지 종합 대시보드")).not.toBeInTheDocument();
    await act(async () => release({ is_approved_broker: true }));
    expect(await screen.findByLabelText("단지 종합 대시보드")).toBeInTheDocument();
  });

  it("세션 확인 실패 경고는 소비자 화면에도 맨 위에 보인다(보완 A-3)", async () => {
    state.token = undefined;
    state.me = null;
    state.anon = true;
    state.tokenError = true;

    render(<ComplexDetailPage />, { wrapper: TestQueryProvider });

    const warn = await screen.findByText(/로그인 세션을 확인할 수 없어/);
    const first = screen.getByText("1 · 얼마짜리 집인가");
    expect(warn.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy(); // 경고가 카드보다 앞
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
