/**
 * compare-utils 우위 판정 로직 테스트
 * 실행: npx vitest run src/lib/__tests__/compare-utils.test.ts
 */
import { describe, it, expect } from "vitest";
import {
  getBestIndices,
  parseApprovalDate,
  getAdvantageForRow,
  ADVANTAGE_ROWS,
} from "../compare-utils";
import type { Complex } from "@/types";

/** 테스트용 단지 팩토리 */
function makeComplex(overrides: Partial<Complex> = {}): Complex {
  return {
    complex_no: "100001",
    complex_name: "테스트 단지",
    ...overrides,
  };
}

describe("getBestIndices", () => {
  it("정상: 4개 값 중 최대 인덱스 반환 (higher)", () => {
    expect(getBestIndices([70, 90, 80, 60], "higher")).toEqual([1]);
  });

  it("정상: 최소값 인덱스 반환 (lower)", () => {
    expect(getBestIndices([70, 90, 50, 60], "lower")).toEqual([2]);
  });

  it("동점: 여러 인덱스 반환", () => {
    expect(getBestIndices([90, 90, 80, 70], "higher")).toEqual([0, 1]);
  });

  it("null 포함: null 무시하고 유효값에서 최대", () => {
    expect(getBestIndices([null, 90, null, 80], "higher")).toEqual([1]);
  });

  it("null 포함 (lower): null 무시하고 최소", () => {
    expect(getBestIndices([null, 30, null, 50], "lower")).toEqual([1]);
  });

  it("전체 null: 빈 배열 반환", () => {
    expect(getBestIndices([null, null, null], "higher")).toEqual([]);
  });

  it("빈 배열: 빈 배열 반환", () => {
    expect(getBestIndices([], "higher")).toEqual([]);
  });

  it("단일 값: 해당 인덱스 반환", () => {
    expect(getBestIndices([42], "higher")).toEqual([0]);
  });

  it("모두 동점: 모든 인덱스 반환", () => {
    expect(getBestIndices([100, 100, 100], "higher")).toEqual([0, 1, 2]);
  });
});

describe("parseApprovalDate", () => {
  it("YYYYMMDD 형식 파싱", () => {
    expect(parseApprovalDate("20200315")).toBe(20200315);
  });

  it("YYYYMM 형식 파싱", () => {
    expect(parseApprovalDate("202003")).toBe(202003);
  });

  it("undefined → null", () => {
    expect(parseApprovalDate(undefined)).toBeNull();
  });

  it("빈 문자열 → null", () => {
    expect(parseApprovalDate("")).toBeNull();
  });

  it("숫자 아닌 값 → null", () => {
    expect(parseApprovalDate("abcdef")).toBeNull();
  });
});

describe("getAdvantageForRow", () => {
  it("세대수 우위 판정: 가장 많은 단지", () => {
    const complexes = [
      makeComplex({ total_household_count: 1200, complex_name: "A" }),
      makeComplex({ total_household_count: 800, complex_name: "B" }),
      makeComplex({ total_household_count: 2000, complex_name: "C" }),
    ];
    expect(getAdvantageForRow("세대수", complexes)).toEqual([2]);
  });

  it("용적률 우위 판정: 낮을수록 우위", () => {
    const complexes = [
      makeComplex({ floor_area_ratio: "250", complex_name: "A" }),
      makeComplex({ floor_area_ratio: "180", complex_name: "B" }),
    ];
    expect(getAdvantageForRow("용적률", complexes)).toEqual([1]);
  });

  it("ADVANTAGE_ROWS에 없는 라벨: 빈 배열", () => {
    const complexes = [makeComplex()];
    expect(getAdvantageForRow("주소", complexes)).toEqual([]);
  });

  it("ADVANTAGE_ROWS 개수 확인", () => {
    expect(ADVANTAGE_ROWS.length).toBe(14);
  });
});
