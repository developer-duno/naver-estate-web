import { describe, it, expect } from "vitest";
import { formatRelativeKo } from "../format-relative";

describe("formatRelativeKo", () => {
  const NOW = new Date("2026-05-02T12:00:00Z");

  it("null/undefined/잘못된 ISO → '미수집'", () => {
    expect(formatRelativeKo(null, NOW)).toBe("미수집");
    expect(formatRelativeKo(undefined, NOW)).toBe("미수집");
    expect(formatRelativeKo("not-an-iso", NOW)).toBe("미수집");
  });

  it("미래 시각 또는 60초 미만 → '방금'", () => {
    expect(formatRelativeKo(new Date(NOW.getTime() + 60_000).toISOString(), NOW)).toBe("방금");
    expect(formatRelativeKo(new Date(NOW.getTime() - 30_000).toISOString(), NOW)).toBe("방금");
  });

  it("60초 ~ 1시간 → 'N분 전'", () => {
    expect(formatRelativeKo(new Date(NOW.getTime() - 60_000).toISOString(), NOW)).toBe("1분 전");
    expect(formatRelativeKo(new Date(NOW.getTime() - 30 * 60_000).toISOString(), NOW)).toBe("30분 전");
  });

  it("1시간 ~ 24시간 → 'N시간 전'", () => {
    expect(formatRelativeKo(new Date(NOW.getTime() - 3600_000).toISOString(), NOW)).toBe("1시간 전");
    expect(formatRelativeKo(new Date(NOW.getTime() - 5 * 3600_000).toISOString(), NOW)).toBe("5시간 전");
  });

  it("24시간 이상 → 'N일 전'", () => {
    expect(formatRelativeKo(new Date(NOW.getTime() - 86400_000).toISOString(), NOW)).toBe("1일 전");
    expect(formatRelativeKo(new Date(NOW.getTime() - 3 * 86400_000).toISOString(), NOW)).toBe("3일 전");
  });
});
