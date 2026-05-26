/**
 * ComplexDashboardMobile 회귀 가드 (PR 4e-1)
 * 5장 요약 카드 + Accordion 5 섹션 (중요도순) — 5 자식 섹션은 모킹.
 * 실행: npx vitest run src/components/complex/__tests__/ComplexDashboardMobile.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ComplexDashboardMobile from "../ComplexDashboardMobile";
import type { Complex, PyeongDetail } from "@/types";

vi.mock("@/components/complex/ComplexPriceFloorSection", () => ({
  default: () => <div data-testid="mock-price-floor" />,
}));
vi.mock("@/components/complex/ComplexPriceAreaSection", () => ({
  default: () => <div data-testid="mock-price-area" />,
}));
vi.mock("@/components/complex/PriceChartSection", () => ({
  default: () => <div data-testid="mock-price-chart" />,
}));

const baseComplex: Complex = {
  complex_no: "C001",
  complex_name: "테스트단지",
  total_household_count: 1234,
  total_dong_count: 12,
  nearby_median_price: 80000,
  jeonse_rate: 65,
  recent_trades_6m: 42,
};

const samplePyeong: PyeongDetail[] = [
  { pyeong_no: 1, pyeong_name: "84A", exclusive_area: "84.99" },
  { pyeong_no: 2, pyeong_name: "109B", exclusive_area: "109.95" },
];

describe("ComplexDashboardMobile", () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });
  // scrollIntoView 부수효과 검증은 jsdom 환경에서 불안정 — aria-expanded toggle 로 대체 검증

  it("5장 요약 카드 라벨 + 핵심 지표 표시 (중요도순)", () => {
    render(
      <ComplexDashboardMobile
        complex={baseComplex}
        complexNo="C001"
        pyeongDetails={samplePyeong}
        sessionToken={undefined}
        onFilterChange={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "시세 메뉴 열기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "실거래가 메뉴 열기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "단지정보 메뉴 열기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "평형 메뉴 열기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "면적별 시세 메뉴 열기" })).toBeInTheDocument();
    expect(screen.getByText(/전세가율 65%/)).toBeInTheDocument();
    expect(screen.getByText("42건")).toBeInTheDocument();
    expect(screen.getByText("1,234세대")).toBeInTheDocument();
    expect(screen.getByText("2개")).toBeInTheDocument();
  });

  it("요약 카드 클릭 시 해당 Accordion 펼침 (aria-expanded toggle)", async () => {
    render(
      <ComplexDashboardMobile
        complex={baseComplex}
        complexNo="C001"
        pyeongDetails={samplePyeong}
        sessionToken={undefined}
        onFilterChange={() => {}}
      />,
    );
    const priceCard = screen.getByRole("button", { name: "시세 메뉴 열기" });
    expect(priceCard).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(priceCard);
    expect(priceCard).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(priceCard);
    expect(priceCard).toHaveAttribute("aria-expanded", "false");
  });

  it("값 없을 때 '-' 표시 (silent failure 방지)", () => {
    const empty: Complex = { complex_no: "C002", complex_name: "값없음단지" };
    render(
      <ComplexDashboardMobile
        complex={empty}
        complexNo="C002"
        pyeongDetails={[]}
        sessionToken={undefined}
        onFilterChange={() => {}}
      />,
    );
    const dashes = screen.getAllByText("-");
    expect(dashes.length).toBeGreaterThanOrEqual(3);
  });

  it("평형 데이터 0건일 때 안내 메시지 표시 (Accordion 펼친 후)", async () => {
    const empty: Complex = { complex_no: "C003", complex_name: "평형없음단지" };
    render(
      <ComplexDashboardMobile
        complex={empty}
        complexNo="C003"
        pyeongDetails={[]}
        sessionToken={undefined}
        onFilterChange={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "평형 메뉴 열기" }));
    expect(
      await screen.findByText("면적별 정보가 아직 수집되지 않았습니다."),
    ).toBeInTheDocument();
  });
});
