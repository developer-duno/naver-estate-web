/**
 * mb-format 테스트 — 평당가 정규화 (세션 300)
 * 실행: npx vitest run src/lib/__tests__/mb-format.test.ts
 */
import { describe, it, expect } from "vitest";
import { normalizePp } from "../mb-format";

describe("normalizePp (평당가 0/미공개 정규화)", () => {
  it("양수는 그대로 반환한다", () => {
    expect(normalizePp(1500)).toBe(1500);
    expect(normalizePp(1)).toBe(1);
  });

  it("0 은 null 로 정규화한다 (미공개/적재결함)", () => {
    expect(normalizePp(0)).toBeNull();
  });

  it("음수는 null 로 정규화한다 (비정상값)", () => {
    expect(normalizePp(-100)).toBeNull();
  });

  it("null/undefined 는 null 을 반환한다", () => {
    expect(normalizePp(null)).toBeNull();
    expect(normalizePp(undefined)).toBeNull();
  });
});
