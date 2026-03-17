import { describe, it, expect } from "vitest";
import { formatDateFull, formatDateShort, formatKoreanPrice, formatMaintenanceCost } from "../format";

describe("formatDateFull", () => {
  it("YYYYMMDD → YYYY.MM.DD", () => {
    expect(formatDateFull("20250315")).toBe("2025.03.15");
  });

  it("returns dash for null/undefined", () => {
    expect(formatDateFull(null)).toBe("-");
    expect(formatDateFull(undefined)).toBe("-");
    expect(formatDateFull("")).toBe("-");
  });

  it("returns original for non-8-char string", () => {
    expect(formatDateFull("2025-03")).toBe("2025-03");
  });
});

describe("formatDateShort", () => {
  it("YYYYMMDD → YY.MM.DD", () => {
    expect(formatDateShort("20250315")).toBe("25.03.15");
  });

  it("returns dash for null/undefined", () => {
    expect(formatDateShort(null)).toBe("-");
  });
});

describe("formatKoreanPrice", () => {
  it("formats under 1억", () => {
    expect(formatKoreanPrice(5000)).toBe("5,000만");
  });

  it("formats over 1억 (exact)", () => {
    expect(formatKoreanPrice(30000)).toBe("3억");
  });

  it("formats over 1억 (with remainder)", () => {
    expect(formatKoreanPrice(35000)).toBe("3억 5,000만");
  });

  it("returns dash for null/0", () => {
    expect(formatKoreanPrice(null)).toBe("-");
    expect(formatKoreanPrice(0)).toBe("-");
    expect(formatKoreanPrice(undefined)).toBe("-");
  });
});

describe("formatMaintenanceCost", () => {
  it("formats string cost", () => {
    expect(formatMaintenanceCost("15")).toBe("15만원");
  });

  it("returns string with 만 as-is", () => {
    expect(formatMaintenanceCost("15만원")).toBe("15만원");
  });

  it("formats numeric cost", () => {
    expect(formatMaintenanceCost(null, 15)).toBe("15만원");
  });

  it("returns dash for no cost", () => {
    expect(formatMaintenanceCost(null, null)).toBe("-");
    expect(formatMaintenanceCost()).toBe("-");
  });
});
