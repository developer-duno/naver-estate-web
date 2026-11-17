/**
 * buildUnsoldChartData 증감 계산 시험 — change 칸이 비면 달력상 바로 앞 달과의 차이 (세션 523 · B33)
 * 화면 쪽(오른쪽 눈금·툴팁 부호)은 MbUnsoldTrendChart.test.tsx 에 있다.
 * 실행: npx vitest run src/components/mb/__tests__/MbUnsoldTrendChart.change.test.ts
 */
import { describe, it, expect } from "vitest";
import { buildUnsoldChartData, formatSignedCount } from "../MbUnsoldTrendChart";
import type { MbUnsoldHistory } from "@/types";

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

// 월 목록 만들기 — 2025-01 부터 n 개
function months(n: number): string[] {
  return Array.from({ length: n }, (_, i) => {
    const y = 2025 + Math.floor(i / 12);
    const m = (i % 12) + 1;
    return `${y}${String(m).padStart(2, "0")}`;
  });
}

describe("buildUnsoldChartData — 증감 계산 (세션 523 · B33)", () => {
  it("change 칸이 비면 바로 앞 달 미분양 수와의 차이: 140 → 136 = −4, 첫 달은 null", () => {
    const { data } = buildUnsoldChartData(
      [makeItem("202608", { unsold_count: 140 }), makeItem("202609", { unsold_count: 136 })],
      24,
    );
    expect(data.map((d) => d.change)).toEqual([null, -4]);
  });

  it("change 값이 있으면 계산보다 그 값을 먼저 쓴다", () => {
    const { data } = buildUnsoldChartData(
      [makeItem("202608", { unsold_count: 140 }), makeItem("202609", { unsold_count: 136, change: 7 })],
      24,
    );
    expect(data[1].change).toBe(7);
  });

  it("앞 달 자료가 없는 달(빠진 달 바로 뒤)은 null — 배열상 앞 칸과 계산하지 않는다", () => {
    const { data } = buildUnsoldChartData(
      [makeItem("202603", { unsold_count: 128 }), makeItem("202605", { unsold_count: 120 })],
      24,
    );
    expect(data.map((d) => d.change)).toEqual([null, null]);
  });

  it("12월 → 이듬해 1월은 연속이다: 50 → 47 = −3", () => {
    const { data } = buildUnsoldChartData(
      [makeItem("202701", { unsold_count: 47 }), makeItem("202612", { unsold_count: 50 })],
      24,
    );
    expect(data.map((d) => d.change)).toEqual([null, -3]);
  });

  it("앞 달 미분양 수가 null 이면 null", () => {
    const { data } = buildUnsoldChartData(
      [makeItem("202608", { unsold_count: null }), makeItem("202609", { unsold_count: 136 })],
      24,
    );
    expect(data[1].change).toBeNull();
  });

  it("진짜 증감 0 은 0 (131 → 131) — null 과 구분", () => {
    const { data } = buildUnsoldChartData(
      [makeItem("202608", { unsold_count: 131 }), makeItem("202609", { unsold_count: 131 })],
      24,
    );
    expect(data[1].change).toBe(0);
    expect(data[1].change).not.toBeNull();
  });

  it("자르기 전 전체 목록으로 계산 — 13개월 · 6M 이어도 보이는 첫 달에 증감이 있다", () => {
    // 미분양 수 200, 197, 194 … (달마다 −3) — 미분양 수와 증감이 다른 숫자가 되게
    const items = months(13).map((m, i) => makeItem(m, { unsold_count: 200 - i * 3 }));
    const r = buildUnsoldChartData(items, 6);
    expect(r.data).toHaveLength(6);
    expect(r.data[0].unsold).toBe(200 - 7 * 3);
    expect(r.data[0].change).toBe(-3);
    expect(r.hasChange).toBe(true);
  });

  it("계열 표시 판정은 계산 뒤 값 기준 — 연속 두 달이면 true, 한 달 건너뛰면 false", () => {
    const consecutive = buildUnsoldChartData(
      [makeItem("202608", { unsold_count: 140 }), makeItem("202609", { unsold_count: 136 })],
      24,
    );
    expect(consecutive.hasChange).toBe(true);
    const gap = buildUnsoldChartData(
      [makeItem("202603", { unsold_count: 128 }), makeItem("202605", { unsold_count: 120 })],
      24,
    );
    expect(gap.hasChange).toBe(false);
  });
});

describe("formatSignedCount — 증감 글자에 부호", () => {
  it("+3 · −5 · 0 · +1,234", () => {
    expect(formatSignedCount(3)).toBe("+3");
    expect(formatSignedCount(-5)).toBe("−5");
    expect(formatSignedCount(0)).toBe("0");
    expect(formatSignedCount(1234)).toBe("+1,234");
  });
});
