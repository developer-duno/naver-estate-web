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


// 신규 상수 테스트
import { SORT_OPTIONS, BUILDING_AGE_OPTIONS, MOVE_IN_OPTIONS } from "../constants";

describe("SORT_OPTIONS", () => {
  it("11개 정렬 옵션 포함", () => {
    expect(SORT_OPTIONS).toHaveLength(11);
  });

  it("기본순이 첫 번째", () => {
    expect(SORT_OPTIONS[0].v).toBe("rank");
    expect(SORT_OPTIONS[0].l).toBe("기본순");
  });

  it("모든 옵션에 v와 l 필드 존재", () => {
    for (const opt of SORT_OPTIONS) {
      expect(opt.v).toBeDefined();
      expect(opt.l).toBeDefined();
    }
  });
});

describe("BUILDING_AGE_OPTIONS", () => {
  it("7개 준공년도 옵션", () => {
    expect(BUILDING_AGE_OPTIONS).toHaveLength(7);
  });

  it("전체가 첫 번째", () => {
    expect(BUILDING_AGE_OPTIONS[0].l).toBe("전체");
  });
});

describe("MOVE_IN_OPTIONS", () => {
  it("6개 입주가능일 옵션", () => {
    expect(MOVE_IN_OPTIONS).toHaveLength(6);
  });

  it("전체가 첫 번째", () => {
    expect(MOVE_IN_OPTIONS[0]).toBe("전체");
  });
});


// 매물유형 색상 상수 테스트
import { ESTATE_TYPE_COLORS, ESTATE_TYPE_DEFAULT_COLOR } from "../constants";

describe("ESTATE_TYPE_COLORS", () => {
  it("6개 매물유형 색상 포함", () => {
    expect(Object.keys(ESTATE_TYPE_COLORS)).toHaveLength(6);
  });

  it("아파트/오피스텔/재건축/재개발 포함", () => {
    expect(ESTATE_TYPE_COLORS).toHaveProperty("아파트");
    expect(ESTATE_TYPE_COLORS).toHaveProperty("오피스텔");
    expect(ESTATE_TYPE_COLORS).toHaveProperty("재건축");
    expect(ESTATE_TYPE_COLORS).toHaveProperty("재개발");
    expect(ESTATE_TYPE_COLORS).toHaveProperty("아파트분양권");
    expect(ESTATE_TYPE_COLORS).toHaveProperty("오피스텔분양권");
  });
});

describe("ESTATE_TYPE_DEFAULT_COLOR", () => {
  it("기본 색상이 정의되어 있음", () => {
    expect(ESTATE_TYPE_DEFAULT_COLOR).toBeDefined();
    expect(typeof ESTATE_TYPE_DEFAULT_COLOR).toBe("string");
  });
});


// 매물유형 탭/필터 옵션 상수 테스트
import { ESTATE_TYPE_TABS, ESTATE_TYPE_FILTER_OPTIONS } from "../constants";

describe("ESTATE_TYPE_TABS", () => {
  it("6개 탭 정의", () => {
    expect(ESTATE_TYPE_TABS).toHaveLength(6);
  });

  it("모든 탭에 code와 label 존재", () => {
    for (const tab of ESTATE_TYPE_TABS) {
      expect(tab.code).toBeDefined();
      expect(tab.label).toBeDefined();
    }
  });

  it("APT가 첫 번째", () => {
    expect(ESTATE_TYPE_TABS[0].code).toBe("APT");
  });
});

describe("ESTATE_TYPE_FILTER_OPTIONS", () => {
  it("5개 필터 옵션 정의", () => {
    expect(ESTATE_TYPE_FILTER_OPTIONS).toHaveLength(5);
  });

  it("모든 옵션에 code와 label 존재", () => {
    for (const opt of ESTATE_TYPE_FILTER_OPTIONS) {
      expect(opt.code).toBeDefined();
      expect(opt.label).toBeDefined();
    }
  });
});
