/**
 * formatHouseType — 미분양 분양가 표 house_type 한글 라벨 매핑
 * 사고 박제: 사용자가 "타입 = presale_min" 영문 키를 그대로 본 사건 (2026-05-22 세션 216)
 */
import { describe, it, expect } from "vitest";
import { formatHouseType } from "../mb-house-type";

describe("formatHouseType", () => {
  it("알려진 키는 한글 라벨로 매핑", () => {
    expect(formatHouseType("presale_min")).toBe("최저가형");
    expect(formatHouseType("presale_max")).toBe("최고가형");
  });

  it("null/undefined/빈 값은 대시", () => {
    expect(formatHouseType(null)).toBe("-");
    expect(formatHouseType(undefined)).toBe("-");
    expect(formatHouseType("")).toBe("-");
  });

  it("모르는 키는 원본 그대로 (정보 손실보다 노출이 나음)", () => {
    expect(formatHouseType("84A")).toBe("84A");
    expect(formatHouseType("타입A")).toBe("타입A");
  });
});
