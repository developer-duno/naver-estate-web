/**
 * analytics 타입 회귀 가드 — @deprecated PriceStat 정리(세션 122) 후 다시 추가되지 않도록 차단
 * 실행: npx vitest run src/types/__tests__/analytics.test.ts
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("analytics 타입 회귀 가드", () => {
  it("PriceStat 인터페이스가 다시 추가되지 않아야 한다 (사용처 0 확정)", () => {
    // 사유: PriceStat 은 사용처 0 으로 정리됨. AreaPriceStat·FloorPriceStat·PriceStats 와는 별개 인터페이스.
    // 단어 경계(\b) + (?!s) negative lookahead 로 PriceStat 만 정확 매치 (PriceStats 등은 매치 안 됨)
    const source = readFileSync(join(__dirname, "..", "analytics.ts"), "utf-8");
    expect(source).not.toMatch(/\binterface\s+PriceStat\b(?!s)/);
  });
});
