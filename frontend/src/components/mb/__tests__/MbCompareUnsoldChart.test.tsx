/**
 * MbCompareUnsoldChart 테스트 — isError 시각화 회귀 가드
 * 실행: npx vitest run src/components/mb/__tests__/MbCompareUnsoldChart.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import MbCompareUnsoldChart, { type UnsoldDataset } from "../MbCompareUnsoldChart";

// Recharts mock — SVG 대신 간단한 div 반환
vi.mock("recharts", () => ({
  ComposedChart: ({ children }: { children: React.ReactNode }) => <div data-testid="composed-chart">{children}</div>,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

function makeDataset(id: string, name: string, monthCount = 1): UnsoldDataset {
  const items = monthCount > 0
    ? [{ id: 1, apartment_id: id, base_month: "202401", unsold_count: 100 }]
    : [];
  return { apartmentId: id, apartmentName: name, items };
}

describe("MbCompareUnsoldChart — isError 시각화", () => {
  it("isError dataset 1개 + 정상 dataset 1개: 본문 상단에 영향 받은 단지명을 표시한다", () => {
    const datasets: UnsoldDataset[] = [
      makeDataset("A1", "단지A1", 1),
      { ...makeDataset("A2", "단지A2", 0), isError: true },
    ];
    render(<MbCompareUnsoldChart datasets={datasets} />);
    expect(
      screen.getByText(/추이 데이터를 불러오지 못했습니다 \(영향 받은 단지: 단지A2\)/),
    ).toBeInTheDocument();
  });

  it("모든 dataset 이 isError: 단일 안내 텍스트만 렌더 (차트 없음)", () => {
    const datasets: UnsoldDataset[] = [
      { ...makeDataset("A1", "단지A1", 0), isError: true },
      { ...makeDataset("A2", "단지A2", 0), isError: true },
    ];
    render(<MbCompareUnsoldChart datasets={datasets} />);
    expect(
      screen.getByText(/추이 데이터를 불러오지 못했습니다 \(영향 받은 단지: 단지A1, 단지A2\)/),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("composed-chart")).toBeNull();
  });

  it("isError dataset 0개 + 데이터 0개: 기존 '미분양 추이 데이터가 없습니다' 폴백 유지", () => {
    const datasets: UnsoldDataset[] = [
      makeDataset("A1", "단지A1", 0),
      makeDataset("A2", "단지A2", 0),
    ];
    render(<MbCompareUnsoldChart datasets={datasets} />);
    expect(screen.getByText(/미분양 추이 데이터가 없습니다/)).toBeInTheDocument();
    expect(screen.queryByText(/불러오지 못했습니다/)).toBeNull();
  });
});
