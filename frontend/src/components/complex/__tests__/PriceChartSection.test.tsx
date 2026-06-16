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
      // B2 게이트: 4번째 인자 accessToken (prop 없으면 undefined)
      expect(mockGetPriceHistory).toHaveBeenCalledWith("C001", undefined, undefined, undefined);
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
      expect(mockGetPriceHistory).toHaveBeenCalledWith("C001", undefined, "1", undefined);
    });
  });

  it("pyeongDetails 없으면 면적 select 숨김", async () => {
    renderWithQuery(<PriceChartSection complexNo="C001" pyeongDetails={[]} />);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("priceHistory 실패 시 에러 문구 + '다시 시도' 버튼 노출, 클릭하면 재조회한다", async () => {
    mockGetPriceHistory.mockRejectedValue(new Error("network"));
    renderWithQuery(<PriceChartSection complexNo="C001" pyeongDetails={[]} />);
    await waitFor(() => {
      expect(screen.getByText(/가격 추이를 불러오지 못했습니다/)).toBeInTheDocument();
    });
    const callsBefore = mockGetPriceHistory.mock.calls.length;
    await userEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await waitFor(() => {
      expect(mockGetPriceHistory.mock.calls.length).toBeGreaterThan(callsBefore);
    });
    // 다음 테스트 오염 방지 — 기본 성공 응답 복원
    mockGetPriceHistory.mockResolvedValue({ complex_no: "C001", items: [] });
  });

  it("accessToken 없으면 수집 버튼 옆에 '로그인 후 수집할 수 있습니다' 안내 노출", async () => {
    renderWithQuery(<PriceChartSection complexNo="C001" pyeongDetails={[]} />);
    expect(await screen.findByText(/로그인 후 수집할 수 있습니다/)).toBeInTheDocument();
  });

  it("accessToken 있으면 로그인 안내 미노출", async () => {
    renderWithQuery(<PriceChartSection complexNo="C001" pyeongDetails={[]} accessToken="t" />);
    await waitFor(() => {
      expect(mockStartPriceCollect).toHaveBeenCalled();
    });
    expect(screen.queryByText(/로그인 후 수집할 수 있습니다/)).not.toBeInTheDocument();
  });

  it("startPriceCollect 가 429 reject 시 '요청 한도 초과' 에러 메시지 노출 (사용자 침묵 방지)", async () => {
    const apiErr = Object.assign(new Error("rate limit"), { statusCode: 429 });
    mockStartPriceCollect.mockRejectedValueOnce(apiErr);
    renderWithQuery(<PriceChartSection complexNo="C001" pyeongDetails={[]} accessToken="t" />);
    await waitFor(() => {
      expect(mockStartPriceCollect).toHaveBeenCalledWith("C001", "t");
    });
    // usePriceCollect onError → setMessage("요청 한도 초과", "error")
    await waitFor(() => {
      expect(screen.getByText(/요청 한도 초과/)).toBeInTheDocument();
    });
  });
});
