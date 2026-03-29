/**
 * MbCompareRadarChart 테스트 — 레이더 차트 렌더링 검증
 * 실행: npx vitest run src/components/mb/__tests__/MbCompareRadarChart.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { MbApartment } from "@/types";

// Recharts mock — SVG 대신 간단한 div 반환
vi.mock("recharts", () => ({
  RadarChart: ({ children }: { children: React.ReactNode }) => <div data-testid="radar-chart">{children}</div>,
  Radar: ({ name }: { name: string }) => <span data-testid={`radar-${name}`}>{name}</span>,
  PolarGrid: () => null,
  PolarAngleAxis: () => null,
  PolarRadiusAxis: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Legend: () => null,
  Tooltip: () => null,
}));

// next/dynamic 비활성 해제 — 실제 컴포넌트 직접 import
function makeApt(overrides: Partial<MbApartment> & { id: string; name: string }): MbApartment {
  return {
    region: "서울",
    units: 300,
    unsold: 10,
    unsold_rate: 3.3,
    parking_ratio: 100,
    max_floor: 25,
    naver_jeonse_rate: 60,
    naver_nearby_median: 80000,
    discount_pct: 3,
    presale_pp: 2000,
    floor_area_ratio: 220,
    ...overrides,
  };
}

// 직접 import (dynamic 아님)
import MbCompareRadarChart from "../MbCompareRadarChart";

describe("MbCompareRadarChart", () => {
  it("2개 이상 아파트 시 레이더 차트가 렌더된다", () => {
    const apts = [makeApt({ id: "A", name: "단지A" }), makeApt({ id: "B", name: "단지B" })];
    render(<MbCompareRadarChart apartments={apts} />);
    expect(screen.getByTestId("radar-chart")).toBeInTheDocument();
    expect(screen.getByTestId("radar-단지A")).toBeInTheDocument();
    expect(screen.getByTestId("radar-단지B")).toBeInTheDocument();
  });

  it("1개 아파트면 null 반환 (렌더 안 됨)", () => {
    const apts = [makeApt({ id: "A", name: "단지A" })];
    const { container } = render(<MbCompareRadarChart apartments={apts} />);
    expect(container.innerHTML).toBe("");
  });

  it("종합 우위 텍스트가 표시된다", () => {
    const apts = [
      makeApt({ id: "A", name: "단지A", units: 1000, parking_ratio: 150 }),
      makeApt({ id: "B", name: "단지B", units: 200, parking_ratio: 80 }),
    ];
    render(<MbCompareRadarChart apartments={apts} />);
    expect(screen.getByText(/종합 우위/)).toBeInTheDocument();
  });
});
