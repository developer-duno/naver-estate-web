/**
 * MbUnsoldTrendChart 오른쪽(증감) 눈금 시험 — 눈금 따로 · 0 가운데 대칭 · 0 기준선 · 부호 글자 (세션 523 · B33)
 * 실행: npx vitest run src/components/mb/__tests__/MbUnsoldTrendChart.axis.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import MbUnsoldTrendChart, { buildUnsoldChartData } from "../MbUnsoldTrendChart";
import type { MbUnsoldHistory } from "@/types";

// 툴팁·오른쪽 눈금의 글자 함수를 꺼내 보려고 가짜가 받아 둔다
const captured = vi.hoisted(() => ({
  tooltip: null as null | ((value: unknown, name: unknown) => unknown),
  rightTick: null as null | ((v: number) => string),
}));

// Recharts 는 jsdom 에서 폭 0 이라 그려지지 않는다 → 어느 계열을 어느 눈금에, 눈금 범위를 얼마로 줬는지 찍는 얇은 가짜
vi.mock("recharts", () => ({
  ComposedChart: ({ children }: { children: React.ReactNode }) => <div data-testid="composed-chart">{children}</div>,
  Line: ({ dataKey, yAxisId }: { dataKey: string; yAxisId?: string }) => (
    <div data-testid={`series-${dataKey}`} data-axis={yAxisId} />
  ),
  Bar: ({ dataKey, yAxisId }: { dataKey: string; yAxisId?: string }) => (
    <div data-testid={`series-${dataKey}`} data-axis={yAxisId} />
  ),
  XAxis: () => null,
  YAxis: ({ yAxisId, orientation, domain, ticks, tickFormatter }: {
    yAxisId?: string; orientation?: string; domain?: unknown; ticks?: unknown; tickFormatter?: (v: number) => string;
  }) => {
    if (orientation === "right") captured.rightTick = tickFormatter ?? null;
    return (
      <div data-testid={`yaxis-${yAxisId}`} data-orientation={orientation ?? "left"}
        data-domain={JSON.stringify(domain ?? null)} data-ticks={JSON.stringify(ticks ?? null)} />
    );
  },
  ReferenceLine: ({ yAxisId, y }: { yAxisId?: string; y?: number }) => (
    <div data-testid="reference-line" data-axis={yAxisId} data-y={String(y)} />
  ),
  CartesianGrid: () => null,
  Tooltip: ({ formatter }: { formatter?: (value: unknown, name: unknown) => unknown }) => {
    captured.tooltip = formatter ?? null;
    return null;
  },
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

// 증감 0 · −4 · −21 (미분양 242 → 242 → 238 → 217) — 미분양 수와 증감이 다른 숫자가 되게
const MIXED = [
  makeItem("202601", { unsold_count: 242 }),
  makeItem("202602", { unsold_count: 242 }),
  makeItem("202603", { unsold_count: 238 }),
  makeItem("202604", { unsold_count: 217 }),
];

describe("MbUnsoldTrendChart — 오른쪽 눈금 따로 · 부호 글자", () => {
  it("증감 막대는 오른쪽 눈금(orientation=right), 미분양·준공후 선은 왼쪽 눈금", () => {
    render(
      <MbUnsoldTrendChart
        items={[
          makeItem("202608", { unsold_count: 140, post_completion_unsold: 4 }),
          makeItem("202609", { unsold_count: 136, post_completion_unsold: 5 }),
        ]}
      />,
    );
    expect(screen.getByTestId("yaxis-right")).toHaveAttribute("data-orientation", "right");
    expect(screen.getByTestId("yaxis-left")).toHaveAttribute("data-orientation", "left");
    expect(screen.getByTestId("series-change")).toHaveAttribute("data-axis", "right");
    expect(screen.getByTestId("series-unsold")).toHaveAttribute("data-axis", "left");
    expect(screen.getByTestId("series-postCompletion")).toHaveAttribute("data-axis", "left");
  });

  it("툴팁: 증감은 부호를 붙이고(증감 −4), 미분양은 지금처럼 쉼표 숫자 · 오른쪽 눈금도 부호", () => {
    Object.assign(captured, { tooltip: null, rightTick: null });
    render(
      <MbUnsoldTrendChart
        items={[makeItem("202608", { unsold_count: 1400 }), makeItem("202609", { unsold_count: 1396 })]}
      />,
    );
    expect(captured.tooltip?.(-4, "change")).toEqual(["−4", "증감"]);
    expect(captured.tooltip?.(1396, "unsold")).toEqual(["1,396", "미분양"]);
    expect(captured.rightTick?.(5)).toBe("+5");
    expect(captured.rightTick?.(-5)).toBe("−5");
  });
});

describe("오른쪽 눈금 — 0 이 가운데 · 위아래 대칭 (그림 ②)", () => {
  it("changeMax = 보이는 기간 증감 절댓값 최댓값: 0 · −4 · −21 → 21", () => {
    expect(buildUnsoldChartData(MIXED, 24).changeMax).toBe(21);
  });

  it("증감이 전부 0 이면 1 (범위 [−1, 1])", () => {
    const r = buildUnsoldChartData([makeItem("202608", { unsold_count: 131 }), makeItem("202609", { unsold_count: 131 })], 24);
    expect(r.changeMax).toBe(1);
  });

  it("증감 값이 하나도 없으면 1", () => {
    const r = buildUnsoldChartData([makeItem("202603", { unsold_count: 128 }), makeItem("202605", { unsold_count: 120 })], 24);
    expect(r.changeMax).toBe(1);
  });

  it("화면: 오른쪽 눈금 범위 [−21, 21] · 눈금 −21 · 0 · +21", () => {
    render(<MbUnsoldTrendChart items={MIXED} />);
    const right = screen.getByTestId("yaxis-right");
    expect(JSON.parse(right.getAttribute("data-domain") ?? "null")).toEqual([-21, 21]);
    expect(JSON.parse(right.getAttribute("data-ticks") ?? "null")).toEqual([-21, 0, 21]);
  });

  it("0 기준선: 증감 계열이 있으면 오른쪽 눈금 y=0 에 1개", () => {
    render(<MbUnsoldTrendChart items={MIXED} />);
    const lines = screen.getAllByTestId("reference-line");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveAttribute("data-axis", "right");
    expect(lines[0]).toHaveAttribute("data-y", "0");
  });

  it("0 기준선: 증감 계열이 없으면(한 달 건너뛴 두 건) 그리지 않는다", () => {
    render(
      <MbUnsoldTrendChart
        items={[makeItem("202603", { unsold_count: 128 }), makeItem("202605", { unsold_count: 120 })]}
      />,
    );
    expect(screen.queryByTestId("series-change")).toBeNull();
    expect(screen.queryByTestId("reference-line")).toBeNull();
  });
});
