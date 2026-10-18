/**
 * compare-utils 테스트 — 평당가 계산 (세션 472 PR 3: 우위 ★ 판정 함수는 지웠다)
 * 실행: npx vitest run src/lib/__tests__/compare-utils.test.ts
 */
import { describe, it, expect } from "vitest";
import { calcAvgPricePerPyeong } from "../compare-utils";
import * as compareUtils from "../compare-utils";
import type { PriceStats } from "@/types";

describe("우위 판정 없음 (세션 472)", () => {
  it("우위 행 목록·우위 계산 함수가 남아 있지 않다", () => {
    expect(compareUtils).not.toHaveProperty("ADVANTAGE_ROWS");
    expect(compareUtils).not.toHaveProperty("getBestIndices");
    expect(compareUtils).not.toHaveProperty("getAdvantageForRow");
  });
});

/** 테스트용 PriceStats 팩토리 */
function makeStats(
  byArea: { label: string; maemae?: number; maemae_count?: number }[],
): PriceStats {
  return {
    complex_no: "100001",
    total_articles: 10,
    by_area: byArea.map((a) => ({ ...a })),
    by_floor: [],
  };
}

describe("calcAvgPricePerPyeong", () => {
  it("정상: 면적별 매매 데이터 → 가중 평균 평당가 반환", () => {
    // 85m² = 약 25.71평, 매매 50000만원 → 평당가 ≈ 1945만
    const stats = makeStats([
      { label: "85m²", maemae: 50000, maemae_count: 3 },
      { label: "60m²", maemae: 35000, maemae_count: 2 },
    ]);
    const result = calcAvgPricePerPyeong(stats);
    expect(result).not.toBeNull();
    expect(result).toBeGreaterThan(1500);
    expect(result).toBeLessThan(2500);
  });

  it("label 파싱 실패 → null 반환", () => {
    const stats = makeStats([
      { label: "N/A", maemae: 50000, maemae_count: 3 },
    ]);
    expect(calcAvgPricePerPyeong(stats)).toBeNull();
  });

  it("빈 by_area → null 반환", () => {
    const stats = makeStats([]);
    expect(calcAvgPricePerPyeong(stats)).toBeNull();
  });
});
