/**
 * ComplexPriceFloorTab 컴포넌트 테스트 — 층수별 가격 카드 + 층수 필터
 * 실행: npx vitest run src/components/__tests__/ComplexPriceFloorTab.test.tsx
 *
 * next/dynamic 은 test-setup.ts 에서 null 렌더로 모킹되어 있어
 * LazyCharts (PriceChartInner) 내부는 테스트 범위 밖. 본 테스트는 가드 로직과
 * 클릭 → onFilterChange 호출만 검증한다.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ComplexPriceFloorTab from "../ComplexPriceFloorTab";
import type { PriceStats } from "@/types";

/** 테스트용 PriceStats 팩토리 — 기본 1개 층수 구간 */
function makePriceStats(overrides?: Partial<PriceStats>): PriceStats {
  return {
    complex_no: "C1",
    total_articles: 10,
    by_area: [],
    by_floor: [
      {
        label: "1~5층",
        maemae_avg: 80000, maemae_min: 75000, maemae_max: 85000, maemae_count: 3,
        jeonse_avg: 50000, jeonse_min: 48000, jeonse_max: 52000, jeonse_count: 2,
      },
    ],
    ...overrides,
  };
}

describe("ComplexPriceFloorTab 컴포넌트", () => {
  /** 로딩 상태 */
  it("loading=true 이면 로딩 메시지를 표시한다", () => {
    render(<ComplexPriceFloorTab priceStats={null} error={false} loading={true} />);
    expect(screen.getByText(/로딩 중/)).toBeInTheDocument();
  });

  /** 에러 상태 */
  it("error=true 이면 에러 메시지를 표시한다", () => {
    render(<ComplexPriceFloorTab priceStats={null} error={true} loading={false} />);
    expect(
      screen.getByText(/가격 통계를 불러오지 못했습니다/),
    ).toBeInTheDocument();
  });

  /** 에러 상태 + onRetry — 다시 시도 버튼 */
  it("error=true 이고 onRetry 가 있으면 '다시 시도' 버튼이 보이고 클릭 시 onRetry 를 호출한다", () => {
    const onRetry = vi.fn();
    render(<ComplexPriceFloorTab priceStats={null} error={true} loading={false} onRetry={onRetry} />);
    const btn = screen.getByRole("button", { name: "다시 시도" });
    fireEvent.click(btn);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  /** 에러 상태 + onRetry 미전달 — 버튼 숨김 (하위호환) */
  it("error=true 이고 onRetry 가 없으면 '다시 시도' 버튼을 렌더하지 않는다", () => {
    render(<ComplexPriceFloorTab priceStats={null} error={true} loading={false} />);
    expect(screen.queryByRole("button", { name: "다시 시도" })).not.toBeInTheDocument();
  });

  /** priceStats null → 데이터 부족 */
  it("priceStats=null 이면 데이터 부족 메시지를 표시한다", () => {
    render(<ComplexPriceFloorTab priceStats={null} error={false} loading={false} />);
    expect(
      screen.getByText(/층수별 가격 데이터가 부족합니다/),
    ).toBeInTheDocument();
  });

  /** by_floor 빈 배열도 동일 분기 */
  it("by_floor 가 빈 배열이면 데이터 부족 메시지를 표시한다", () => {
    const stats = makePriceStats({ by_floor: [] });
    render(<ComplexPriceFloorTab priceStats={stats} error={false} loading={false} />);
    expect(
      screen.getByText(/층수별 가격 데이터가 부족합니다/),
    ).toBeInTheDocument();
  });

  /** 정상 데이터 → 층수 레이블 + 매매/전세 섹션 렌더 */
  it("정상 데이터 시 층수 레이블과 거래유형 섹션이 렌더된다", () => {
    const stats = makePriceStats();
    render(<ComplexPriceFloorTab priceStats={stats} error={false} loading={false} />);
    expect(screen.getByText("1~5층")).toBeInTheDocument();
    expect(screen.getByText("매매")).toBeInTheDocument();
    expect(screen.getByText("전세")).toBeInTheDocument();
  });

  /** onFilterChange 미전달 시 안내 문구 숨김 */
  it("onFilterChange 가 없으면 안내 문구가 표시되지 않는다", () => {
    const stats = makePriceStats();
    render(<ComplexPriceFloorTab priceStats={stats} error={false} loading={false} />);
    expect(screen.queryByText(/카드를 클릭하면/)).toBeNull();
  });

  /** 층수 클릭 → min_floor/max_floor 파싱 후 onFilterChange 호출 */
  it("층수 카드 클릭 시 onFilterChange 에 파싱된 min/max_floor 가 전달된다", () => {
    const onFilterChange = vi.fn();
    const stats = makePriceStats();
    render(
      <ComplexPriceFloorTab
        priceStats={stats}
        error={false}
        loading={false}
        onFilterChange={onFilterChange}
      />,
    );
    fireEvent.click(screen.getByText("1~5층"));
    expect(onFilterChange).toHaveBeenCalledWith({ min_floor: 1, max_floor: 5 });
  });

  /** 선택된 카드 재클릭 → 필터 해제 (undefined) */
  it("선택된 층수 카드를 재클릭하면 필터가 해제된다", () => {
    const onFilterChange = vi.fn();
    const stats = makePriceStats();
    render(
      <ComplexPriceFloorTab
        priceStats={stats}
        error={false}
        loading={false}
        onFilterChange={onFilterChange}
      />,
    );
    const card = screen.getByText("1~5층");
    fireEvent.click(card);
    fireEvent.click(card);
    expect(onFilterChange).toHaveBeenNthCalledWith(2, {
      min_floor: undefined,
      max_floor: undefined,
    });
  });
});
