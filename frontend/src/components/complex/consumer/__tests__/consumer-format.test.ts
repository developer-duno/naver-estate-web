/** 소비자 화면 표시 글자(세션 482 PR 1b) — 공시가율 분모 = 범위(최고·최저), 중위 분모 금지 */
import { describe, expect, it } from "vitest";
import {
  brokeredCount,
  currentYm,
  isOfficetel,
  kaptCostText,
  monthsEndingAt,
  officialForArea,
  officialRatioText,
  peopleText,
  priceRangeText,
  priceStage,
  topicParticle,
  tradeCountText,
} from "../consumer-format";
import { OFFICIAL } from "./fixtures";

describe("consumer-format", () => {
  it("범위 글자 — 같으면 하나", () => {
    expect(priceRangeText(15700, 18000)).toBe("1억 5,700만~1억 8,000만");
    expect(priceRangeText(15700, 18000, true)).toBe("1억 5,700만 ~ 1억 8,000만");
    expect(priceRangeText(15700, 15700)).toBe("1억 5,700만");
  });

  it("공시가율 = 공시 ÷ 최고 ~ 공시 ÷ 최저 → 63~72%", () => {
    expect(officialRatioText(113_000_000, 15700, 18000)).toBe("실거래의 63~72%");
    expect(officialRatioText(113_000_000, 0, 18000)).toBeNull();
  });

  it("공시가격 평형 = 선택 면적 ±1㎡ 안 가장 가까운 것", () => {
    expect(officialForArea(OFFICIAL.items, 59)?.prvuse_ar).toBe(59.9);
    expect(officialForArea(OFFICIAL.items, 84)?.prvuse_ar).toBe(84.9);
    expect(officialForArea(OFFICIAL.items, 42)).toBeNull();
  });

  it("관리비 원 → 약 19만 원 · 10만 미만 소수 1자리", () => {
    expect(kaptCostText(190_000)).toBe("약 19만 원");
    expect(kaptCostText(85_000)).toBe("약 8.5만 원");
    expect(kaptCostText(0)).toBeNull();
  });

  it("사람 수", () => {
    expect(peopleText(54325)).toBe("5만 4,325명");
    expect(peopleText(9000)).toBe("9,000명");
  });

  it("24개 달 — 2026.10 까지면 2024.11 부터", () => {
    const m = monthsEndingAt("202610", 24);
    expect(m).toHaveLength(24);
    expect(m[0]).toBe("202411");
    expect(m[23]).toBe("202610");
    expect(monthsEndingAt("202601", 2)).toEqual(["202512", "202601"]);
    expect(currentYm(new Date(2026, 9, 26))).toBe("202610");
  });

  it("거래 수 — 거래 목록이 있으면 중개거래만", () => {
    expect(brokeredCount({ area_m2: 59, price_median: null, trade_count: 3, trades: [] })).toBe(3);
    expect(brokeredCount({
      area_m2: 59, price_median: null, trade_count: 3,
      trades: [{ price: 1, date: null, floor: null, direct: true }, { price: 2, date: null, floor: null, direct: false }],
    })).toBe(1);
  });

  it("건수 글자 — 거래 목록이 비면 '거래 N건', 있으면 '중개거래 N건'(보완 F7)", () => {
    expect(tradeCountText({ area_m2: 59, price_median: null, trade_count: 3, trades: [] })).toBe("거래 3건");
    expect(tradeCountText({
      area_m2: 59, price_median: null, trade_count: 3,
      trades: [{ price: 1, date: null, floor: null, direct: true }, { price: 2, date: null, floor: null, direct: false }],
    })).toBe("중개거래 1건");
  });

  it("주제 조사 — 받침 있으면 '은', 없으면 '는'", () => {
    expect(topicParticle("유성구")).toBe("는");
    expect(topicParticle("이 단지 지역")).toBe("은");
    expect(topicParticle("ABC")).toBe("는");
  });

  it("집값 단계 3가지 — 6개월 → 2년 → 직접 입력(결정 12)", () => {
    const ranged = { area_m2: 59, price_median: null, trade_count: 3, price_min: 15700, price_max: 18000, trades: [] };
    const none = { ...ranged, price_min: null, price_max: null };
    expect(priceStage(ranged, { min: 14700, max: 20000 })).toEqual({ kind: "6m", min: 15700, max: 18000 });
    expect(priceStage(none, { min: 14700, max: 20000 })).toEqual({ kind: "2y", min: 14700, max: 20000 });
    expect(priceStage(none, null)).toEqual({ kind: "manual" });
    expect(priceStage(undefined, { min: 0, max: 0 })).toEqual({ kind: "manual" });
  });

  it("오피스텔 판정 — OPST·OBYG, 코드 없으면 이름", () => {
    expect(isOfficetel({ real_estate_type_code: "OPST" })).toBe(true);
    expect(isOfficetel({ real_estate_type_code: "OBYG" })).toBe(true);
    expect(isOfficetel({ real_estate_type_code: "APT", real_estate_type_name: "오피스텔" })).toBe(false);
    expect(isOfficetel({ real_estate_type_name: "오피스텔분양권" })).toBe(true);
    expect(isOfficetel({ real_estate_type_name: "아파트" })).toBe(false);
  });
});
