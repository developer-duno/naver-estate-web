/**
 * PriceChartSection 회귀 가드 — PR 3a 분해 후 자동 수집 + 면적 select 동작 검증
 * 실행: npx vitest run src/components/complex/__tests__/PriceChartSection.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TestQueryProvider } from "@/test-setup";
import PriceChartSection from "../PriceChartSection";

const mockGetPriceHistory = vi.fn().mockResolvedValue({ complex_no: "C001", items: [] });
const mockStartPriceCollect = vi.fn().mockResolvedValue({ complex_no: "C001", status: "fresh" });
const mockGetPriceCollectStatus = vi.fn().mockResolvedValue({
  complex_no: "C001", status: "idle", collected: 0, failed: 0, total: 0,
});

vi.mock("@/lib/api", () => ({
  getPriceHistory: (...args: unknown[]) => mockGetPriceHistory(...args),
  startPriceCollect: (...args: unknown[]) => mockStartPriceCollect(...args),
  getPriceCollectStatus: (...args: unknown[]) => mockGetPriceCollectStatus(...args),
}));

function renderWithQuery(ui: React.ReactElement) {
  return render(ui, { wrapper: TestQueryProvider });
}

describe("PriceChartSection", () => {
  beforeEach(() => {
    mockGetPriceHistory.mockClear();
    mockStartPriceCollect.mockClear();
  });

  it("페이지 진입 시 priceHistory 자동 호출 (enabled: true)", async () => {
    renderWithQuery(<PriceChartSection complexNo="C001" pyeongDetails={[]} />);
    await waitFor(() => {
      expect(mockGetPriceHistory).toHaveBeenCalledWith("C001", undefined, undefined);
    });
  });

  it("accessToken 있으면 자동 수집 1회 trigger", async () => {
    renderWithQuery(<PriceChartSection complexNo="C001" pyeongDetails={[]} accessToken="t" />);
    await waitFor(() => {
      expect(mockStartPriceCollect).toHaveBeenCalledWith("C001", "t");
    });
  });

  it("accessToken 없으면 수집 버튼 비활성", async () => {
    renderWithQuery(<PriceChartSection complexNo="C001" pyeongDetails={[]} />);
    await waitFor(() => {
      const btn = screen.getByRole("button", { name: /실거래가 수집/ });
      expect(btn).toBeDisabled();
    });
  });

  it("pyeongDetails 있으면 면적 select 표시 + 선택 시 areaNo 포함 호출", async () => {
    const pyeongDetails = [
      { pyeong_no: 1, pyeong_name: "59A", exclusive_area: "59.98", supply_area: "84.0", supply_area_double: 84.0, exclusive_rate: "71" },
    ];
    renderWithQuery(<PriceChartSection complexNo="C001" pyeongDetails={pyeongDetails} />);
    const select = await screen.findByRole("combobox");
    expect(select).toBeInTheDocument();

    await userEvent.selectOptions(select, "1");
    await waitFor(() => {
      expect(mockGetPriceHistory).toHaveBeenCalledWith("C001", undefined, "1");
    });
  });

  it("pyeongDetails 없으면 면적 select 숨김", async () => {
    renderWithQuery(<PriceChartSection complexNo="C001" pyeongDetails={[]} />);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});
