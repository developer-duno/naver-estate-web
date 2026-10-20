/**
 * CompareCharts + 차트 컴포넌트 통합 테스트
 * 실행: npx vitest run src/components/__tests__/CompareCharts.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";

import CompareCharts from "../CompareCharts";
import ComparePriceTrendChart from "../ComparePriceTrendChart";
import ComparePriceBarChart from "../ComparePriceBarChart";
import CompareFloorChart from "../CompareFloorChart";
import CompareAreaPriceTable from "../CompareAreaPriceTable";
import CompareMaintenanceTable from "../CompareMaintenanceTable";
import type { PriceHistoryItem, PriceStats } from "@/types";

// CompareCharts 컨테이너용 API mock (자식 차트 테스트에는 영향 0 — 자식은 @/lib/api 미사용)
const mockGetPriceHistory = vi.fn();
const mockGetPriceStats = vi.fn();
const mockGetPyeongDetails = vi.fn();

vi.mock("@/lib/api", () => ({
  getPriceHistory: (...args: unknown[]) => mockGetPriceHistory(...args),
  getPriceStats: (...args: unknown[]) => mockGetPriceStats(...args),
  getPyeongDetails: (...args: unknown[]) => mockGetPyeongDetails(...args),
}));

// Recharts mock (ResizeObserver/SVG 불필요)
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="chart-container">{children}</div>
  ),
  ComposedChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="composed-chart">{children}</div>
  ),
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="bar-chart">{children}</div>
  ),
  Line: () => <div data-testid="line" />,
  Area: () => <div data-testid="area" />,
  Bar: () => <div data-testid="bar" />,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
  Cell: () => null,
  LabelList: () => null,
}));

/** 팩토리 함수 */
function makePriceItem(overrides: Partial<PriceHistoryItem> = {}): PriceHistoryItem {
  return {
    trade_type: "A1",
    trade_type_label: "매매",
    price_upper: 95000,
    price_lower: 85000,
    price_avg: 90000,
    base_month: "202503",
    ...overrides,
  };
}

function makePriceStats(overrides: Partial<PriceStats> = {}): PriceStats {
  return {
    complex_no: "100001",
    total_articles: 10,
    by_area: [
      { label: "59m²", maemae: 50000, jeonse: 30000, wolse: 800, maemae_count: 3, jeonse_count: 2, wolse_count: 1 },
    ],
    by_floor: [
      { label: "저층(1-5)", maemae_avg: 48000, maemae_min: 45000, maemae_max: 51000, maemae_count: 2 },
      { label: "중층(6-15)", maemae_avg: 52000, maemae_min: 49000, maemae_max: 55000, maemae_count: 3 },
      { label: "고층(16+)", maemae_avg: 58000, maemae_min: 55000, maemae_max: 61000, maemae_count: 2 },
    ],
    ...overrides,
  };
}

/* ── ComparePriceTrendChart 테스트 ── */

describe("ComparePriceTrendChart", () => {
  it("빈 데이터 시 안내 메시지", () => {
    render(<ComparePriceTrendChart datasets={[]} />);
    expect(screen.getByText(/가격 추이 데이터가 부족/)).toBeInTheDocument();
  });

  it("2개 단지 데이터로 차트 렌더링", () => {
    const datasets = [
      {
        complexNo: "1", complexName: "단지A",
        items: [makePriceItem({ base_month: "202501" }), makePriceItem({ base_month: "202502" })],
      },
      {
        complexNo: "2", complexName: "단지B",
        items: [makePriceItem({ base_month: "202501", price_avg: 80000 })],
      },
    ];
    render(<ComparePriceTrendChart datasets={datasets} />);
    expect(screen.getByTestId("composed-chart")).toBeInTheDocument();
  });

  it("기간 필터 버튼 렌더링", () => {
    const datasets = [{
      complexNo: "1", complexName: "A",
      items: [makePriceItem()],
    }];
    render(<ComparePriceTrendChart datasets={datasets} />);
    expect(screen.getByText("6개월")).toBeInTheDocument();
    expect(screen.getByText("1년")).toBeInTheDocument();
    expect(screen.getByText("2년")).toBeInTheDocument();
    // "전체"는 거래유형 토글 + 기간 필터 양쪽에 존재
    expect(screen.getAllByText("전체").length).toBe(2);
  });

  it("거래유형 토글 버튼 렌더링", () => {
    const datasets = [{
      complexNo: "1", complexName: "A",
      items: [makePriceItem()],
    }];
    render(<ComparePriceTrendChart datasets={datasets} />);
    expect(screen.getByText("매매")).toBeInTheDocument();
    expect(screen.getByText("전세")).toBeInTheDocument();
  });

  // 세션 472 PR 3 — "★ 최근 매매 최고" 판정 줄을 지웠다. 값이 갈라져도 판정 글이 없어야 한다
  it("최근 매매 최고 판정 줄을 표시하지 않는다", () => {
    const datasets = [
      { complexNo: "1", complexName: "높은단지", items: [makePriceItem({ price_avg: 120000 })] },
      { complexNo: "2", complexName: "낮은단지", items: [makePriceItem({ price_avg: 80000 })] },
    ];
    const { container } = render(<ComparePriceTrendChart datasets={datasets} />);
    expect(screen.queryByText(/최근 매매 최고/)).toBeNull();
    expect(container.textContent).not.toContain("★");
  });
});

/* ── ComparePriceBarChart 테스트 ── */

describe("ComparePriceBarChart", () => {
  it("빈 데이터 시 안내 메시지", () => {
    render(
      <ComparePriceBarChart
        datasets={[{ complexNo: "1", complexName: "A", priceStats: makePriceStats({ by_area: [] }) }]}
      />,
    );
    expect(screen.getByText(/가격 통계 데이터가 부족/)).toBeInTheDocument();
  });

  it("데이터 있을 때 바차트 렌더링", () => {
    render(
      <ComparePriceBarChart
        datasets={[
          { complexNo: "1", complexName: "A", priceStats: makePriceStats() },
          { complexNo: "2", complexName: "B", priceStats: makePriceStats() },
        ]}
      />,
    );
    expect(screen.getByTestId("bar-chart")).toBeInTheDocument();
  });

  // 세션 472 PR 3 — 막대 위 ★·"★ 매매: 단지" 판정 줄을 지웠다
  it("값이 갈라져도 판정 ★·판정 줄을 표시하지 않는다", () => {
    const { container } = render(
      <ComparePriceBarChart
        datasets={[
          { complexNo: "1", complexName: "A", priceStats: makePriceStats() },
          { complexNo: "2", complexName: "B", priceStats: makePriceStats({
            by_area: [{ label: "59m²", maemae: 90000, jeonse: 60000, wolse: 900, maemae_count: 2, jeonse_count: 2, wolse_count: 1 }],
          }) },
        ]}
      />,
    );
    expect(container.textContent).not.toContain("★");
    expect(screen.queryByText(/매매: B/)).toBeNull();
  });
});

/* ── CompareFloorChart 테스트 ── */

describe("CompareFloorChart", () => {
  it("빈 데이터 시 안내 메시지", () => {
    render(
      <CompareFloorChart
        datasets={[{ complexNo: "1", complexName: "A", priceStats: makePriceStats({ by_floor: [] }) }]}
      />,
    );
    expect(screen.getByText(/층별 가격 데이터가 부족/)).toBeInTheDocument();
  });

  it("데이터 있을 때 바차트 렌더링", () => {
    render(
      <CompareFloorChart
        datasets={[
          { complexNo: "1", complexName: "A", priceStats: makePriceStats() },
          { complexNo: "2", complexName: "B", priceStats: makePriceStats() },
        ]}
      />,
    );
    expect(screen.getByTestId("bar-chart")).toBeInTheDocument();
  });

  // 세션 472 PR 3 — "★ 저층 최고: 단지" 판정 줄을 지웠다
  it("층구간별 최고 판정 줄을 표시하지 않는다", () => {
    render(
      <CompareFloorChart
        datasets={[
          { complexNo: "1", complexName: "단지A", priceStats: makePriceStats() },
          { complexNo: "2", complexName: "단지B", priceStats: makePriceStats({
            by_floor: [
              { label: "저층(1-5)", maemae_avg: 99000, maemae_count: 1 },
              { label: "중층(6-15)", maemae_avg: 99000, maemae_count: 1 },
              { label: "고층(16+)", maemae_avg: 99000, maemae_count: 1 },
            ],
          }) },
        ]}
      />,
    );
    // 단지B가 모든 층에서 비싸도 판정 글이 없다
    expect(screen.queryByText(/최고: 단지B/)).toBeNull();
    expect(screen.queryByText("★")).toBeNull();
  });

  // 세션 475 PR 6 — 단지마다 대표 면적 묶음 매물 기준, 묶음을 아는 단지만 한 줄에
  it("단지별 층별 기준 면적을 한 줄로, 모르는 단지는 뺀다", () => {
    render(
      <CompareFloorChart
        datasets={[
          { complexNo: "1", complexName: "단지A", priceStats: makePriceStats({ floor_area_m2: 59 }) },
          { complexNo: "2", complexName: "단지B", priceStats: makePriceStats({ floor_area_m2: null }) },
          { complexNo: "3", complexName: "단지C", priceStats: makePriceStats({ floor_area_m2: 84 }) },
        ]}
      />,
    );
    expect(screen.getByText("단지A 전용 59㎡ 대 매물 기준 · 단지C 전용 84㎡ 대 매물 기준")).toBeInTheDocument();
  });

  it("어느 단지도 기준 면적을 모르면 기준 줄이 없다", () => {
    render(
      <CompareFloorChart datasets={[{ complexNo: "1", complexName: "A", priceStats: makePriceStats() }]} />,
    );
    expect(screen.queryByText(/매물 기준/)).toBeNull();
  });
});

/* ── 면적별 가격·관리비 표 — 판정 ★·초록 강조 없음 (세션 472 PR 3) ── */

describe("CompareAreaPriceTable · CompareMaintenanceTable — 값만", () => {
  it("면적별 가격 표에 가장 비싼 칸 강조가 없다", () => {
    const { container } = render(
      <CompareAreaPriceTable
        datasets={[
          { name: "단지A", stats: makePriceStats() },
          { name: "단지B", stats: makePriceStats({
            by_area: [{ label: "59m²", maemae: 90000, jeonse: 60000, maemae_count: 1, jeonse_count: 1 }],
          }) },
        ]}
      />,
    );
    expect(screen.getByText("5억 (3건)")).toBeInTheDocument();
    expect(screen.getByText("9억 (1건)")).toBeInTheDocument();
    expect(container.querySelector(".bg-green-50")).toBeNull();
    expect(container.querySelectorAll(".font-bold")).toHaveLength(0);
  });

  it("관리비 표에 최저 ★·강조가 없다", () => {
    const pd = (cost: number) => ({
      pyeong_no: 1, pyeong_name: "84㎡", avg_maintenance_cost: cost,
    }) as unknown as import("@/types").PyeongDetail;
    const { container } = render(
      <CompareMaintenanceTable
        datasets={[
          { name: "단지A", details: [pd(20)] },
          { name: "단지B", details: [pd(30)] },
        ]}
      />,
    );
    expect(screen.getByText("20만")).toBeInTheDocument();
    expect(screen.getByText("30만")).toBeInTheDocument();
    expect(container.textContent).not.toContain("★");
    expect(container.querySelector(".bg-green-50")).toBeNull();
  });
});

/* ── CompareCharts 컨테이너 — 에러 분기 다시 시도 (세션 298 dead-end 해소) ── */

describe("CompareCharts — 에러 분기 다시 시도 (실패 쿼리만 재조회)", () => {
  const complexes = [
    { complex_no: "1", complex_name: "단지A" },
    { complex_no: "2", complex_name: "단지B" },
  ];

  function renderCharts() {
    return render(
      <CompareCharts complexes={complexes} expandAll />,
      { wrapper: TestQueryProvider },
    );
  }

  /** mock 호출 중 특정 단지번호로 들어온 횟수 */
  const callsFor = (mock: ReturnType<typeof vi.fn>, no: string) =>
    mock.mock.calls.filter((c) => c[0] === no).length;

  beforeEach(() => {
    mockGetPriceHistory.mockReset();
    mockGetPriceStats.mockReset();
    mockGetPyeongDetails.mockReset();
    mockGetPriceHistory.mockResolvedValue({ complex_no: "X", items: [makePriceItem()] });
    mockGetPriceStats.mockResolvedValue(makePriceStats());
    mockGetPyeongDetails.mockResolvedValue({ pyeong_details: [] });
  });

  it("history 1개 실패 → '다시 시도' 클릭 시 실패한 단지만 재조회", async () => {
    mockGetPriceHistory.mockImplementation((no: string) =>
      no === "1"
        ? Promise.reject(new Error("fail"))
        : Promise.resolve({ complex_no: no, items: [makePriceItem()] }),
    );
    renderCharts();
    await waitFor(() => {
      expect(screen.getByText("가격 추이를 불러오지 못했습니다.")).toBeInTheDocument();
    });
    const failedBefore = callsFor(mockGetPriceHistory, "1");
    const okBefore = callsFor(mockGetPriceHistory, "2");
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await waitFor(() => {
      expect(callsFor(mockGetPriceHistory, "1")).toBe(failedBefore + 1);
    });
    expect(callsFor(mockGetPriceHistory, "2")).toBe(okBefore);
  });

  it("stats 1개 실패 → 평균가/층별/면적별표 3곳에 '다시 시도' 노출, 클릭 시 실패 쿼리만 재조회", async () => {
    mockGetPriceStats.mockImplementation((no: string) =>
      no === "2" ? Promise.reject(new Error("fail")) : Promise.resolve(makePriceStats()),
    );
    renderCharts();
    await waitFor(() => {
      expect(screen.getByText("가격 통계를 불러오지 못했습니다.")).toBeInTheDocument();
    });
    const buttons = screen.getAllByRole("button", { name: "다시 시도" });
    expect(buttons.length).toBe(3);
    const failedBefore = callsFor(mockGetPriceStats, "2");
    const okBefore = callsFor(mockGetPriceStats, "1");
    fireEvent.click(buttons[0]);
    await waitFor(() => {
      expect(callsFor(mockGetPriceStats, "2")).toBe(failedBefore + 1);
    });
    expect(callsFor(mockGetPriceStats, "1")).toBe(okBefore);
  });

  it("pyeong 1개 실패 → 관리비/세대구성 2곳에 '다시 시도' 노출, 클릭 시 실패 쿼리만 재조회", async () => {
    mockGetPyeongDetails.mockImplementation((no: string) =>
      no === "1" ? Promise.reject(new Error("fail")) : Promise.resolve({ pyeong_details: [] }),
    );
    renderCharts();
    await waitFor(() => {
      expect(screen.getByText("관리비를 불러오지 못했습니다.")).toBeInTheDocument();
    });
    const buttons = screen.getAllByRole("button", { name: "다시 시도" });
    expect(buttons.length).toBe(2);
    const failedBefore = callsFor(mockGetPyeongDetails, "1");
    const okBefore = callsFor(mockGetPyeongDetails, "2");
    fireEvent.click(buttons[0]);
    await waitFor(() => {
      expect(callsFor(mockGetPyeongDetails, "1")).toBe(failedBefore + 1);
    });
    expect(callsFor(mockGetPyeongDetails, "2")).toBe(okBefore);
  });
});
