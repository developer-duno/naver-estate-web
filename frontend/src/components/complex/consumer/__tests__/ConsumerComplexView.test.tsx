/**
 * 소비자 화면 묶음(세션 482 PR 1b) — 질문 4개 순서 · 공개 자료만 부름 · 면적을 바꾸면 S1·S4·요약·B1 이 같이 바뀐다.
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
  it("질문 4개 순서 · 요약 · 맨 아래 칸 · 출처 줄", async () => {
    renderView();
    await screen.findByTestId("consumer-region-sentence");
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual([
      "1 · 얼마짜리 집인가", "2 · 어떻게 변해 왔나", "3 · 주변은 어떤가", "4 · 내 돈으로 가능한가 (참고 계산)",
    ]);
    expect(screen.getByTestId("consumer-summary").textContent).toContain("최대 약 1억 990만");
    expect(screen.getByTestId("footer-slot")).toBeInTheDocument();
    expect(screen.getByText(CONSUMER_SOURCE_LINE)).toBeInTheDocument();
    expect(api.getPublicPriceHistory).toHaveBeenCalledWith("6139", 59);
  });

  it("넓은 화면 2열(3:2) — 왼쪽 머리·1·2·3, 오른쪽 4 + 잠금 카드 자리 · 매물 자리는 격자 밖 전체 폭", async () => {
    renderView();
    await screen.findByTestId("consumer-region-sentence");
    const grid = screen.getByTestId("consumer-grid");
    expect(grid.className).toContain("grid-cols-1");
    expect(grid.className).toContain("lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]");
    const [left, right] = Array.from(grid.children) as HTMLElement[];
    expect(grid.children).toHaveLength(2);
    expect(within(left).getByText("1 · 얼마짜리 집인가")).toBeInTheDocument();
    expect(within(left).getByText("3 · 주변은 어떤가")).toBeInTheDocument();
    expect(within(left).getByTestId("consumer-summary")).toBeInTheDocument();
    expect(within(right).getByTestId("consumer-loan")).toBeInTheDocument();
    expect(within(right).getByTestId("aside-slot")).toBeInTheDocument();
    expect(grid.contains(screen.getByTestId("footer-slot"))).toBe(false);
  });

  it("면적을 바꾸면 S1·요약·B1 이 같이 바뀐다", async () => {
    renderView();
    await screen.findByText("2년 최고 2억");
    fireEvent.click(screen.getAllByRole("button", { name: /^84㎡/ })[0]);
    expect(screen.getByTestId("consumer-range").textContent).toBe("2억 2,000만 ~ 2억 3,000만");
    expect(screen.getByTestId("consumer-summary").textContent).toContain("84㎡ 기준");
    await waitFor(() => expect(api.getPublicPriceHistory).toHaveBeenCalledWith("6139", 84));
    expect(screen.getByRole("button", { name: "보수적 2억 2,000만" })).toBeInTheDocument();
  });

  it("면적 자료가 하나도 없으면 B1 을 부르지 않지만 S4 는 직접 입력 단계로 보인다 · 요약은 한도 숫자 없이(15111 같은 단지)", async () => {
    const c = makeComplex({ area_prices: [], rep_area_m2: null });
    renderView(c);
    expect((await screen.findByTestId("consumer-no-range")).textContent).toBe("최근 2년 정부 실거래 기록 없음");
    expect(api.getPublicPriceHistory).not.toHaveBeenCalled();
    expect(screen.getByTestId("consumer-loan-manual")).toBeInTheDocument();
    expect(screen.getByTestId("consumer-summary").textContent).not.toContain("최대 약");
  });

  it("6개월 범위가 없으면 대표 면적으로 B1 을 불러 2년 범위로 요약·S4 를 채운다(보완 F2·F5)", async () => {
    const c = makeComplex({ area_prices: makeComplex().area_prices!.map((a) => ({ ...a, price_min: null, price_max: null })) });
    renderView(c);
    expect(await screen.findByRole("button", { name: "보수적 1억 4,700만" })).toBeInTheDocument();
    expect(api.getPublicPriceHistory).toHaveBeenCalledWith("6139", 59);
    expect(screen.getByTestId("consumer-no-range").textContent).toBe("최근 6개월 거래 없음 · 2년 범위 1억 4,700만~2억");
    expect(screen.getByTestId("consumer-summary").textContent).toContain("최근 2년 거래 1억 4,700만~2억 · 담보대출 한도 최대 약 1억 290만");
  });

  it("오피스텔은 B1 을 부르지 않고 대출 카드 대신 한 줄 · 요약 없음(보완 F4)", async () => {
    const c = makeComplex({
      real_estate_type_code: "OPST",
      real_estate_type_name: "오피스텔",
      area_prices: makeComplex().area_prices!.map((a) => ({ ...a, price_min: null, price_max: null })),
    });
    renderView(c);
    expect(await screen.findByTestId("consumer-loan-skip")).toHaveTextContent("오피스텔(비주택) 담보대출은 주택 규칙과 달라 계산하지 않아요");
    expect(screen.queryByTestId("consumer-loan")).toBeNull();
    expect(screen.getByTestId("consumer-no-range").textContent).toBe("오피스텔은 정부 실거래 자료를 아직 받지 않아요");
    expect(screen.queryByTestId("consumer-summary")).toBeNull();
    expect(screen.queryByTestId("consumer-bands")).toBeNull();
    expect(api.getPublicPriceHistory).not.toHaveBeenCalled();
  });

  it("구역을 모르면 요약 줄 끝에 '(규제지역이면 더 낮아요)'(보완 A-5)", async () => {
    renderView(makeComplex({ cortar_no: undefined }));
    await screen.findByTestId("consumer-region-sentence");
    expect(screen.getByTestId("consumer-summary").textContent?.endsWith("(규제지역이면 더 낮아요)")).toBe(true);
  });

  it("서버 오류(5xx)는 카드를 숨기지 않고 '다시 시도' — 누르면 다시 부른다(보완 A-4)", async () => {
    const { ApiError } = await vi.importActual<typeof import("@/lib/api/core")>("@/lib/api/core");
    api.getRegionTrend.mockRejectedValue(new ApiError("서버 오류", 500));
    api.getPublicPriceHistory.mockRejectedValue(new ApiError("서버 오류", 503));
    api.getComplexSubway.mockRejectedValue(new ApiError("서버 오류", 502));
    api.getComplexNeighborhood.mockRejectedValue(new ApiError("서버 오류", 500));
    renderView();
    await waitFor(() => expect(screen.getAllByTestId("consumer-load-retry").length).toBeGreaterThanOrEqual(3));
    expect(screen.getByText("2 · 어떻게 변해 왔나")).toBeInTheDocument(); // 자료가 없어도 카드가 남는다
    expect(screen.getByText("3 · 주변은 어떤가")).toBeInTheDocument();
    const before = api.getRegionTrend.mock.calls.length;
    const s2 = screen.getByText("2 · 어떻게 변해 왔나").closest("[aria-labelledby]") as HTMLElement;
    fireEvent.click(within(s2).getByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect(api.getRegionTrend.mock.calls.length).toBe(before + 1));
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
