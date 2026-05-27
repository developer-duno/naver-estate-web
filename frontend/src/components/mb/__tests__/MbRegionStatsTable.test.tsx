/**
 * MbRegionStatsTable 테스트 — 데스크톱 12 컬럼 + 모바일 카드 5행 (㎡당시세·초기분양률·토지비율)
 * 실행: npx vitest run src/components/mb/__tests__/MbRegionStatsTable.test.tsx
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { MbRegion } from "@/types";
import MbRegionStatsTable from "../MbRegionStatsTable";

function makeRegion(overrides: Partial<MbRegion> & { id: number }): MbRegion {
  return {
    region: "서울",
    gu: "강남",
    population: 500000,
    households: 200000,
    regional_unsold: 30,
    pop_growth: 0.5,
    avg_income: 5000,
    supply_ratio: 12.5,
    jeonse_rate: 60,
    avg_price: 80000,
    ...overrides,
  };
}

describe("MbRegionStatsTable", () => {
  it("데스크톱 thead 에 3 신규 컬럼 (㎡당시세·초기분양률·토지비율) 헤더가 렌더된다", () => {
    render(<MbRegionStatsTable regions={[makeRegion({ id: 1 })]} />);
    expect(screen.getByText("㎡당시세")).toBeInTheDocument();
    expect(screen.getByText("초기분양률")).toBeInTheDocument();
    expect(screen.getByText("토지비율")).toBeInTheDocument();
  });

  it("3 신규 필드 값이 있을 때 데스크톱 tbody 에 포맷 적용되어 렌더된다", () => {
    const regions = [
      makeRegion({
        id: 1,
        avg_price_sqm: 2500,
        initial_sale_rate: 85.3,
        land_cost_ratio: 42.1,
      }),
    ];
    render(<MbRegionStatsTable regions={regions} />);
    expect(screen.getByText("85.3%")).toBeInTheDocument();
    expect(screen.getByText("42.1%")).toBeInTheDocument();
  });

  it("3 신규 필드 값이 null 이면 '-' fallback 표시", () => {
    render(<MbRegionStatsTable regions={[makeRegion({ id: 1 })]} />);
    const dashes = screen.getAllByText("-");
    expect(dashes.length).toBeGreaterThanOrEqual(3);
  });

  it("모바일 카드 5행: 신규 3 필드 모두 있으면 mt-0.5 행에 노출된다", () => {
    const regions = [
      makeRegion({
        id: 1,
        avg_price_sqm: 2500,
        initial_sale_rate: 85.3,
        land_cost_ratio: 42.1,
      }),
    ];
    const { container } = render(<MbRegionStatsTable regions={regions} />);
    const cards = container.querySelector('[data-testid="mb-region-cards"]');
    expect(cards).not.toBeNull();
    expect(cards?.textContent).toContain("초기분양 85.3%");
    expect(cards?.textContent).toContain("토지비 42.1%");
  });

  it("모바일 카드 5행: 신규 3 필드 모두 null 이면 5행 영역 자체가 미렌더 (조건부)", () => {
    const { container } = render(<MbRegionStatsTable regions={[makeRegion({ id: 1 })]} />);
    const cards = container.querySelector('[data-testid="mb-region-cards"]');
    expect(cards?.textContent).not.toContain("㎡당");
    expect(cards?.textContent).not.toContain("초기분양");
    expect(cards?.textContent).not.toContain("토지비");
  });

  it("빈 배열이면 EmptyState 카피 ('표시할 지역 통계가 없어요') 표시", () => {
    render(<MbRegionStatsTable regions={[]} />);
    expect(screen.getByText("표시할 지역 통계가 없어요")).toBeInTheDocument();
  });
});
