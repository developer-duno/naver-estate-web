/**
 * 미분양 비교 유틸리티 테스트 — 우위 판정 + 셀 포맷
 * 실행: npx vitest run src/lib/__tests__/mb-compare-utils.test.ts
 */
import { describe, it, expect } from "vitest";
import { getBestIndices, formatCellValue, MB_COMPARE_ROWS } from "../mb-compare-utils";
import type { MbApartment } from "@/types";

function makeApt(overrides: Partial<MbApartment> = {}): MbApartment {
  return {
    id: "A1",
    name: "테스트단지",
    region: "서울",
    gu: "강남구",
    units: 500,
    unsold: 10,
    unsold_rate: 2.0,
    presale_min_price: 50000,
    presale_max_price: 80000,
    presale_pp: 3000,
    parking_ratio: 120,
    max_floor: 30,
    floor_area_ratio: 250,
    heating: "지역난방",
    builder: "삼성물산",
    discount_pct: 5,
    naver_nearby_median: 90000,
    naver_jeonse_rate: 65,
    ...overrides,
  };
}

describe("getBestIndices (우위 판정)", () => {
  /** "higher" 방향: 가장 큰 값의 인덱스 */
  it("higher 방향에서 최대값 인덱스를 반환한다", () => {
    expect(getBestIndices([100, 200, 150], "higher")).toEqual([1]);
  });

  /** "lower" 방향: 가장 작은 값의 인덱스 */
  it("lower 방향에서 최소값 인덱스를 반환한다", () => {
    expect(getBestIndices([100, 50, 150], "lower")).toEqual([1]);
  });

  /** 동점: 여러 인덱스 반환 */
  it("동점이면 모든 해당 인덱스를 반환한다", () => {
    expect(getBestIndices([100, 100, 50], "higher")).toEqual([0, 1]);
  });

  /** null 값은 무시 */
  it("null 값을 무시하고 유효한 값만 비교한다", () => {
    expect(getBestIndices([null, 200, 100], "higher")).toEqual([1]);
  });

  /** 모든 값이 null이면 빈 배열 */
  it("모든 값이 null이면 빈 배열을 반환한다", () => {
    expect(getBestIndices([null, null], "higher")).toEqual([]);
  });

  /** direction이 null이면 빈 배열 (텍스트 행) */
  it("direction이 null이면 빈 배열을 반환한다", () => {
    expect(getBestIndices([100, 200], null)).toEqual([]);
  });
});

describe("formatCellValue (셀 포맷)", () => {
  it("숫자를 천단위 구분 포맷으로 반환한다", () => {
    expect(formatCellValue(12345)).toBe("12,345");
  });

  it("문자열은 그대로 반환한다", () => {
    expect(formatCellValue("서울")).toBe("서울");
  });

  it("null/undefined는 '-' 반환", () => {
    expect(formatCellValue(null)).toBe("-");
    expect(formatCellValue(undefined)).toBe("-");
  });

  it("빈 문자열은 '-' 반환", () => {
    expect(formatCellValue("")).toBe("-");
  });
});

describe("MB_COMPARE_ROWS (비교 행 정의)", () => {
  /** 17개 비교 행이 정의됨 */
  it("17개 비교 행이 정의되어 있다", () => {
    expect(MB_COMPARE_ROWS).toHaveLength(17);
  });

  /** 모든 행이 MbApartment에서 값을 추출할 수 있다 */
  it("모든 행이 MbApartment에서 값을 추출할 수 있다", () => {
    const apt = makeApt();
    for (const row of MB_COMPARE_ROWS) {
      expect(() => row.getValue(apt)).not.toThrow();
    }
  });

  /** 각 행의 direction이 유효하다 */
  it("각 행의 direction이 'higher', 'lower', 또는 null이다", () => {
    for (const row of MB_COMPARE_ROWS) {
      expect([null, "higher", "lower"]).toContain(row.direction);
    }
  });
});
