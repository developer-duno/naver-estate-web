/**
 * 공휴일 목록(lib/broker/holidays.ts) — 손으로 고치는 자료라 꼴이 무너지면 시험이 막는다(세션 519).
 * 실행: npx vitest run src/lib/broker/__tests__/holidays.test.ts
 */
import { describe, it, expect } from "vitest";
import { HOLIDAYS, HOLIDAY_COVERAGE, HOLIDAY_SOURCES, holidayCovered, holidayName } from "../holidays";
import { isValidDate } from "../deals-storage";

describe("HOLIDAYS 자료 꼴", () => {
  it("날짜가 실제 있는 YYYY-MM-DD · 오름차순 · 중복 없음 · 전부 다루는 기간 안", () => {
    const dates = HOLIDAYS.map((h) => h.date);
    for (const d of dates) {
      expect(isValidDate(d)).toBe(true);
      expect(holidayCovered(d)).toBe(true);
    }
    expect([...dates].sort()).toEqual(dates);
    expect(new Set(dates).size).toBe(dates.length);
  });

  it("2026년(10~12월) 4개 · 2027년 24개 — 확인한 목록 개수(더하거나 빼면 원문을 다시 본다)", () => {
    expect(HOLIDAYS.filter((h) => h.date.startsWith("2026-"))).toHaveLength(4);
    expect(HOLIDAYS.filter((h) => h.date.startsWith("2027-"))).toHaveLength(24);
  });

  it("이름 — 대체공휴일·노동절·제헌절", () => {
    expect(holidayName("2027-02-09")).toBe("대체공휴일(설날)");
    expect(holidayName("2027-05-01")).toBe("노동절");
    expect(holidayName("2027-07-17")).toBe("제헌절");
    expect(holidayName("2027-02-10")).toBeUndefined();
  });

  it("다루는 기간 = 2026-10-01 ~ 2027-12-31 (양 끝 포함)", () => {
    expect(HOLIDAY_COVERAGE).toEqual({ from: "2026-10-01", to: "2027-12-31" });
    expect(holidayCovered("2026-10-01")).toBe(true);
    expect(holidayCovered("2027-12-31")).toBe(true);
    expect(holidayCovered("2026-09-30")).toBe(false);
    expect(holidayCovered("2028-01-01")).toBe(false);
  });

  it("출처 주소는 https 공식 누리집", () => {
    expect(HOLIDAY_SOURCES).toHaveLength(2);
    for (const s of HOLIDAY_SOURCES) expect(s.url).toMatch(/^https:\/\/(www\.law\.go\.kr|astro\.kasi\.re\.kr)\//);
  });
});
