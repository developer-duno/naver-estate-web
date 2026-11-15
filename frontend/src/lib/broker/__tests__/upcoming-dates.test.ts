/**
 * 「중개 실무」 다가오는 날짜 자료 검사 — 손으로 고치는 자료라 꼴이 무너지면 시험이 막는다(세션 511).
 * 실행: npx vitest run src/lib/broker/__tests__/upcoming-dates.test.ts
 */
import { describe, it, expect } from "vitest";
import { UPCOMING_DATES, formatDateDot } from "../upcoming-dates";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** 문자열이 실제 달력에 있는 날인지(2026-02-30 같은 것 거르기) */
function isRealDate(iso: string): boolean {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

describe("UPCOMING_DATES 자료", () => {
  it("항목이 1개 이상", () => {
    expect(UPCOMING_DATES.length).toBeGreaterThan(0);
  });

  it("date·checkedAt 은 YYYY-MM-DD 꼴의 실제 날짜", () => {
    for (const d of UPCOMING_DATES) {
      expect(d.date).toMatch(ISO_DATE);
      expect(isRealDate(d.date)).toBe(true);
      expect(d.checkedAt).toMatch(ISO_DATE);
      expect(isRealDate(d.checkedAt)).toBe(true);
    }
  });

  it("출처 주소는 https 이고 제목·설명·출처 이름이 비어 있지 않다", () => {
    for (const d of UPCOMING_DATES) {
      expect(new URL(d.sourceUrl).protocol).toBe("https:");
      expect(d.title.trim()).not.toBe("");
      expect(d.note.trim()).not.toBe("");
      expect(d.sourceLabel.trim()).not.toBe("");
    }
  });

  it("원문 확인일은 그날보다 앞이다(지난 항목을 남겨 두지 않는다)", () => {
    for (const d of UPCOMING_DATES) {
      expect(d.checkedAt < d.date).toBe(true);
    }
  });

  it("날짜가 이른 것부터 놓인다", () => {
    const dates = UPCOMING_DATES.map((d) => d.date);
    expect(dates).toEqual([...dates].sort());
  });
});

describe("formatDateDot", () => {
  it("2026-12-31 → 2026. 12. 31. · 앞자리 0 은 뺀다", () => {
    expect(formatDateDot("2026-12-31")).toBe("2026. 12. 31.");
    expect(formatDateDot("2027-01-05")).toBe("2027. 1. 5.");
  });
});
