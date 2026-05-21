/**
 * ComplexPriceFloorSection 회귀 가드 — useQuery wrapper 정상 동작 검증
 * 실행: npx vitest run src/components/complex/__tests__/ComplexPriceFloorSection.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";
import ComplexPriceFloorSection from "../ComplexPriceFloorSection";

const mockGetPriceStats = vi.fn();

vi.mock("@/lib/api", () => ({
  getPriceStats: (...args: unknown[]) => mockGetPriceStats(...args),
}));

function renderWithQuery(ui: React.ReactElement) {
  return render(ui, { wrapper: TestQueryProvider });
}

describe("ComplexPriceFloorSection", () => {
  it("by_floor 비어있을 때 안내 메시지", async () => {
    mockGetPriceStats.mockResolvedValueOnce({
      complex_no: "C001", total_articles: 0, by_area: [], by_floor: [],
    });
    renderWithQuery(<ComplexPriceFloorSection complexNo="C001" />);
    await waitFor(() => {
      expect(screen.getByText(/층수별 가격 데이터가 부족합니다/)).toBeInTheDocument();
    });
  });

  it("API 에러 시 에러 메시지", async () => {
    mockGetPriceStats.mockRejectedValueOnce(new Error("API down"));
    renderWithQuery(<ComplexPriceFloorSection complexNo="C001" />);
    await waitFor(() => {
      expect(screen.getByText(/가격 통계를 불러오지 못했습니다/)).toBeInTheDocument();
    });
  });

  it("by_floor 있을 때 onFilterChange 안내 텍스트 표시", async () => {
    mockGetPriceStats.mockResolvedValueOnce({
      complex_no: "C001",
      total_articles: 1,
      by_area: [],
      by_floor: [{
        label: "1~5층",
        maemae_avg: 100000, maemae_min: 90000, maemae_max: 110000, maemae_count: 1,
        jeonse_avg: null, jeonse_min: null, jeonse_max: null, jeonse_count: 0,
        wolse_avg: null, wolse_min: null, wolse_max: null, wolse_count: 0,
      }],
    });
    renderWithQuery(<ComplexPriceFloorSection complexNo="C001" onFilterChange={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText(/카드를 클릭하면 해당 층수 매물만 표시됩니다/)).toBeInTheDocument();
    });
  });
});
