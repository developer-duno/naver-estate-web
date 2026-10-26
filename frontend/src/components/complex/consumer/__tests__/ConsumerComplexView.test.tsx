/**
 * 소비자 화면 묶음(세션 482 PR 1b) — 질문 4개 순서 · 공개 자료만 부름 · 면적을 바꾸면 S1·S4·요약·B1 이 같이 바뀐다.
 * 실행: npx vitest run src/components/complex/consumer/__tests__/ConsumerComplexView.test.tsx
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
      <ConsumerComplexView complex={complex} endYm={END_YM} footer={<div data-testid="footer-slot">맨 아래</div>} {...header} />
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

  it("면적을 바꾸면 S1·요약·B1 이 같이 바뀐다", async () => {
    renderView();
    await screen.findByText("2년 최고 2억");
    fireEvent.click(screen.getAllByRole("button", { name: /^84㎡/ })[0]);
    expect(screen.getByTestId("consumer-range").textContent).toBe("2억 2,000만 ~ 2억 3,000만");
    expect(screen.getByTestId("consumer-summary").textContent).toContain("84㎡ 기준");
    await waitFor(() => expect(api.getPublicPriceHistory).toHaveBeenCalledWith("6139", 84));
    expect(screen.getByRole("button", { name: "보수적 2억 2,000만" })).toBeInTheDocument();
  });

  it("면적 자료가 하나도 없으면 B1 을 부르지 않고 S4·요약도 없다", async () => {
    const c = makeComplex({ area_prices: [], rep_area_m2: null });
    renderView(c);
    await screen.findByText("이 단지의 정부 실거래 기록이 아직 없어요");
    expect(api.getPublicPriceHistory).not.toHaveBeenCalled();
    expect(screen.queryByTestId("consumer-loan")).toBeNull();
    expect(screen.queryByTestId("consumer-summary")).toBeNull();
  });

  it("기본 면적 — 대표 면적에 범위가 없으면 범위 있는 첫 면적", () => {
    expect(defaultArea(makeComplex())).toBe(59);
    expect(defaultArea(makeComplex({ rep_area_m2: 42 }))).toBe(59);
    expect(defaultArea(makeComplex({ area_prices: [] }))).toBeNull();
  });
});
