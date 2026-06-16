/**
 * mb-presale-format 테스트 (세션 314 PR E) — D-day KST 고정 + house_ty 포맷 + 날짜.
 * 실행: npx vitest run src/lib/__tests__/mb-presale-format.test.ts
 *
 * timezone: nowMs 주입으로 결정성 확보 (하드코딩 시각 금지, timezone-consistency 룰5).
 */
import { describe, it, expect } from "vitest";
import {
  getDday,
  formatDday,
  formatScheduleDate,
  formatDateRange,
  formatPresaleHouseType,
  formatMoveInYm,
} from "@/lib/mb-presale-format";

// 기준 시각: 2026-06-10 12:00 KST = 2026-06-10 03:00 UTC
const NOW_KST_0610 = Date.UTC(2026, 5, 10, 3, 0, 0); // UTC 03:00 = KST 12:00

describe("getDday / formatDday — KST 자정 고정", () => {
  it("미래 날짜는 양수 D-day", () => {
    expect(getDday("2026-06-13", NOW_KST_0610)).toBe(3);
    expect(formatDday("2026-06-13", NOW_KST_0610)).toBe("D-3");
  });

  it("당일은 D-DAY", () => {
    expect(getDday("2026-06-10", NOW_KST_0610)).toBe(0);
    expect(formatDday("2026-06-10", NOW_KST_0610)).toBe("D-DAY");
  });

  it("과거 날짜는 음수 (마감 후 D+)", () => {
    expect(getDday("2026-06-08", NOW_KST_0610)).toBe(-2);
    expect(formatDday("2026-06-08", NOW_KST_0610)).toBe("D+2");
  });

  it("KST 경계: UTC 자정 직후라도 KST 기준일로 계산 (환경 무관)", () => {
    // 2026-06-10 23:30 KST = 2026-06-10 14:30 UTC → 여전히 6/10 (KST)
    const lateKst = Date.UTC(2026, 5, 10, 14, 30, 0);
    expect(getDday("2026-06-11", lateKst)).toBe(1); // 내일
    // UTC 로 보면 이미 다음날 위험 시각이지만 KST 보정으로 6/10 유지
  });

  it("ISO datetime 앞 10자도 파싱", () => {
    expect(getDday("2026-06-13T00:00:00", NOW_KST_0610)).toBe(3);
  });

  it("null/빈값/형식오류는 null", () => {
    expect(getDday(null, NOW_KST_0610)).toBeNull();
    expect(getDday("", NOW_KST_0610)).toBeNull();
    expect(getDday("미정", NOW_KST_0610)).toBeNull();
    expect(formatDday(null, NOW_KST_0610)).toBe("");
  });
});

describe("formatScheduleDate / formatDateRange", () => {
  it("YYYY-MM-DD → YYYY.MM.DD", () => {
    expect(formatScheduleDate("2026-06-05")).toBe("2026.06.05");
  });

  it("실패 시 '-'", () => {
    expect(formatScheduleDate(null)).toBe("-");
    expect(formatScheduleDate("미정")).toBe("-");
  });

  it("기간: 양쪽 있으면 '~' 연결", () => {
    expect(formatDateRange("2026-06-05", "2026-06-07")).toBe("2026.06.05 ~ 2026.06.07");
  });

  it("기간: 한쪽만 있으면 그것만", () => {
    expect(formatDateRange("2026-06-05", null)).toBe("2026.06.05");
    expect(formatDateRange(null, "2026-06-07")).toBe("2026.06.07");
  });

  it("기간: 둘 다 없으면 '-'", () => {
    expect(formatDateRange(null, null)).toBe("-");
  });
});

describe("formatPresaleHouseType — house_ty 평형 포맷", () => {
  it("'051.0000A' → '51㎡A'", () => {
    expect(formatPresaleHouseType("051.0000A")).toBe("51㎡A");
  });

  it("'084.9900B' → '85㎡B' (반올림)", () => {
    expect(formatPresaleHouseType("084.9900B")).toBe("85㎡B");
  });

  it("접미 알파벳 없어도 처리", () => {
    expect(formatPresaleHouseType("059.9800")).toBe("60㎡");
  });

  it("파싱 실패 시 원본 반환", () => {
    expect(formatPresaleHouseType("이상한값")).toBe("이상한값");
  });

  it("null → '-'", () => {
    expect(formatPresaleHouseType(null)).toBe("-");
  });
});

describe("formatMoveInYm", () => {
  it("'202612' → '2026.12'", () => {
    expect(formatMoveInYm("202612")).toBe("2026.12");
  });

  it("null → '-'", () => {
    expect(formatMoveInYm(null)).toBe("-");
  });
});
