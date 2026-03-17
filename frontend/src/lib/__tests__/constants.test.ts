import { describe, it, expect } from "vitest";
import { M2_TO_PYEONG, PAGE_SIZE } from "../constants";

describe("constants", () => {
  it("M2_TO_PYEONG is correct conversion factor", () => {
    expect(M2_TO_PYEONG).toBeCloseTo(3.3058, 4);
  });

  it("33m2 is approximately 10 pyeong", () => {
    expect(33 / M2_TO_PYEONG).toBeCloseTo(9.98, 1);
  });

  it("PAGE_SIZE is reasonable", () => {
    expect(PAGE_SIZE).toBeGreaterThan(0);
    expect(PAGE_SIZE).toBeLessThanOrEqual(100);
  });
});


// 추가 상수 테스트 — 신규 상수 검증
import {
  TRADE_TYPE_COLORS,
  TRADE_TYPE_DEFAULT_COLOR,
  FLOOR_PRESETS,
  DEBOUNCE_MS,
  MAX_EXPORT_ROWS,
  CRAWL_STATUS_POLL_MS,
  ARTICLES_POLL_MS,
} from "../constants";

describe("TRADE_TYPE_COLORS", () => {
  it("4개 거래유형 모두 포함", () => {
    expect(Object.keys(TRADE_TYPE_COLORS)).toHaveLength(4);
    expect(TRADE_TYPE_COLORS).toHaveProperty("매매");
    expect(TRADE_TYPE_COLORS).toHaveProperty("전세");
    expect(TRADE_TYPE_COLORS).toHaveProperty("월세");
    expect(TRADE_TYPE_COLORS).toHaveProperty("단기임대");
  });
});

describe("TRADE_TYPE_DEFAULT_COLOR", () => {
  it("기본 색상이 정의되어 있음", () => {
    expect(TRADE_TYPE_DEFAULT_COLOR).toBeDefined();
    expect(typeof TRADE_TYPE_DEFAULT_COLOR).toBe("string");
  });
});

describe("FLOOR_PRESETS", () => {
  it("3개 프리셋 포함", () => {
    expect(Object.keys(FLOOR_PRESETS)).toHaveLength(3);
    expect(FLOOR_PRESETS).toHaveProperty("저층");
    expect(FLOOR_PRESETS).toHaveProperty("중층");
    expect(FLOOR_PRESETS).toHaveProperty("고층");
  });
});

describe("DEBOUNCE_MS", () => {
  it("300ms", () => {
    expect(DEBOUNCE_MS).toBe(300);
  });
});

describe("MAX_EXPORT_ROWS", () => {
  it("5000행", () => {
    expect(MAX_EXPORT_ROWS).toBe(5000);
  });
});

describe("폴링 간격", () => {
  it("CRAWL_STATUS_POLL_MS는 양수", () => {
    expect(CRAWL_STATUS_POLL_MS).toBeGreaterThan(0);
  });

  it("ARTICLES_POLL_MS >= CRAWL_STATUS_POLL_MS", () => {
    expect(ARTICLES_POLL_MS).toBeGreaterThanOrEqual(CRAWL_STATUS_POLL_MS);
  });
});
