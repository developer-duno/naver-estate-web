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
    parking_ratio: 1.2,
    max_floor: 30,
    floor_area_ratio: 250,
    heating: "지역난방",
    builder: "삼성물산",
    discount_pct: 5,
    naver_nearby_median: 90000,
    naver_jeonse_rate: 65,
    noise: 55,
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

  it("0은 '0'을 반환한다 (falsy이지만 유효한 데이터)", () => {
    expect(formatCellValue(0)).toBe("0");
  });

  it("음수는 천단위 구분 포맷으로 반환한다", () => {
    expect(formatCellValue(-1234)).toBe("-1,234");
  });

  it("소수는 그대로 반환한다", () => {
    expect(formatCellValue(0.5)).toBe("0.5");
  });

  it("문자열 '0'은 그대로 반환한다", () => {
    expect(formatCellValue("0")).toBe("0");
  });
});

describe("MB_COMPARE_ROWS (비교 행 정의)", () => {
  /** 19개 비교 행이 정의됨 */
  it("19개 비교 행이 정의되어 있다", () => {
    expect(MB_COMPARE_ROWS).toHaveLength(19);
  });

  /** 소음도 행이 포함되어 있고 direction이 "lower" */
  it("소음도 행이 포함되어 있고 lower direction", () => {
    const row = MB_COMPARE_ROWS.find((r) => r.label === "소음도(dB)");
    expect(row).toBeDefined();
    expect(row?.direction).toBe("lower");
    expect(row?.getValue(makeApt({ noise: 55 }))).toBe(55);
  });

  /** 6개월 취소율 행이 포함되어 있고 direction이 "lower" */
  it("6개월 취소율 행이 포함되어 있고 lower direction", () => {
    const row = MB_COMPARE_ROWS.find((r) => r.label === "6개월 취소율(%)");
    expect(row).toBeDefined();
    expect(row?.direction).toBe("lower");
  });

  /** 평당가 0(미공개) → null 정규화 → 우위(★)·셀에서 제외 (세션 300) */
  it("평당가 행은 presale_pp=0(미공개)을 null 로 정규화한다", () => {
    const row = MB_COMPARE_ROWS.find((r) => r.label === "평당가(만원)");
    expect(row).toBeDefined();
    expect(row?.direction).toBe("lower");
    expect(row?.getValue(makeApt({ presale_pp: 2000 }))).toBe(2000);
    expect(row?.getValue(makeApt({ presale_pp: 0 }))).toBeNull(); // 0 → null
    expect(row?.getValue(makeApt({ presale_pp: undefined }))).toBeNull();
  });

  /** 평당가 0 단지는 ★최저 우위 후보에서 제외 (0 이 거짓 최저로 ★ 받던 결함 차단) */
  it("평당가 0(미공개) 단지는 lower 우위에서 제외된다", () => {
    const row = MB_COMPARE_ROWS.find((r) => r.label === "평당가(만원)")!;
    const apts = [
      makeApt({ presale_pp: 3000 }),
      makeApt({ presale_pp: 0 }), // 미공개 — 0 이 최저로 ★ 받으면 안 됨
      makeApt({ presale_pp: 1500 }),
    ];
    // 평당가 행 getValue 는 number | null 반환 (MbCompareRow 타입은 string 도 허용하나 pp 는 숫자)
    const values = apts.map((a) => row.getValue(a) as number | null);
    // 0 은 null 로 제외 → 실제 최저는 index 2 (1500)
    expect(getBestIndices(values, "lower")).toEqual([2]);
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
