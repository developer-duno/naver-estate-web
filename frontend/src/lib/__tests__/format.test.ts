import { describe, it, expect } from "vitest";
import {
  formatChartPrice,
  formatDateFull,
  formatDateShort,
  formatKoreanPrice,
  formatMaintenanceCost,
  formatWon,
  formatYearMonth,
} from "../format";

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


// 추가 테스트 케이스 — 경계값 검증
describe("formatKoreanPrice 추가", () => {
  it("정확히 1억 (10000만원)", () => {
    expect(formatKoreanPrice(10000)).toBe("1억");
  });

  it("큰 금액 (12억 5,000만원)", () => {
    expect(formatKoreanPrice(125000)).toBe("12억 5,000만");
  });

  it("매우 작은 값 (1만원)", () => {
    expect(formatKoreanPrice(1)).toBe("1만");
  });
});

describe("formatDateFull 추가", () => {
  it("공백만 있는 문자열은 그대로 반환", () => {
    expect(formatDateFull("   ")).toBe("   ");
  });
});

describe("formatMaintenanceCost 추가", () => {
  it("숫자 0은 0만원 반환", () => {
    expect(formatMaintenanceCost(null, 0)).toBe("0만원");
  });
});

// 차트용 가격 포맷 — 억/만 구분자 없는 축약형 (splitEokMan 통합 회귀 가드)
describe("formatChartPrice", () => {
  it("1억 미만은 만 단위", () => {
    expect(formatChartPrice(5000)).toBe("5,000만");
  });

  it("정확히 N억이면 억만 표기", () => {
    expect(formatChartPrice(30000)).toBe("3억");
  });

  it("나머지가 있으면 공백 없이 억+만 연결", () => {
    expect(formatChartPrice(35000)).toBe("3억5,000만");
  });

  it("0은 가드에 안 걸려 0만 출력", () => {
    expect(formatChartPrice(0)).toBe("0만");
  });

  it("NaN/null은 대시", () => {
    expect(formatChartPrice(NaN)).toBe("-");
    expect(formatChartPrice(null as unknown as number)).toBe("-");
  });
});

// 원 단위 → 만원/억원 포맷 (splitEokMan 통합 회귀 가드)
describe("formatWon", () => {
  it("원 단위를 만원으로 환산", () => {
    expect(formatWon("50000000")).toBe("5,000만원");
  });

  it("정확히 N억원", () => {
    expect(formatWon("1000000000")).toBe("10억원");
  });

  it("나머지가 있으면 공백 포함 억원+만원", () => {
    expect(formatWon("1050000000")).toBe("10억 5,000만원");
  });

  it("0은 0원", () => {
    expect(formatWon("0")).toBe("0원");
  });

  it("빈 값/null은 대시", () => {
    expect(formatWon("")).toBe("-");
    expect(formatWon(null)).toBe("-");
  });

  it("음수는 대시", () => {
    expect(formatWon("-100")).toBe("-");
  });
});

// 완공·입주월 포맷 (미분양 상세 raw "202805" 노출 사고 박제 — 2026-05-22 세션 216)
describe("formatYearMonth", () => {
  it("YYYYMM 6자리 → YYYY.MM", () => {
    expect(formatYearMonth("202805")).toBe("2028.05");
  });

  it("YYYYMMDD 8자리 → YYYY.MM.DD (입주일 등)", () => {
    expect(formatYearMonth("20280515")).toBe("2028.05.15");
  });

  it("null/undefined/빈 문자열은 null 반환 (호출부 가드)", () => {
    expect(formatYearMonth(null)).toBeNull();
    expect(formatYearMonth(undefined)).toBeNull();
    expect(formatYearMonth("")).toBeNull();
  });

  it("길이 안 맞는 값은 원본 그대로 (사용자 노출 결정은 호출부)", () => {
    expect(formatYearMonth("2028")).toBe("2028");
    expect(formatYearMonth("분양중")).toBe("분양중");
  });
});
