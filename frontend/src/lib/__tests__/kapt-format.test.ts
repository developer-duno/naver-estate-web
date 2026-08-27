/**
 * kapt-format 순수 함수 단위 테스트 — 원(won)→만원 환산 경계와 기준월 파싱.
 * 실행: npx vitest run src/lib/__tests__/kapt-format.test.ts
 */
import { describe, it, expect } from "vitest";
import {
  formatCostMonth,
  formatCostPerHousehold,
  formatCostBreakdown,
} from "@/lib/kapt-format";

describe("formatCostMonth", () => {
  it("YYYYMM 을 'YYYY년 M월분' 으로 (월 앞 0 제거)", () => {
    expect(formatCostMonth("202603")).toBe("2026년 3월분");
    expect(formatCostMonth("202512")).toBe("2025년 12월분");
  });

  it("형식이 어긋나면 null (호출부가 기준월 표기를 생략)", () => {
    expect(formatCostMonth(null)).toBeNull();
    expect(formatCostMonth("")).toBeNull();
    expect(formatCostMonth("2026")).toBeNull();
    expect(formatCostMonth("2026-03")).toBeNull();
    expect(formatCostMonth("202613")).toBeNull(); // 13월
    expect(formatCostMonth("202600")).toBeNull(); // 0월
  });
});

describe("formatCostPerHousehold", () => {
  it("원 단위를 만원으로 환산해 '세대당 약 N만원 (기준월)' 로 표시", () => {
    expect(formatCostPerHousehold(240_000, "202603")).toBe("세대당 약 24만원 (2026년 3월분)");
  });

  it("10만원 이상은 반올림 정수, 10만원 미만은 소수 1자리 유지", () => {
    expect(formatCostPerHousehold(126_400, "202603")).toBe("세대당 약 13만원 (2026년 3월분)");
    expect(formatCostPerHousehold(85_000, "202603")).toBe("세대당 약 8.5만원 (2026년 3월분)");
  });

  it("기준월이 없거나 형식이 어긋나면 금액만 표시", () => {
    expect(formatCostPerHousehold(240_000, null)).toBe("세대당 약 24만원");
  });

  it("값이 없거나 0 이하면 null (호출부가 행 자체를 생략)", () => {
    expect(formatCostPerHousehold(null, "202603")).toBeNull();
    expect(formatCostPerHousehold(undefined, "202603")).toBeNull();
    expect(formatCostPerHousehold(0, "202603")).toBeNull();
  });
});

describe("formatCostBreakdown", () => {
  it("있는 항목만 ' · ' 로 이어 붙인다", () => {
    expect(
      formatCostBreakdown({
        total_cost: 120_000_000,
        common_cost: 80_000_000,
        individual_cost: 40_000_000,
      }),
    ).toBe("총 12,000만원 · 공용 8,000만원 · 개별 4,000만원");
  });

  it("일부만 있으면 그것만 표시", () => {
    expect(formatCostBreakdown({ total_cost: 120_000_000 })).toBe("총 12,000만원");
  });

  it("전부 없거나 0 이면 null", () => {
    expect(formatCostBreakdown({})).toBeNull();
    expect(
      formatCostBreakdown({ total_cost: 0, common_cost: null, individual_cost: null }),
    ).toBeNull();
  });
});
