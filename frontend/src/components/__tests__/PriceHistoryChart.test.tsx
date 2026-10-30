/**
 * PriceHistoryChart 컴포넌트 테스트 - 가격 추이 라인차트
 * 실행: npx vitest run src/components/__tests__/PriceHistoryChart.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PriceHistoryChart, { CustomTooltip } from "../PriceHistoryChart";
import type { AreaTrade, PriceHistoryItem } from "@/types";

// Recharts는 ResizeObserver/SVG 필요 — 전체 mock 처리
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="chart-container">{children}</div>
  ),
  ComposedChart: ({ children, data }: { children: React.ReactNode; data?: unknown[] }) => (
    <div data-testid="composed-chart" data-rows={JSON.stringify(data ?? [])}>{children}</div>
  ),
  LineChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="line-chart">{children}</div>
  ),
  Line: ({ dataKey, name }: { dataKey: string; name?: string }) => <div data-testid="line" data-key={dataKey} data-name={name ?? ""} />,
  Area: ({ dataKey, name }: { dataKey: string; name?: string }) => <div data-testid="area" data-key={dataKey} data-name={name ?? ""} />,
  // 거래 점 — 점 목록을 글자로 드러낸다(같은 달 여러 점은 진짜 Recharts 로 PriceHistoryChart.scatter.test 가 확인)
  Scatter: ({ data }: { data: { month: string; 거래: number }[] }) => (
    <div data-testid="scatter" data-points={JSON.stringify(data)} />
  ),
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
}));

/** 테스트 데이터 팩토리 */
function makeItem(overrides: Partial<PriceHistoryItem> = {}): PriceHistoryItem {
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

describe("PriceHistoryChart", () => {
  it("빈 데이터 시 안내 메시지 표시", () => {
    render(<PriceHistoryChart items={[]} />);
    expect(screen.getByText(/가격 추이 데이터가 아직 없습니다/)).toBeInTheDocument();
  });

  it("데이터 있을 때 차트 렌더링 (크래시 없음)", () => {
    const items = [
      makeItem({ base_month: "202502", price_avg: 88000 }),
      makeItem({ base_month: "202503", price_avg: 90000 }),
      makeItem({ trade_type: "B1", trade_type_label: "전세", base_month: "202502", price_avg: 47000 }),
      makeItem({ trade_type: "B1", trade_type_label: "전세", base_month: "202503", price_avg: 48000 }),
    ];
    const { container } = render(<PriceHistoryChart items={items} />);
    expect(container.querySelector('[role="img"]')).toBeInTheDocument();
  });

  it("매매만 있을 때도 정상 렌더링", () => {
    const items = [
      makeItem({ base_month: "202502" }),
      makeItem({ base_month: "202503" }),
    ];
    const { container } = render(<PriceHistoryChart items={items} />);
    expect(container.querySelector('[role="img"]')).toBeInTheDocument();
  });

  it("null price_avg 처리 (크래시 없음)", () => {
    const items = [
      makeItem({ base_month: "202502", price_avg: null }),
      makeItem({ base_month: "202503", price_avg: 90000 }),
    ];
    const { container } = render(<PriceHistoryChart items={items} />);
    expect(container.querySelector('[role="img"]')).toBeInTheDocument();
  });

  /* 기간 선택 버튼 테스트 */
  it("기간 필터 버튼 렌더링 (6개월, 1년, 2년, 전체)", () => {
    const items = [makeItem({ base_month: "202503" })];
    render(<PriceHistoryChart items={items} />);
    expect(screen.getByText("6개월")).toBeInTheDocument();
    expect(screen.getByText("1년")).toBeInTheDocument();
    expect(screen.getByText("2년")).toBeInTheDocument();
    expect(screen.getByText("전체")).toBeInTheDocument();
  });

  it("전체가 기본 선택 상태", () => {
    const items = [makeItem({ base_month: "202503" })];
    render(<PriceHistoryChart items={items} />);
    const allBtn = screen.getByText("전체");
    expect(allBtn.className).toContain("bg-blue-600");
  });

  it("6개월 버튼 클릭 시 활성 상태 변경", async () => {
    // 현재 날짜 기준 최근 월 데이터 사용 (6개월 필터에도 남도록)
    const now = new Date();
    const recentMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
    const items = [makeItem({ base_month: recentMonth })];
    render(<PriceHistoryChart items={items} />);
    await userEvent.click(screen.getByText("6개월"));
    await waitFor(() => {
      expect(screen.getByText("6개월").className).toContain("bg-blue-600");
      expect(screen.getByText("전체").className).not.toContain("bg-blue-600");
    });
  });

  it("빈 데이터일 때 기간 버튼 표시 안 함", () => {
    render(<PriceHistoryChart items={[]} />);
    expect(screen.queryByText("6개월")).not.toBeInTheDocument();
  });
});

/* ── 세션 489 PR b2 (B29 설계 §1 D·G) — 중위 선 삭제 · 최저~최고 띠 · 거래 하나 = 점 하나 ── */

function trade(o: Partial<AreaTrade> = {}): AreaTrade {
  return { price: 15700, date: "2026-06-26", floor: 4, direct: false, ...o };
}

/** 6139 59㎡ 기본선(라이브 API 10-31 실측 꼴) — 202606 두 건 · 202605 한 건 · 전세는 네이버 */
function govItems(): PriceHistoryItem[] {
  return [
    makeItem({ base_month: "202605", series: "정부 실거래", price_avg: 18000, price_lower: 18000, price_upper: 18000,
      range_lower: 18000, range_upper: 18000, trades: [trade({ price: 18000, date: "2026-05-05", floor: 7 })] }),
    makeItem({ base_month: "202606", series: "정부 실거래", price_avg: 16450, price_lower: 15700, price_upper: 17200,
      range_lower: 15700, range_upper: 17200,
      trades: [trade({ price: 15700, date: "2026-06-26", floor: 4 }), trade({ price: 17200, date: "2026-06-05", floor: 8 })] }),
    makeItem({ trade_type: "B1", trade_type_label: "전세", base_month: "202606", series: "네이버 시세", price_avg: 12000,
      price_lower: null, price_upper: null }),
  ];
}

describe("PriceHistoryChart — 범위 띠 + 거래 점 (B29)", () => {
  it("D — 정부 실거래 매매는 중위 선이 없다 · 띠 이름 '매매 정부 실거래 최저~최고' · 전세 선은 그대로", () => {
    render(<PriceHistoryChart items={govItems()} areaLabel="전용 59㎡ 대" />);
    const lines = screen.getAllByTestId("line").map((el) => el.getAttribute("data-key"));
    expect(lines).not.toContain("매매");                       // 중위(price_avg) 선 삭제
    expect(lines).toContain("전세");                           // 전세 선(네이버 평균)은 그대로
    const band = screen.getAllByTestId("area").find((el) => el.getAttribute("data-key") === "매매_범위");
    expect(band?.getAttribute("data-name")).toBe("매매 정부 실거래 최저~최고 (전용 59㎡ 대)");
    const names = [...screen.getAllByTestId("line"), ...screen.getAllByTestId("area")].map((el) => el.getAttribute("data-name")).join(" ");
    expect(names).not.toMatch(/중위|중앙값/);
  });

  it("D — 거래 하나 = 점 하나, 그 달 x 에 겹친다(202606 → 점 2개)", () => {
    render(<PriceHistoryChart items={govItems()} />);
    const points = JSON.parse(screen.getByTestId("scatter").getAttribute("data-points")!);
    expect(points).toEqual([
      { month: "26.05", 거래: 18000 },
      { month: "26.06", 거래: 15700 },
      { month: "26.06", 거래: 17200 },
    ]);
  });

  it("D — 띠 재료는 range_lower/upper(직거래 제외) — 옛 price_lower/upper 가 아니다", () => {
    const items = govItems();
    items[1] = { ...items[1], price_lower: 9000, price_upper: 99000 };   // 옛 칸(직거래 포함)은 일부러 엉뚱하게
    render(<PriceHistoryChart items={items} />);
    const rows: Record<string, unknown>[] = JSON.parse(screen.getByTestId("composed-chart").getAttribute("data-rows")!);
    const june = rows.find((r) => r.month === "26.06")!;
    expect(june["매매_범위"]).toEqual([15700, 17200]);
    expect(june["매매_하한"]).toBe(15700);
    expect(june["매매_상한"]).toBe(17200);
    expect(june["매매"]).toBeUndefined();                     // 중위(price_avg 16450)는 줄 재료에서도 빠진다
  });

  it("설명창 — 정부 실거래 최저~최고 한 줄(같으면 한 값)", () => {
    render(
      <CustomTooltip active label="26.06"
        payload={[{ dataKey: "매매_상한", value: 17200, color: "" }, { dataKey: "매매_하한", value: 15700, color: "" }]} />,
    );
    expect(screen.getByText("매매 정부 실거래 최저~최고")).toBeInTheDocument();
    expect(screen.getByText(/1억5,700만~1억7,200만/)).toBeInTheDocument();
  });

  it("D — 점은 trades 가 있는 달만: 24개월 밖 달(BE 가 trades [] 로 준다)은 띠만, 점 0", () => {
    const items: PriceHistoryItem[] = [
      makeItem({ base_month: "202301", series: "정부 실거래", range_lower: 14000, range_upper: 15000, trades: [] }),
      ...govItems(),
    ];
    render(<PriceHistoryChart items={items} />);
    const points: { month: string }[] = JSON.parse(screen.getByTestId("scatter").getAttribute("data-points")!);
    expect(points.filter((p) => p.month === "23.01")).toHaveLength(0);
    expect(points).toHaveLength(3);
  });

  it("D — 거래가 하나도 없으면 점 계열을 그리지 않는다", () => {
    render(<PriceHistoryChart items={govItems().map((it) => ({ ...it, trades: [] }))} />);
    expect(screen.queryByTestId("scatter")).toBeNull();
  });

  it("D0 — 설명창: 한 달 3건이면 거래 줄 3개('2026.06.26 · 4층 · 1억 5,700만 · 직거래')", () => {
    const tradesByMonth = new Map<string, AreaTrade[]>([["26.06", [
      trade({ price: 15700, date: "2026-06-26", floor: 4, direct: true }),
      trade({ price: 17200, date: "2026-06-05", floor: 8 }),
      trade({ price: 16000, date: null, floor: null }),
    ]]]);
    render(
      <CustomTooltip active label="26.06" tradesByMonth={tradesByMonth}
        payload={[{ dataKey: "매매_상한", value: 17200, color: "" }, { dataKey: "매매_하한", value: 15700, color: "" }]} />,
    );
    expect(screen.getAllByTestId("tooltip-trade").map((el) => el.textContent)).toEqual([
      "2026.06.26 · 4층 · 1억 5,700만 · 직거래",
      "2026.06.05 · 8층 · 1억 7,200만",
      "날짜 미상 · 1억 6,000만",
    ]);
  });

  it("옛 응답(계열 없음)은 지금처럼 '매매 평균' 선", () => {
    render(<PriceHistoryChart items={[makeItem({ base_month: "202502" }), makeItem({ base_month: "202503" })]} />);
    const avg = screen.getAllByTestId("line").find((el) => el.getAttribute("data-key") === "매매");
    expect(avg?.getAttribute("data-name")).toBe("매매 평균");
  });
});
