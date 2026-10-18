/**
 * 미분양 비교 유틸리티 테스트 — 행 정의 + 셀 포맷 (세션 472: 우위 ★ 판정 삭제)
 * 실행: npx vitest run src/lib/__tests__/mb-compare-utils.test.ts
 */
import { describe, it, expect } from "vitest";
import { formatCellValue, MB_COMPARE_ROWS } from "../mb-compare-utils";
import * as mbCompareUtils from "../mb-compare-utils";
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
    noise: 55,
    ...overrides,
  };
}

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
  /** 17개 비교 행이 정의됨 — 네이버 주변 중위가·전세가율 2행은 뺐다(세션 471) */
  it("17개 비교 행이 정의되어 있고 네이버 구 단위 2행이 없다", () => {
    expect(MB_COMPARE_ROWS).toHaveLength(17);
    const labels = MB_COMPARE_ROWS.map((r) => r.label);
    expect(labels).not.toContain("주변 중위가(만원)");
    expect(labels).not.toContain("전세가율(%)");
  });

  /** 소음도(dB) 대신 큰 도로 거리 구간 글 — 상세 화면과 같은 basis-text 함수(세션 472) */
  it("소음 행은 dB 가 아니라 큰 도로 거리(추정) 구간 글이다", () => {
    const labels = MB_COMPARE_ROWS.map((r) => r.label);
    expect(labels).not.toContain("소음도(dB)");
    const row = MB_COMPARE_ROWS.find((r) => r.label === "큰 도로 거리(추정)");
    expect(row).toBeDefined();
    expect(row?.getValue(makeApt({ noise: 70 }))).toBe("50m 이내");
    expect(row?.getValue(makeApt({ noise: 60 }))).toBe("50~100m");
    expect(row?.getValue(makeApt({ noise: 50 }))).toBe("100~200m");
    expect(row?.getValue(makeApt({ noise: 40 }))).toBe("200m 넘음");
    // 구간 밖(55)·빈 값은 null → 셀은 "-"
    expect(formatCellValue(row?.getValue(makeApt({ noise: 55 })))).toBe("-");
    expect(formatCellValue(row?.getValue(makeApt({ noise: undefined })))).toBe("-");
  });

  /** 6개월 취소율 행이 포함되어 있다 */
  it("6개월 취소율 행이 포함되어 있다", () => {
    const row = MB_COMPARE_ROWS.find((r) => r.label === "6개월 취소율(%)");
    expect(row).toBeDefined();
  });

  /** 평당가 0(미공개) → null 정규화 → 셀 "-" (세션 300) */
  it("평당가 행은 presale_pp=0(미공개)을 null 로 정규화한다", () => {
    const row = MB_COMPARE_ROWS.find((r) => r.label === "평당가(만원)");
    expect(row).toBeDefined();
    expect(row?.getValue(makeApt({ presale_pp: 2000 }))).toBe(2000);
    expect(row?.getValue(makeApt({ presale_pp: 0 }))).toBeNull(); // 0 → null
    expect(row?.getValue(makeApt({ presale_pp: undefined }))).toBeNull();
  });

  /** 범죄 점수 행은 없다(상세에서도 지움 — 지역안전지수는 PR 4) */
  it("범죄·치안 점수 행이 없다", () => {
    for (const row of MB_COMPARE_ROWS) {
      expect(row.label).not.toMatch(/범죄|치안/);
    }
  });

  /** 모든 행이 MbApartment에서 값을 추출할 수 있다 */
  it("모든 행이 MbApartment에서 값을 추출할 수 있다", () => {
    const apt = makeApt();
    for (const row of MB_COMPARE_ROWS) {
      expect(() => row.getValue(apt)).not.toThrow();
    }
  });

  /** 단지 간 우위(★) 판정이 없다 — 행에 방향 칸도, 우위 계산 함수도 남지 않는다(세션 472 PR 3) */
  it("우위 판정 방향·함수가 없다", () => {
    for (const row of MB_COMPARE_ROWS) {
      expect(row).not.toHaveProperty("direction");
    }
    expect(mbCompareUtils).not.toHaveProperty("getBestIndices");
  });
});
