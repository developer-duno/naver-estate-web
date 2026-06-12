/**
 * ComplexPriceAreaSection 회귀 가드 — useQuery wrapper 정상 동작 검증
 * 실행: npx vitest run src/components/complex/__tests__/ComplexPriceAreaSection.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TestQueryProvider } from "@/test-setup";
import ComplexPriceAreaSection from "../ComplexPriceAreaSection";

const mockGetPriceStats = vi.fn();

vi.mock("@/lib/api", () => ({
  getPriceStats: (...args: unknown[]) => mockGetPriceStats(...args),
}));

function renderWithQuery(ui: React.ReactElement) {
  return render(ui, { wrapper: TestQueryProvider });
}

describe("ComplexPriceAreaSection", () => {
  it("by_area 비어있을 때 안내 메시지", async () => {
    mockGetPriceStats.mockResolvedValueOnce({
      complex_no: "C001", total_articles: 0, by_area: [], by_floor: [],
    });
    renderWithQuery(<ComplexPriceAreaSection complexNo="C001" />);
    await waitFor(() => {
      expect(screen.getByText(/면적별 가격 데이터가 부족합니다/)).toBeInTheDocument();
    });
  });

  it("API 에러 시 에러 메시지", async () => {
    mockGetPriceStats.mockRejectedValueOnce(new Error("API down"));
    renderWithQuery(<ComplexPriceAreaSection complexNo="C001" />);
    await waitFor(() => {
      expect(screen.getByText(/가격 통계를 불러오지 못했습니다/)).toBeInTheDocument();
    });
  });

  // 세션 298: 에러 dead-end 해소 — 형제 PriceChartSection retry 패턴 답습
  it("API 에러 시 '다시 시도' 클릭하면 재조회한다", async () => {
    mockGetPriceStats.mockRejectedValueOnce(new Error("API down"));
    renderWithQuery(<ComplexPriceAreaSection complexNo="C001" />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "다시 시도" })).toBeInTheDocument();
    });
    const callsBefore = mockGetPriceStats.mock.calls.length;
    mockGetPriceStats.mockResolvedValueOnce({
      complex_no: "C001", total_articles: 0, by_area: [], by_floor: [],
    });
    await userEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await waitFor(() => {
      expect(mockGetPriceStats.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });

  it("onFilterChange prop 있으면 안내 텍스트 표시", async () => {
    mockGetPriceStats.mockResolvedValueOnce({
      complex_no: "C001",
      total_articles: 1,
      by_area: [{ label: "84㎡", maemae_avg: 100000, maemae_count: 1, jeonse_count: 0, wolse_count: 0 }],
      by_floor: [],
    });
    renderWithQuery(<ComplexPriceAreaSection complexNo="C001" onFilterChange={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText(/막대를 클릭하면 해당 면적 매물만 표시됩니다/)).toBeInTheDocument();
    });
  });
});
