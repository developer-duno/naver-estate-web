/**
 * MbTradeStatsCharts 테스트 — 면적별·층별 평균가 BarChart 2종
 * 실행: npx vitest run src/components/mb/__tests__/MbTradeStatsCharts.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { MbTradeStats } from "@/types";

// Recharts mock — SVG 대신 단순 div
vi.mock("recharts", () => ({
  BarChart: ({ children }: { children: React.ReactNode }) => <div data-testid="bar-chart">{children}</div>,
  Bar: ({ name }: { name: string }) => <span data-testid={`bar-${name}`}>{name}</span>,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import MbTradeStatsCharts from "../MbTradeStatsCharts";

function makeTradeStats(overrides: Partial<MbTradeStats> = {}): MbTradeStats {
  return {
    apartment_id: "APT001",
    ...overrides,
  };
}

describe("MbTradeStatsCharts", () => {
  it("price_by_area + price_by_floor 모두 있으면 BarChart 2개 렌더", () => {
    const ts = makeTradeStats({
      price_by_area: { "59": 60000, "84": 80000, "109": 110000 },
      price_by_floor: { "저층": 65000, "중층": 80000, "고층": 95000 },
    });
    render(<MbTradeStatsCharts tradeStats={ts} />);
    const charts = screen.getAllByTestId("bar-chart");
    expect(charts).toHaveLength(2);
    expect(screen.getByText("면적별 평균 거래가")).toBeInTheDocument();
    expect(screen.getByText("층별 평균 거래가")).toBeInTheDocument();
  });

  it("price_by_area 만 있으면 BarChart 1개 렌더 (면적만)", () => {
    const ts = makeTradeStats({
      price_by_area: { "59": 60000, "84": 80000 },
    });
    render(<MbTradeStatsCharts tradeStats={ts} />);
    expect(screen.getAllByTestId("bar-chart")).toHaveLength(1);
    expect(screen.getByText("면적별 평균 거래가")).toBeInTheDocument();
    expect(screen.queryByText("층별 평균 거래가")).not.toBeInTheDocument();
  });

  it("둘 다 없으면 null 반환 (아무것도 렌더 안 됨)", () => {
    const ts = makeTradeStats({});
    const { container } = render(<MbTradeStatsCharts tradeStats={ts} />);
    expect(container.innerHTML).toBe("");
  });

  it("빈 JSON {} 이면 null 반환", () => {
    const ts = makeTradeStats({ price_by_area: {}, price_by_floor: {} });
    const { container } = render(<MbTradeStatsCharts tradeStats={ts} />);
    expect(container.innerHTML).toBe("");
  });

  it("0 또는 음수 값은 차트에서 제외된다", () => {
    const ts = makeTradeStats({
      price_by_area: { "59": 60000, "84": 0, "109": -100, "120": 130000 },
    });
    render(<MbTradeStatsCharts tradeStats={ts} />);
    expect(screen.getAllByTestId("bar-chart")).toHaveLength(1);
  });

  it("price_by_area 가 number 아닌 값은 제외 (안전 파싱)", () => {
    const ts = makeTradeStats({
      price_by_area: { "59": 60000, "84": "abc", "109": null },
    });
    render(<MbTradeStatsCharts tradeStats={ts} />);
    expect(screen.getAllByTestId("bar-chart")).toHaveLength(1);
  });

  it("rent_by_area 만 있으면 임대료 BarChart 1개 렌더", () => {
    const ts = makeTradeStats({
      rent_by_area: { "59": 80, "84": 120 },
    });
    render(<MbTradeStatsCharts tradeStats={ts} />);
    expect(screen.getAllByTestId("bar-chart")).toHaveLength(1);
    expect(screen.getByText("면적별 평균 임대료")).toBeInTheDocument();
    expect(screen.queryByText("면적별 평균 전세가")).not.toBeInTheDocument();
  });

  it("jeonse_by_area 만 있으면 전세 BarChart 1개 렌더", () => {
    const ts = makeTradeStats({
      jeonse_by_area: { "59": 45000, "84": 65000 },
    });
    render(<MbTradeStatsCharts tradeStats={ts} />);
    expect(screen.getAllByTestId("bar-chart")).toHaveLength(1);
    expect(screen.getByText("면적별 평균 전세가")).toBeInTheDocument();
    expect(screen.queryByText("면적별 평균 임대료")).not.toBeInTheDocument();
  });

  it("4종 모두 있으면 BarChart 4개 렌더 (매매·임대료·전세·층별)", () => {
    const ts = makeTradeStats({
      price_by_area: { "59": 60000, "84": 80000 },
      rent_by_area: { "59": 80, "84": 120 },
      jeonse_by_area: { "59": 45000, "84": 65000 },
      price_by_floor: { "저층": 65000, "고층": 95000 },
    });
    render(<MbTradeStatsCharts tradeStats={ts} />);
    expect(screen.getAllByTestId("bar-chart")).toHaveLength(4);
  });
});
