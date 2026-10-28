/**
 * 시군구 이름표 상수(세션 484 PR 3c-1b · B1) — backend/data/region_codes.json 과 내용이 같아야 한다(한쪽만 고치면 여기서 깨진다).
 * 실행: npx vitest run src/lib/seo/__tests__/region-codes.test.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { REGION_CODES } from "../region-codes";

describe("REGION_CODES", () => {
  it("백엔드 원본 region_codes.json 과 같다(키·시도·시군구 전부)", () => {
    const src = path.resolve(__dirname, "../../../../../backend/data/region_codes.json");
    const original = JSON.parse(readFileSync(src, "utf-8"));
    expect(REGION_CODES).toEqual(original);
  });

  it("253곳 · 키는 5자리 숫자 · 세종은 시군구 이름이 빈 줄", () => {
    const keys = Object.keys(REGION_CODES);
    expect(keys).toHaveLength(253);
    expect(keys.every((k) => /^\d{5}$/.test(k))).toBe(true);
    expect(REGION_CODES["36110"]).toEqual({ sido: "세종", sigungu: "" });
    expect(REGION_CODES["30200"]).toEqual({ sido: "대전", sigungu: "유성구" });
  });
});
