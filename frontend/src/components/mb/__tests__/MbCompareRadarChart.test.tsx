/**
 * MbCompareRadarChart 테스트 — 레이더 차트 + 가중치 프리셋 + 점수 검증
 * 실행: npx vitest run src/components/mb/__tests__/MbCompareRadarChart.test.tsx
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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

function makeApt(overrides: Partial<MbApartment> & { id: string; name: string }): MbApartment {
  return {
    region: "서울",
    units: 300,
    unsold: 10,
    unsold_rate: 3.3,
    parking_ratio: 1.0,
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
  beforeEach(() => {
    localStorage.clear();
  });

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

  it("종합 우위 텍스트와 점수가 표시된다", () => {
    const apts = [
      makeApt({ id: "A", name: "단지A", units: 1000, parking_ratio: 1.5 }),
      makeApt({ id: "B", name: "단지B", units: 200, parking_ratio: 0.8 }),
    ];
    render(<MbCompareRadarChart apartments={apts} />);
    expect(screen.getByText(/종합 우위/)).toBeInTheDocument();
    // 점수 표시 확인 (N점 형태)
    const scoreTexts = screen.getAllByText(/\d+점/);
    expect(scoreTexts.length).toBeGreaterThanOrEqual(2);
  });

  it("칩 클릭으로 축을 비활성화할 수 있다", () => {
    const apts = [makeApt({ id: "A", name: "단지A" }), makeApt({ id: "B", name: "단지B" })];
    render(<MbCompareRadarChart apartments={apts} />);

    // 슬라이더 라벨과 구분: aria-pressed 속성이 있는 버튼만 선택
    const chip = screen.getByRole("button", { name: "세대수", pressed: true });
    expect(chip).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "false");
  });

  it("최소 3개 축은 항상 활성 상태를 유지한다", () => {
    const apts = [makeApt({ id: "A", name: "단지A" }), makeApt({ id: "B", name: "단지B" })];
    render(<MbCompareRadarChart apartments={apts} />);

    // aria-pressed 버튼만 선택하여 클릭 — 10개 비활성화 → 3개 남음
    const labels = ["세대수", "세대당 주차", "최고층", "전세가율", "주변시세", "할인율", "대기질", "의료인프라", "보육", "치안"];
    labels.forEach((label) => {
      const btn = screen.getByRole("button", { name: label, pressed: true });
      fireEvent.click(btn);
    });

    const remaining = ["미분양률", "평당가", "용적률"];
    remaining.forEach((label) => {
      expect(screen.getByRole("button", { name: label })).toHaveAttribute("aria-pressed", "true");
    });

    fireEvent.click(screen.getByRole("button", { name: "미분양률" }));
    expect(screen.getByRole("button", { name: "미분양률" })).toHaveAttribute("aria-pressed", "true");

    expect(screen.getByText("(최소 3개)")).toBeInTheDocument();
  });

  // ── 가중치 관련 테스트 ──

  /** 프리셋 버튼 렌더링 확인 */
  it("가중치 프리셋 버튼 3개가 렌더된다", () => {
    const apts = [makeApt({ id: "A", name: "단지A" }), makeApt({ id: "B", name: "단지B" })];
    render(<MbCompareRadarChart apartments={apts} />);
    expect(screen.getByText("균등")).toBeInTheDocument();
    expect(screen.getByText("투자형")).toBeInTheDocument();
    expect(screen.getByText("실거주형")).toBeInTheDocument();
  });

  /** 가중치 조정 접이식 영역 */
  it("축별 가중치 조정 텍스트가 렌더된다", () => {
    const apts = [makeApt({ id: "A", name: "단지A" }), makeApt({ id: "B", name: "단지B" })];
    render(<MbCompareRadarChart apartments={apts} />);
    expect(screen.getByText(/축별 가중치 조정/)).toBeInTheDocument();
  });

  /** 가중 점수 계산 정확성 — 단지A가 모든 축에서 우세할 때 */
  it("가중 점수 계산이 정확하다 — 우세 단지가 높은 점수를 받는다", () => {
    const apts = [
      makeApt({
        id: "A", name: "단지A",
        units: 1000, parking_ratio: 1.5, max_floor: 30,
        naver_jeonse_rate: 80, naver_nearby_median: 100000,
        discount_pct: 10, unsold_rate: 1, presale_pp: 1000, floor_area_ratio: 150,
      }),
      makeApt({
        id: "B", name: "단지B",
        units: 200, parking_ratio: 0.5, max_floor: 10,
        naver_jeonse_rate: 30, naver_nearby_median: 50000,
        discount_pct: 2, unsold_rate: 10, presale_pp: 3000, floor_area_ratio: 300,
      }),
    ];
    render(<MbCompareRadarChart apartments={apts} />);

    // 단지A가 거의 모든 축에서 우세 → 종합 우위 = 단지A
    expect(screen.getByText(/★ 종합 우위: 단지A/)).toBeInTheDocument();
  });

  /** 프리셋 라벨에 "프리셋:" 텍스트 확인 */
  it("프리셋 영역에 '프리셋:' 라벨이 표시된다", () => {
    const apts = [makeApt({ id: "A", name: "단지A" }), makeApt({ id: "B", name: "단지B" })];
    render(<MbCompareRadarChart apartments={apts} />);
    expect(screen.getByText("프리셋:")).toBeInTheDocument();
  });

  /** reset 버튼: 가중치 변경 후 클릭 → 가중치 표시 3 으로 복원 */
  it("가중치 초기화 버튼 클릭 시 가중치 표시가 3으로 복원된다", () => {
    const apts = [makeApt({ id: "A", name: "단지A" }), makeApt({ id: "B", name: "단지B" })];
    render(<MbCompareRadarChart apartments={apts} />);

    // 슬라이더(units 축) 가중치 5 로 변경
    const sliders = screen.getAllByRole("slider");
    expect(sliders.length).toBeGreaterThan(0);
    fireEvent.change(sliders[0], { target: { value: "5" } });
    expect((sliders[0] as HTMLInputElement).value).toBe("5");

    // 가중치 초기화 버튼 클릭
    const resetBtn = screen.getByRole("button", { name: "가중치 초기화" });
    fireEvent.click(resetBtn);

    // 슬라이더 가중치 3 복원 단언
    expect((sliders[0] as HTMLInputElement).value).toBe("3");
  });
});
