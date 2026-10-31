/**
 * 그래프 거래 점 기술 확인(세션 479 B29 설계 §2-5 ① · 세션 489 PR b2 D0) — 진짜 Recharts(가짜로 바꾸지 않음)로
 * 범주 축(달) ComposedChart 안 <Scatter data> 가 같은 달에 여러 점을 찍는지 본다.
 * 실측: XAxis 의 allowDuplicatedCategory 기본값(true)이면 Scatter 의 점마다 범주가 새로 생겨 점이 순서대로 흩어진다
 * → PriceHistoryChart 는 allowDuplicatedCategory={false} 로 같은 달 점을 한 x 에 모은다.
 * 실행: npx vitest run src/components/__tests__/PriceHistoryChart.scatter.test.tsx
 */
import { cloneElement, type ReactElement } from "react";
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { ComposedChart, Line, Scatter, XAxis, YAxis } from "recharts";
import PriceHistoryChart from "../PriceHistoryChart";
import type { PriceHistoryItem } from "@/types";

// jsdom 은 크기가 0 이라 ResponsiveContainer 가 아무것도 안 그린다 — 그것만 고정 크기로 바꾸고 나머지는 진짜 Recharts
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactElement<{ width?: number; height?: number }> }) =>
      cloneElement(children, { width: 600, height: 320 }),
  };
});

const rows = [
  { month: "26.05", 상한: 18000 },
  { month: "26.06", 상한: 17200 },
];
const points = [
  { month: "26.05", 거래: 18000 },
  { month: "26.06", 거래: 15700 },
  { month: "26.06", 거래: 17200 },
  { month: "26.06", 거래: 16000 },
];

function dotXs(allowDuplicatedCategory: boolean): number[] {
  const { container, unmount } = render(
    <ComposedChart width={600} height={300} data={rows}>
      <XAxis dataKey="month" allowDuplicatedCategory={allowDuplicatedCategory} />
      <YAxis />
      <Line dataKey="상한" isAnimationActive={false} />
      <Scatter data={points} dataKey="거래" isAnimationActive={false} />
    </ComposedChart>,
  );
  const xs = Array.from(container.querySelectorAll(".recharts-scatter-symbol path")).map((d) => Number(d.getAttribute("cx")));
  unmount();
  return xs;
}

describe("Recharts 범주 축 + Scatter (D0)", () => {
  it("allowDuplicatedCategory={false} — 한 달 3건이 같은 x 에 점 3개, 다른 달과는 x 가 다르다", () => {
    const xs = dotXs(false);
    expect(xs).toHaveLength(4);
    expect(new Set(xs.slice(1)).size).toBe(1);
    expect(xs[0]).not.toBe(xs[1]);
  });

  it("기본값(true)이면 점이 순서대로 흩어진다 — 위 설정이 필요한 이유", () => {
    const xs = dotXs(true);
    expect(new Set(xs).size).toBe(4);
  });
});

describe("PriceHistoryChart 진짜 Recharts 렌더 (D0 — 실제 컴포넌트)", () => {
  const item = (o: Partial<PriceHistoryItem>): PriceHistoryItem => ({
    trade_type: "A1", trade_type_label: "매매", price_upper: null, price_lower: null, price_avg: null,
    base_month: "202606", series: "정부 실거래", ...o,
  });

  it("202606 두 건은 같은 x · 202605 한 건은 다른 x · 굵은 중위 선(빨강 2px) 없음", () => {
    const { container } = render(
      <PriceHistoryChart
        items={[
          item({ base_month: "202605", price_avg: 18000, range_lower: 18000, range_upper: 18000,
            trades: [{ price: 18000, date: "2026-05-05", floor: 7, direct: false }] }),
          item({ base_month: "202606", price_avg: 16450, range_lower: 15700, range_upper: 17200,
            trades: [{ price: 15700, date: "2026-06-26", floor: 4, direct: false }, { price: 17200, date: "2026-06-05", floor: 8, direct: false }] }),
        ]}
      />,
    );
    const xs = Array.from(container.querySelectorAll(".recharts-scatter-symbol path")).map((d) => Number(d.getAttribute("cx")));
    expect(xs).toHaveLength(3);
    expect(xs[1]).toBe(xs[2]);
    expect(xs[0]).not.toBe(xs[1]);
    const thickRed = Array.from(container.querySelectorAll("path.recharts-line-curve"))
      .filter((el) => el.getAttribute("stroke") === "#ef4444" && el.getAttribute("stroke-width") === "2");
    expect(thickRed).toHaveLength(0);
  });
});
