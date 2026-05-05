/**
 * normalizeInput 회귀 가드 (Phase A-0).
 * UI 우회·URL 조작·극단값 방어 단일 책임 — clamp + corp 강제.
 */

import { describe, it, expect } from "vitest";
import { normalizeInput } from "../property-tax-rules";
import type { PropertyTaxInput } from "../property-tax-types";

const baseInput: PropertyTaxInput = {
  publishedPriceWon: 1_000_000_000,
  houses: 2,
  isSingleHouseEligible: false,
  ageYears: 0,
  holdYears: 0,
};

describe("normalizeInput — Phase A-0 정규화 안전망", () => {
  // 케이스 1: 옵션 미입력 시 안전 기본값 (excluded=0, ratio=1, corp=false)
  it("옵션 미입력 — excludedHouses=0, ownershipRatio=1, isCorporation=false", () => {
    const result = normalizeInput(baseInput);
    expect(result.excludedHouses).toBe(0);
    expect(result.ownershipRatio).toBe(1);
    expect(result.isCorporation).toBe(false);
  });

  // 케이스 2: excludedHouses 음수 → 0 으로 clamp
  it("excludedHouses 음수 → 0 으로 clamp", () => {
    const result = normalizeInput({ ...baseInput, excludedHouses: -5 });
    expect(result.excludedHouses).toBe(0);
  });

  // 케이스 3: excludedHouses 가 houses 초과 → houses 로 clamp
  it("excludedHouses 가 houses 초과 → houses 로 clamp (houses=2 + excluded=10 → 2)", () => {
    const result = normalizeInput({ ...baseInput, houses: 2, excludedHouses: 10 });
    expect(result.excludedHouses).toBe(2);
  });

  // 케이스 4: ownershipRatio 0/음수/Infinity/NaN → 1 으로 안전 기본값
  it("ownershipRatio 0/음수/Infinity/NaN → 1 안전 기본값", () => {
    expect(normalizeInput({ ...baseInput, ownershipRatio: 0 }).ownershipRatio).toBe(1);
    expect(normalizeInput({ ...baseInput, ownershipRatio: -0.5 }).ownershipRatio).toBe(1);
    expect(normalizeInput({ ...baseInput, ownershipRatio: Infinity }).ownershipRatio).toBe(1);
    expect(normalizeInput({ ...baseInput, ownershipRatio: NaN }).ownershipRatio).toBe(1);
    expect(normalizeInput({ ...baseInput, ownershipRatio: 1.5 }).ownershipRatio).toBe(1);
  });

  // 케이스 5: ownershipRatio 정상 범위 (0 < x ≤ 1) 보존
  it("ownershipRatio 정상 범위 보존 — 0.5/0.99/1.0", () => {
    expect(normalizeInput({ ...baseInput, ownershipRatio: 0.5 }).ownershipRatio).toBe(0.5);
    expect(normalizeInput({ ...baseInput, ownershipRatio: 0.99 }).ownershipRatio).toBe(0.99);
    expect(normalizeInput({ ...baseInput, ownershipRatio: 1 }).ownershipRatio).toBe(1);
  });

  // 케이스 6: isCorporation=true 시 excluded/ratio/single 강제 (B-2/B-3 무효화)
  it("isCorporation=true 시 excludedHouses=0, ownershipRatio=1, isSingleHouseEligible=false 강제", () => {
    const result = normalizeInput({
      ...baseInput,
      isCorporation: true,
      excludedHouses: 5,
      ownershipRatio: 0.3,
      isSingleHouseEligible: true,
    });
    expect(result.isCorporation).toBe(true);
    expect(result.excludedHouses).toBe(0);
    expect(result.ownershipRatio).toBe(1);
    expect(result.isSingleHouseEligible).toBe(false);
  });
});

describe("normalizeInput — 5종 특례주택 (PDF #12, 세션 112)", () => {
  const singleBase: PropertyTaxInput = {
    publishedPriceWon: 1_500_000_000, houses: 1,
    isSingleHouseEligible: true, ageYears: 0, holdYears: 0,
  };

  // 케이스 1: 1주택 + 자격 + 비법인 + 1 카테고리 입력 — 보존
  it("자격 충족 (1주택 + 1세대1주택 + 비법인) — specialHouses 보존", () => {
    const r = normalizeInput({ ...singleBase, specialHouses: { temporary2: { count: 1, publishedTotal: 50_000 } } });
    expect(r.specialHouses).toEqual({ temporary2: { count: 1, publishedTotal: 50_000 } });
  });

  // 케이스 2: 다주택 시 자동 차단
  it("houses !== 1 시 specialHouses=undefined 강제", () => {
    const r = normalizeInput({ ...singleBase, houses: 2, isSingleHouseEligible: false, specialHouses: { inherited: { count: 1, publishedTotal: 30_000 } } });
    expect(r.specialHouses).toBeUndefined();
  });

  // 케이스 3: 자격 미충족 시 자동 차단
  it("isSingleHouseEligible=false 시 specialHouses=undefined 강제", () => {
    const r = normalizeInput({ ...singleBase, isSingleHouseEligible: false, specialHouses: { ruralLowPrice: { count: 1, publishedTotal: 40_000 } } });
    expect(r.specialHouses).toBeUndefined();
  });

  // 케이스 4: 법인 시 자동 차단
  it("isCorporation=true 시 specialHouses=undefined 강제", () => {
    const r = normalizeInput({ ...singleBase, isCorporation: true, specialHouses: { populationDecline: { count: 1, publishedTotal: 30_000 } } });
    expect(r.specialHouses).toBeUndefined();
  });

  // 케이스 5: count 음수/Infinity/NaN/4 이상 → clamp (음수 0, 4+ → 3)
  it("count clamp — 음수 0, Infinity 0, NaN 0, 4 이상 3 강제", () => {
    expect(normalizeInput({ ...singleBase, specialHouses: { temporary2: { count: -1, publishedTotal: 50_000 } } }).specialHouses).toBeUndefined();
    expect(normalizeInput({ ...singleBase, specialHouses: { temporary2: { count: Infinity, publishedTotal: 50_000 } } }).specialHouses).toBeUndefined();
    expect(normalizeInput({ ...singleBase, specialHouses: { temporary2: { count: NaN, publishedTotal: 50_000 } } }).specialHouses).toBeUndefined();
    expect(normalizeInput({ ...singleBase, specialHouses: { temporary2: { count: 10, publishedTotal: 50_000 } } }).specialHouses).toEqual({ temporary2: { count: 3, publishedTotal: 50_000 } });
  });

  // 케이스 6: count=0 시 publishedTotal=0 강제 + entry undefined 정리
  it("count=0 시 publishedTotal=0 강제 + entry undefined 정리 (양립 모순 차단)", () => {
    const r = normalizeInput({ ...singleBase, specialHouses: { temporary2: { count: 0, publishedTotal: 50_000 }, inherited: { count: 1, publishedTotal: 30_000 } } });
    expect(r.specialHouses?.temporary2).toBeUndefined();
    expect(r.specialHouses?.inherited).toEqual({ count: 1, publishedTotal: 30_000 });
  });
});
