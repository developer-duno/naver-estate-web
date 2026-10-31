/**
 * 시세 범위 글자 도우미(세션 489 PR b2 — B29 설계 §1·§2-5 ②) — 범위·건수·경계·직거래·옛 값 단지 글자.
 * 실행: npx vitest run src/lib/__tests__/range-price.test.ts
 */
import { describe, it, expect } from "vitest";
import {
  areaRangeSummary,
  countSuffix,
  legacyRangeTexts,
  percentRangeText,
  repChipText,
  repPrimaryText,
  tradeLineText,
} from "../range-price";
import { otherAreaText } from "../area-group";
import type { AreaPrice, AreaTrade } from "@/types";

function trade(o: Partial<AreaTrade> = {}): AreaTrade {
  return { price: 15700, date: "2026-06-26", floor: 4, direct: false, ...o };
}

function area(o: Partial<AreaPrice> = {}): AreaPrice {
  return { area_m2: 59, households: 300, price_median: 17200, trade_count: 3, price_min: 15700, price_max: 18000, trades: [], ...o };
}

/** 6139 59㎡ 라이브 API 실측(10-31) 세 건 */
const LIVE_TRADES: AreaTrade[] = [
  trade({ price: 15700, date: "2026-06-26", floor: 4 }),
  trade({ price: 17200, date: "2026-06-05", floor: 8 }),
  trade({ price: 18000, date: "2026-05-05", floor: 7 }),
];

describe("대표 면적 범위(A1·A3·A4)", () => {
  it("범위 + 칩 N = 거래 목록 길이", () => {
    const s = areaRangeSummary(area({ trades: LIVE_TRADES }));
    expect(repPrimaryText(s)).toBe("1억 5,700만 ~ 1억 8,000만");
    expect(repChipText(s)).toBe("최근 6개월 3건");
  });

  it("최저=최고 & 2건 이상 → 한 값 + (2건) · 1건이면 한 값만", () => {
    const two = areaRangeSummary(area({ price_min: 18000, price_max: 18000, trades: [trade({ price: 18000 }), trade({ price: 18000 })] }));
    expect(repPrimaryText(two)).toBe("1억 8,000만 (2건)");
    const one = areaRangeSummary(area({ price_min: 18000, price_max: 18000, trades: [trade({ price: 18000 })] }));
    expect(repPrimaryText(one)).toBe("1억 8,000만");
  });

  it("거래 0건 → — · 칩 없음", () => {
    const s = areaRangeSummary(area({ price_min: null, price_max: null, trades: [] }));
    expect(repPrimaryText(s)).toBe("—");
    expect(repChipText(s)).toBeUndefined();
  });

  it("직거래만(범위 null 인데 목록 있음) → — · 칩 3건(직거래만)", () => {
    const s = areaRangeSummary(area({ price_min: null, price_max: null, trades: LIVE_TRADES.map((t) => ({ ...t, direct: true })) }));
    expect(repPrimaryText(s)).toBe("—");
    expect(repChipText(s)).toBe("최근 6개월 3건(직거래만)");
    expect(countSuffix(s)).toBe(" (직거래만 3건)");
  });

  it("A4 — 목록이 비었는데 범위가 있으면 칩을 숨기고 값은 보인다", () => {
    const s = areaRangeSummary(area({ trades: [] }));
    expect(repPrimaryText(s)).toBe("1억 5,700만 ~ 1억 8,000만");
    expect(repChipText(s)).toBeUndefined();
    expect(countSuffix(s)).toBe("");
  });

  it("대표 면적 항목이 없으면 —", () => {
    expect(repPrimaryText(areaRangeSummary(undefined))).toBe("—");
  });
});

describe("다른 면적 줄(A2)", () => {
  it("84㎡ 범위 (3건) · 1건이면 값 (1건) · 거래 없음 — · price_median 은 안 읽는다", () => {
    const text = otherAreaText(59, [
      area({ trades: LIVE_TRADES }),
      area({ area_m2: 84, price_median: 99999, price_min: 22000, price_max: 24900, trades: LIVE_TRADES }),
      area({ area_m2: 74, price_median: 88888, price_min: 21000, price_max: 21000, trades: [trade({ price: 21000 })] }),
      area({ area_m2: 42, price_median: null, price_min: null, price_max: null, trades: [] }),
    ]);
    expect(text).toBe("84㎡ 2억 2,000만~2억 4,900만 (3건) · 74㎡ 2억 1,000만 (1건) · 42㎡ —");
    expect(text).not.toContain("9억");
  });
});

describe("거래 한 줄(A1·A3)", () => {
  it("날짜 · 층 · 가격", () => {
    expect(tradeLineText(trade())).toBe("2026.06.26 · 4층 · 1억 5,700만");
  });
  it("날짜 null → 날짜 미상 · 층 null → 층 생략", () => {
    expect(tradeLineText(trade({ date: null, floor: null, price: 12000 }))).toBe("날짜 미상 · 1억 2,000만");
  });
});

describe("전세가율 범위(B·C)", () => {
  it("범위 · 같으면 한 값 · 둘 다 null 이면 비움", () => {
    expect(percentRangeText(72, 80)).toBe("72%~80%");
    expect(percentRangeText(66.7, 76.4)).toBe("66.7%~76.4%");
    expect(percentRangeText(75, 75)).toBe("75%");
    expect(percentRangeText(null, null)).toBeNull();
    expect(percentRangeText(undefined, undefined)).toBeNull();
  });
});

describe("옛 값 단지(A')", () => {
  it("범위 + 작은 줄(직거래 포함)", () => {
    expect(legacyRangeTexts({ lower: 12000, upper: 18000, month: "202503" })).toEqual({
      value: "1억 2,000만 ~ 1억 8,000만",
      note: "2025년 3월 거래 · 면적 섞임 · 직거래 포함 · 그 뒤 거래 없음",
    });
  });
  it("같으면 한 값", () => {
    expect(legacyRangeTexts({ lower: 12000, upper: 12000, month: "202411" })?.value).toBe("1억 2,000만");
  });
  it("null → — + 최근 거래 없음 · 칸 없음(undefined) → null(그리지 않음)", () => {
    expect(legacyRangeTexts(null)).toEqual({ value: "—", note: "최근 거래 없음" });
    expect(legacyRangeTexts(undefined)).toBeNull();
  });
});
