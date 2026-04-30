import { describe, it, expect } from "vitest";
import type { Complex } from "@/types";
import { sortComplexes } from "../sortComplexes";

function makeComplex(overrides: Partial<Complex> = {}): Complex {
  return {
    complex_no: "1",
    complex_name: "테스트단지",
    real_estate_type_code: "APT",
    real_estate_type_name: "아파트",
    cortar_address: "서울 강남구",
    total_household_count: 100,
    total_dong_count: 5,
    high_floor: 20,
    low_floor: 1,
    use_approve_ymd: "20100101",
    article_count: 0,
    ...overrides,
  } as Complex;
}

describe("sortComplexes", () => {
  // 기본순: 입력 순서를 그대로 유지하는지 검증
  it("default 정렬 — 입력 순서 그대로 반환", () => {
    const list = [
      makeComplex({ complex_no: "1", complex_name: "가나" }),
      makeComplex({ complex_no: "2", complex_name: "다라" }),
      makeComplex({ complex_no: "3", complex_name: "마바" }),
    ];
    const sorted = sortComplexes(list, "default");
    expect(sorted.map((c) => c.complex_no)).toEqual(["1", "2", "3"]);
  });

  // 단지명 역순: 가나다 역방향으로 정렬되는지 검증
  it("name_desc — 단지명 가나다 역순", () => {
    const list = [
      makeComplex({ complex_no: "1", complex_name: "가나" }),
      makeComplex({ complex_no: "2", complex_name: "다라" }),
      makeComplex({ complex_no: "3", complex_name: "마바" }),
    ];
    const sorted = sortComplexes(list, "name_desc");
    expect(sorted.map((c) => c.complex_name)).toEqual(["마바", "다라", "가나"]);
  });

  // 세대수 큰 단지 먼저
  it("household_desc — 세대수 큰 단지 먼저", () => {
    const list = [
      makeComplex({ complex_no: "1", total_household_count: 100 }),
      makeComplex({ complex_no: "2", total_household_count: 500 }),
      makeComplex({ complex_no: "3", total_household_count: 300 }),
    ];
    const sorted = sortComplexes(list, "household_desc");
    expect(sorted.map((c) => c.complex_no)).toEqual(["2", "3", "1"]);
  });

  // 세대수 작은 단지 먼저
  it("household_asc — 세대수 작은 단지 먼저", () => {
    const list = [
      makeComplex({ complex_no: "1", total_household_count: 100 }),
      makeComplex({ complex_no: "2", total_household_count: 500 }),
      makeComplex({ complex_no: "3", total_household_count: 300 }),
    ];
    const sorted = sortComplexes(list, "household_asc");
    expect(sorted.map((c) => c.complex_no)).toEqual(["1", "3", "2"]);
  });

  // 신축순: use_approve_ymd 큰 값 먼저
  it("year_desc — 신축(준공년월 큰 값) 먼저", () => {
    const list = [
      makeComplex({ complex_no: "1", use_approve_ymd: "20100501" }),
      makeComplex({ complex_no: "2", use_approve_ymd: "20230301" }),
      makeComplex({ complex_no: "3", use_approve_ymd: "20180101" }),
    ];
    const sorted = sortComplexes(list, "year_desc");
    expect(sorted.map((c) => c.complex_no)).toEqual(["2", "3", "1"]);
  });

  // 매물 많은 순
  it("article_desc — 매물수 큰 단지 먼저, 0건 단지 마지막", () => {
    const list = [
      makeComplex({ complex_no: "1", article_count: 5 }),
      makeComplex({ complex_no: "2", article_count: 0 }),
      makeComplex({ complex_no: "3", article_count: 30 }),
    ];
    const sorted = sortComplexes(list, "article_desc");
    expect(sorted.map((c) => c.complex_no)).toEqual(["3", "1", "2"]);
  });

  // null/undefined 안전성: 누락 필드를 0/빈문자열로 취급
  it("null/undefined 입력 안전성 — 누락 필드는 0/빈값 취급", () => {
    const list = [
      makeComplex({ complex_no: "1", total_household_count: 100 }),
      makeComplex({ complex_no: "2", total_household_count: undefined }),
      makeComplex({ complex_no: "3", total_household_count: 50 }),
    ];
    const sorted = sortComplexes(list, "household_desc");
    // 100 > 50 > undefined(=0) 순서
    expect(sorted.map((c) => c.complex_no)).toEqual(["1", "3", "2"]);
  });

  // 원본 배열 불변
  it("원본 배열을 변형하지 않음 (immutability)", () => {
    const list = [
      makeComplex({ complex_no: "1", total_household_count: 100 }),
      makeComplex({ complex_no: "2", total_household_count: 500 }),
    ];
    const before = list.map((c) => c.complex_no);
    sortComplexes(list, "household_desc");
    expect(list.map((c) => c.complex_no)).toEqual(before);
  });
});
