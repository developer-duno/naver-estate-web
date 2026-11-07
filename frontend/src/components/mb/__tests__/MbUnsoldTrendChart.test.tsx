/**
 * MbUnsoldTrendChart 시험 — 이력 1건 요약 한 줄 + 값 없는 시리즈를 0 으로 그리지 않기 (세션 501 · B32)
 * 실행: npx vitest run src/components/mb/__tests__/MbUnsoldTrendChart.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import MbUnsoldTrendChart, { buildUnsoldChartData } from "../MbUnsoldTrendChart";
import type { MbUnsoldHistory } from "@/types";

// Recharts 는 jsdom 에서 폭 0 이라 그려지지 않는다 → 어느 시리즈를 그렸는지 dataKey 로 찍는 얇은 가짜
vi.mock("recharts", () => ({
  ComposedChart: ({ children }: { children: React.ReactNode }) => <div data-testid="composed-chart">{children}</div>,
  Line: ({ dataKey }: { dataKey: string }) => <div data-testid={`series-${dataKey}`} />,
  Bar: ({ dataKey }: { dataKey: string }) => <div data-testid={`series-${dataKey}`} />,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// 운영 자료는 빈 칸이 null 로 온다(타입은 optional) — 그 모양 그대로 만든다
function makeItem(baseMonth: string, over: Record<string, unknown> = {}): MbUnsoldHistory {
  return {
    id: Number(baseMonth),
    apartment_id: "ap-6026533",
    base_month: baseMonth,
    unsold_count: 25,
    post_completion_unsold: null,
    change: null,
    ...over,
  } as unknown as MbUnsoldHistory;
}

describe("MbUnsoldTrendChart — 이력 1건", () => {
  it("한 달치면 그래프 대신 요약: 세대 수 · 기준월 · 안내 줄, 기간 버튼 없음", () => {
    render(<MbUnsoldTrendChart items={[makeItem("202609")]} />);
    expect(screen.getByText("25세대")).toBeInTheDocument();
    expect(screen.getByText("2026년 9월 기준")).toBeInTheDocument();
    expect(
      screen.getByText("아직 한 달치 자료입니다. 다음 달 자료부터 추이 그래프가 그려집니다."),
    ).toBeInTheDocument();
    expect(screen.queryByText("6M")).toBeNull();
    expect(screen.queryByTestId("composed-chart")).toBeNull();
  });

  it("한 달치인데 미분양 수가 null 이면 '미분양 수 비공개'", () => {
    render(<MbUnsoldTrendChart items={[makeItem("202609", { unsold_count: null })]} />);
    expect(screen.getByText("미분양 수 비공개")).toBeInTheDocument();
    expect(screen.getByText("2026년 9월 기준")).toBeInTheDocument();
    expect(screen.queryByText(/세대$/)).toBeNull();
  });
});

describe("MbUnsoldTrendChart — 값 없는 시리즈 숨김", () => {
  it("2건 · 준공후·증감이 전부 null 이면 그 두 시리즈를 그리지 않는다", () => {
    render(<MbUnsoldTrendChart items={[makeItem("202608"), makeItem("202609")]} />);
    expect(screen.getByTestId("series-unsold")).toBeInTheDocument();
    expect(screen.queryByTestId("series-postCompletion")).toBeNull();
    expect(screen.queryByTestId("series-change")).toBeNull();
    expect(screen.getByText("6M")).toBeInTheDocument();
  });

  it("2건 · 준공후·증감 값이 한 달이라도 있으면 그린다", () => {
    render(
      <MbUnsoldTrendChart
        items={[makeItem("202608"), makeItem("202609", { post_completion_unsold: 3, change: -2 })]}
      />,
    );
    expect(screen.getByTestId("series-postCompletion")).toBeInTheDocument();
    expect(screen.getByTestId("series-change")).toBeInTheDocument();
  });

  it("0건이면 '미분양 추이 데이터가 없습니다.' 그대로", () => {
    render(<MbUnsoldTrendChart items={[]} />);
    expect(screen.getByText("미분양 추이 데이터가 없습니다.")).toBeInTheDocument();
  });
});

// 월 목록 만들기 — 2025-01 부터 n 개
function months(n: number): string[] {
  return Array.from({ length: n }, (_, i) => {
    const y = 2025 + Math.floor(i / 12);
    const m = (i % 12) + 1;
    return `${y}${String(m).padStart(2, "0")}`;
  });
}

describe("buildUnsoldChartData — 빈 달은 0 이 아니라 null (세션 502 · B33 전제)", () => {
  it("가운데 달 unsold_count 가 null 이면 그 달 unsold 는 null (0 아님), 앞뒤 달은 값 유지", () => {
    const items = [
      makeItem("202607", { unsold_count: 10 }),
      makeItem("202608", { unsold_count: null }),
      makeItem("202609", { unsold_count: 12 }),
    ];
    const { data } = buildUnsoldChartData(items, 24);
    expect(data.map((d) => d.unsold)).toEqual([10, null, 12]);
    expect(data[1].unsold).not.toBe(0);
  });

  it("진짜 0 은 0 으로 남는다 (null 과 구분)", () => {
    const { data } = buildUnsoldChartData([makeItem("202608", { unsold_count: 0 }), makeItem("202609")], 24);
    expect(data[0].unsold).toBe(0);
  });

  it("준공후·증감의 빈 달도 null", () => {
    const { data } = buildUnsoldChartData(
      [makeItem("202608", { post_completion_unsold: 3, change: -1 }), makeItem("202609")],
      24,
    );
    expect(data[1].postCompletion).toBeNull();
    expect(data[1].change).toBeNull();
  });
});

describe("buildUnsoldChartData — 계열 표시 판정은 자른 기간 기준", () => {
  // 8개월: 가장 오래된 달(2025-01)에만 준공후·증감 값이 있고, 최근 6개월에는 없다
  function oldOnly(): MbUnsoldHistory[] {
    return months(8).map((m, i) =>
      makeItem(m, i === 0 ? { post_completion_unsold: 5, change: 2 } : {}),
    );
  }

  it("값이 기간 밖(오래된 달)에만 있으면 6개월 기간에서 계열 판정 false", () => {
    const r = buildUnsoldChartData(oldOnly(), 6);
    expect(r.data).toHaveLength(6);
    expect(r.hasPostCompletion).toBe(false);
    expect(r.hasChange).toBe(false);
  });

  it("같은 자료도 ALL 기간이면 판정 true", () => {
    const r = buildUnsoldChartData(oldOnly(), Infinity);
    expect(r.hasPostCompletion).toBe(true);
    expect(r.hasChange).toBe(true);
  });

  it("값이 기간 안에 있으면 6개월 기간에서 판정 true", () => {
    const items = months(8).map((m, i) =>
      makeItem(m, i === 7 ? { post_completion_unsold: 3, change: -2 } : {}),
    );
    const r = buildUnsoldChartData(items, 6);
    expect(r.hasPostCompletion).toBe(true);
    expect(r.hasChange).toBe(true);
  });

  it("화면: 오래된 달에만 값이 있으면 기본(2Y)에선 계열이 보이고 6M 을 누르면 사라진다", () => {
    const items = months(30).map((m, i) =>
      makeItem(m, i === 6 ? { post_completion_unsold: 5, change: 2 } : {}),
    );
    render(<MbUnsoldTrendChart items={items} />);
    expect(screen.getByTestId("series-postCompletion")).toBeInTheDocument();
    fireEvent.click(screen.getByText("6M"));
    expect(screen.queryByTestId("series-postCompletion")).toBeNull();
    expect(screen.queryByTestId("series-change")).toBeNull();
    expect(screen.getByTestId("series-unsold")).toBeInTheDocument();
  });
});
