/**
 * 소비자 화면 묶음(세션 482 PR 1b) — 카드 순서 · 공개 자료만 부름 · 면적을 바꾸면 S1·S4(대출 판 큰 줄)·B1 이 같이 바뀐다.
 * 세션 524 B40 PR 1: 머리 한 줄 요약은 없어지고 그 뜻(한도·면적·2년 단계·구역 모름)은 대출 판 큰 줄·기준 줄로 옮겼다.
 * 실행: npx vitest run src/components/complex/consumer/__tests__/ConsumerComplexView.test.tsx
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";
import ConsumerComplexView, { CONSUMER_SOURCE_LINE, defaultArea } from "../ConsumerComplexView";
import { END_YM, HOOD, KAPT, OFFICIAL, SUBWAY, makeComplex, makeHistory, makeTrend } from "./fixtures";

vi.mock("next/navigation", () => ({ usePathname: () => "/complex/6139" }));

const api = vi.hoisted(() => ({
  getOfficialPrices: vi.fn(),
  getComplexKapt: vi.fn(),
  getComplexSubway: vi.fn(),
  getComplexNeighborhood: vi.fn(),
  getPublicPriceHistory: vi.fn(),
  getRegionTrend: vi.fn(),
}));
vi.mock("@/lib/api/complex", () => api);

/** 서버 공개 요약 중 화면 재료(세션 483 PR 3b) — 6139 */
const SEED = {
  complex_no: "6139",
  basis_ym: "2026-08", // 오늘 달과 다른 값 — 서버 기준월을 쓰는지 가르려고
  breadcrumb: null,
  official_price: { year: OFFICIAL.year, items: OFFICIAL.items },
  subway: SUBWAY.stations,
};

const header = {
  starred: false, onBack: () => {}, onToggleFavorite: () => {}, isCompared: false, compareFull: false, onToggleCompare: () => {},
};

beforeEach(() => {
  vi.clearAllMocks();
  api.getOfficialPrices.mockResolvedValue(OFFICIAL);
  api.getComplexKapt.mockResolvedValue(KAPT);
  api.getComplexSubway.mockResolvedValue(SUBWAY);
  api.getComplexNeighborhood.mockResolvedValue(HOOD);
  api.getPublicPriceHistory.mockImplementation((_no: string, area: number) => Promise.resolve(makeHistory(area)));
  api.getRegionTrend.mockResolvedValue(makeTrend());
});

function renderView(complex = makeComplex()) {
  return render(
    <TestQueryProvider>
      <ConsumerComplexView
        complex={complex}
        endYm={END_YM}
        aside={<div data-testid="aside-slot">잠금 카드 자리</div>}
        footer={<div data-testid="footer-slot">맨 아래</div>}
        {...header}
      />
    </TestQueryProvider>,
  );
}

describe("ConsumerComplexView", () => {
  it("카드 순서(휴대폰 한 열 = DOM) 최근 거래 → 2년 → 대출 판 → 주변 · 대출 판 큰 줄 · 맨 아래 칸 · 출처 줄", async () => {
    renderView();
    await screen.findByTestId("consumer-region-sentence");
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(["최근 거래", "2년 동안 어떻게 변했나", "이 집을 담보로", "주변은 어떤가"]);
    expect(screen.queryByTestId("consumer-summary")).toBeNull();
    expect(screen.getByTestId("consumer-loan-headline").textContent).toBe("추가로 가능한 담보대출 약 1억 990만");
    expect(screen.getByTestId("footer-slot")).toBeInTheDocument();
    expect(screen.getByText(CONSUMER_SOURCE_LINE)).toBeInTheDocument();
    expect(api.getPublicPriceHistory).toHaveBeenCalledWith("6139", 59);
  });

  it("넓은 화면 2열(3:2) — 대출 판만 오른쪽 열 1행부터 · 나머지(머리·최근 거래·2년·주변·잠금 카드)는 왼쪽 · 매물 자리는 격자 밖 전체 폭", async () => {
    renderView();
    await screen.findByTestId("consumer-region-sentence");
    const grid = screen.getByTestId("consumer-grid");
    expect(grid.className).toContain("grid-cols-1");
    expect(grid.className).toContain("lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]");
    // 왼쪽 카드 행은 auto · 마지막 1fr 행이 대출 판 남는 높이를 받는다(계산기를 펼쳐도 왼쪽 간격 그대로)
    expect(grid.className).toContain("lg:grid-rows-[repeat(5,auto)_1fr]");
    const kids = Array.from(grid.children) as HTMLElement[];
    const loanCol = screen.getByTestId("consumer-loan-col");
    expect(loanCol.className).toContain("lg:col-start-2 lg:row-start-1 lg:row-span-6");
    expect(loanCol).toContainElement(screen.getByTestId("consumer-loan"));
    // DOM 순서 = 휴대폰 순서 — 대출 판은 2년 카드 뒤, 주변 카드 앞(order 로 뒤집지 않는다)
    const idx = (el: Element) => kids.findIndex((k) => k === el || k.contains(el));
    expect(idx(screen.getByText("2년 동안 어떻게 변했나"))).toBe(idx(loanCol) - 1);
    expect(idx(screen.getByText("주변은 어떤가"))).toBe(idx(loanCol) + 1);
    expect(idx(screen.getByTestId("aside-slot"))).toBe(kids.length - 1);
    for (const k of kids) if (k !== loanCol) expect(k.className).not.toContain("col-start-2");
    expect(loanCol).not.toContainElement(screen.getByTestId("aside-slot"));
    expect(grid.contains(screen.getByTestId("footer-slot"))).toBe(false);
  });

  it("면적을 바꾸면 S1·요약·B1 이 같이 바뀐다", async () => {
    renderView();
    await screen.findByText("2년 최고 2억");
    fireEvent.click(screen.getAllByRole("button", { name: /^84㎡/ })[0]);
    // 범위 숫자는 서버 '한눈에 보기'로 옮겼다(세션 483 PR 3b) — 카드 1 은 그 면적의 막대
    expect(await screen.findByText("노란 띠 = 84㎡ 최근 6개월 거래 범위")).toBeInTheDocument();
    expect(screen.getByTestId("consumer-loan-target").textContent).toBe("전용 84㎡ · 집값 2억 2,000만 기준");
    await waitFor(() => expect(api.getPublicPriceHistory).toHaveBeenCalledWith("6139", 84));
    fireEvent.click(screen.getByRole("button", { name: "내 조건으로 계산하기" }));
    expect(screen.getByRole("button", { name: "보수적 2억 2,000만" })).toBeInTheDocument();
  });

  it("면적 자료가 하나도 없으면 B1 을 부르지 않지만 S4 는 직접 입력 단계로 보인다 · 큰 줄은 한도 숫자 없이(15111 같은 단지)", async () => {
    const c = makeComplex({ area_prices: [], rep_area_m2: null });
    renderView(c);
    expect((await screen.findByTestId("consumer-no-range")).textContent).toBe("최근 2년 정부 실거래 기록 없음");
    expect(api.getPublicPriceHistory).not.toHaveBeenCalled();
    expect(screen.getByTestId("consumer-loan-manual")).toBeInTheDocument();
    expect(screen.getByTestId("consumer-loan-headline").textContent).toBe("집값을 넣으면 한도를 계산해요");
  });

  it("6개월 범위가 없으면 대표 면적으로 B1 을 불러 2년 범위로 대출 판·S4 를 채운다(보완 F2·F5)", async () => {
    const c = makeComplex({ area_prices: makeComplex().area_prices!.map((a) => ({ ...a, price_min: null, price_max: null })) });
    renderView(c);
    await waitFor(() => expect(screen.getByTestId("consumer-loan-headline").textContent).toBe("추가로 가능한 담보대출 약 1억 290만"));
    expect(api.getPublicPriceHistory).toHaveBeenCalledWith("6139", 59);
    expect(screen.getByTestId("consumer-no-range").textContent).toBe("최근 6개월 거래 없음 · 2년 범위 1억 4,700만~2억");
    expect(screen.getByTestId("consumer-loan-target").textContent).toBe("전용 59㎡ · 집값 1억 4,700만 기준");
    fireEvent.click(screen.getByRole("button", { name: "내 조건으로 계산하기" }));
    expect(screen.getByRole("button", { name: "보수적 1억 4,700만" })).toBeInTheDocument();
  });

  it("오피스텔은 B1 을 부르지 않고 대출 카드 대신 한 줄 · 큰 줄 없음(보완 F4)", async () => {
    const c = makeComplex({
      real_estate_type_code: "OPST",
      real_estate_type_name: "오피스텔",
      area_prices: makeComplex().area_prices!.map((a) => ({ ...a, price_min: null, price_max: null })),
    });
    renderView(c);
    expect(await screen.findByTestId("consumer-loan-skip")).toHaveTextContent("오피스텔(비주택) 담보대출은 주택 규칙과 달라 계산하지 않아요");
    expect(screen.queryByTestId("consumer-loan")).toBeNull();
    expect(screen.getByTestId("consumer-no-range").textContent).toBe("오피스텔은 정부 실거래 자료를 아직 받지 않아요");
    expect(screen.queryByTestId("consumer-loan-headline")).toBeNull();
    expect(screen.queryByTestId("consumer-bands")).toBeNull();
    expect(api.getPublicPriceHistory).not.toHaveBeenCalled();
  });

  it("구역을 모르면 대출 판 기준 줄 끝에 '규제지역이면 더 낮아요'(보완 A-5 · 옛 요약 줄 꼬리표)", async () => {
    renderView(makeComplex({ cortar_no: undefined }));
    await screen.findByTestId("consumer-region-sentence");
    expect(screen.getByTestId("consumer-loan-target").textContent?.endsWith(" · 규제지역이면 더 낮아요")).toBe(true);
  });

  it("서버 오류(5xx)는 카드를 숨기지 않고 '다시 시도' — 누르면 다시 부른다(보완 A-4)", async () => {
    const { ApiError } = await vi.importActual<typeof import("@/lib/api/core")>("@/lib/api/core");
    api.getRegionTrend.mockRejectedValue(new ApiError("서버 오류", 500));
    api.getPublicPriceHistory.mockRejectedValue(new ApiError("서버 오류", 503));
    api.getComplexSubway.mockRejectedValue(new ApiError("서버 오류", 502));
    api.getComplexNeighborhood.mockRejectedValue(new ApiError("서버 오류", 500));
    renderView();
    await waitFor(() => expect(screen.getAllByTestId("consumer-load-retry").length).toBeGreaterThanOrEqual(3));
    expect(screen.getByText("2년 동안 어떻게 변했나")).toBeInTheDocument(); // 자료가 없어도 카드가 남는다
    expect(screen.getByText("주변은 어떤가")).toBeInTheDocument();
    const before = api.getRegionTrend.mock.calls.length;
    const s2 = screen.getByText("2년 동안 어떻게 변했나").closest("[aria-labelledby]") as HTMLElement;
    fireEvent.click(within(s2).getByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect(api.getRegionTrend.mock.calls.length).toBe(before + 1));
  });

  it("서버 요약(seed)이 있으면 공시가격·지하철은 initialData — 브라우저가 다시 부르지 않는다 · 관리비는 부르지 않는다(세션 483 PR 3b)", async () => {
    render(
      <TestQueryProvider>
        <ConsumerComplexView complex={makeComplex()} seed={SEED} {...header} />
      </TestQueryProvider>,
    );
    await screen.findByTestId("consumer-region-sentence");
    expect(screen.getByText("갑천역")).toBeInTheDocument(); // 지하철 = seed 값
    expect(api.getOfficialPrices).not.toHaveBeenCalled();
    expect(api.getComplexSubway).not.toHaveBeenCalled();
    expect(api.getComplexKapt).not.toHaveBeenCalled();
    // 띠 그래프 마지막 달 = 서버 기준월(basis_ym "2026-08" → 26.08) — currentYm() 이 아니다
    expect(screen.getByTestId("consumer-bands").textContent).toContain("26.08");
    expect(screen.getByTestId("consumer-bands").textContent).not.toContain("26.10");
  });

  it("다른 단지 번호의 seed 는 쓰지 않는다 — 공시가격·지하철을 브라우저가 부른다", async () => {
    render(
      <TestQueryProvider>
        <ConsumerComplexView complex={makeComplex()} seed={{ ...SEED, complex_no: "9999" }} endYm={END_YM} {...header} />
      </TestQueryProvider>,
    );
    await waitFor(() => expect(api.getComplexSubway).toHaveBeenCalledWith("6139"));
    expect(api.getOfficialPrices).toHaveBeenCalledWith("6139");
  });

  it("기본 면적 — 대표 면적에 범위가 없으면 범위 있는 첫 면적 · 범위가 하나도 없으면 대표 면적 → 첫 면적", () => {
    expect(defaultArea(makeComplex())).toBe(59);
    expect(defaultArea(makeComplex({ rep_area_m2: 42 }))).toBe(59);
    expect(defaultArea(makeComplex({ area_prices: [] }))).toBe(59);
    expect(defaultArea(makeComplex({ area_prices: [], rep_area_m2: null }))).toBeNull();
    const none = makeComplex().area_prices!.map((a) => ({ ...a, price_min: null, price_max: null }));
    expect(defaultArea(makeComplex({ area_prices: none, rep_area_m2: null }))).toBe(59);
  });
});
