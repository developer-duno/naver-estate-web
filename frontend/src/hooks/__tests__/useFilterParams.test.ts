/**
 * useFilterParams 훅 테스트 — URL ↔ 필터 양방향 변환
 * 실행: npx vitest run src/hooks/__tests__/useFilterParams.test.ts
 */
import { describe, it, expect } from "vitest";
import {
  parseFiltersFromParams,
  parsePageFromParams,
  filtersToParams,
  buildFilterURL,
} from "../useFilterParams";
import type { ArticleFilters } from "@/types";

// ── parseFiltersFromParams 테스트 ──

describe("parseFiltersFromParams", () => {
  /** 정상 케이스: 여러 타입의 파라미터를 올바르게 파싱 */
  it("정수/실수/불리언/문자열 파라미터를 올바르게 파싱한다", () => {
    const params = new URLSearchParams(
      "min_price=50000&max_area_m2=84.5&verified_only=true&direction=남향&trade_types=매매"
    );
    const filters = parseFiltersFromParams(params);

    expect(filters.min_price).toBe(50000);
    expect(filters.max_area_m2).toBe(84.5);
    expect(filters.verified_only).toBe(true);
    expect(filters.direction).toBe("남향");
    expect(filters.trade_types).toBe("매매");
  });

  /** 빈 파라미터 → 빈 객체 */
  it("파라미터가 없으면 빈 객체를 반환한다", () => {
    const filters = parseFiltersFromParams(new URLSearchParams());
    expect(filters).toEqual({});
  });

  /** 잘못된 숫자 → 무시 */
  it("유효하지 않은 숫자 값은 무시한다", () => {
    const params = new URLSearchParams("min_price=abc&max_price=NaN&min_rooms=3");
    const filters = parseFiltersFromParams(params);

    expect(filters.min_price).toBeUndefined();
    expect(filters.max_price).toBeUndefined();
    expect(filters.min_rooms).toBe(3);
  });

  /** verified_only="false" → false → 필터에 포함되지 않음 (기본값과 동일) */
  it("verified_only=false는 false로 파싱한다", () => {
    const params = new URLSearchParams("verified_only=false");
    const filters = parseFiltersFromParams(params);
    expect(filters.verified_only).toBe(false);
  });

  /** 빈 문자열 값 → 무시 */
  it("빈 문자열 값은 무시한다", () => {
    const params = new URLSearchParams("direction=&min_price=");
    const filters = parseFiltersFromParams(params);
    expect(filters.direction).toBeUndefined();
    expect(filters.min_price).toBeUndefined();
  });

  /** sort_by 유효한 값 → 포함 */
  it("유효한 sort_by 값을 파싱한다", () => {
    const params = new URLSearchParams("sort_by=price_asc");
    const filters = parseFiltersFromParams(params);
    expect(filters.sort_by).toBe("price_asc");
  });

  /** sort_by 기본값 "rank" → 제외 */
  it("sort_by=rank는 기본값이므로 제외한다", () => {
    const params = new URLSearchParams("sort_by=rank");
    const filters = parseFiltersFromParams(params);
    expect(filters.sort_by).toBeUndefined();
  });

  /** sort_by 유효하지 않은 값 → 무시 */
  it("유효하지 않은 sort_by 값은 무시한다", () => {
    const params = new URLSearchParams("sort_by=invalid_value");
    const filters = parseFiltersFromParams(params);
    expect(filters.sort_by).toBeUndefined();
  });

  /** FILTER_KEYS에 없는 파라미터 → 무시 */
  it("알 수 없는 파라미터는 무시한다", () => {
    const params = new URLSearchParams("unknown_key=value&page=3&page_size=100");
    const filters = parseFiltersFromParams(params);
    expect((filters as Record<string, unknown>)["unknown_key"]).toBeUndefined();
    expect(filters.page).toBeUndefined();
  });
});

// ── parsePageFromParams 테스트 ──

describe("parsePageFromParams", () => {
  /** page 파라미터 정상 파싱 */
  it("page 파라미터를 정수로 파싱한다", () => {
    expect(parsePageFromParams(new URLSearchParams("page=5"))).toBe(5);
  });

  /** page 없으면 기본값 1 */
  it("page가 없으면 1을 반환한다", () => {
    expect(parsePageFromParams(new URLSearchParams())).toBe(1);
  });

  /** 유효하지 않은 page → 1 */
  it("유효하지 않은 page 값은 1을 반환한다", () => {
    expect(parsePageFromParams(new URLSearchParams("page=abc"))).toBe(1);
    expect(parsePageFromParams(new URLSearchParams("page=-1"))).toBe(1);
    expect(parsePageFromParams(new URLSearchParams("page=0"))).toBe(1);
  });
});

// ── filtersToParams 테스트 ──

describe("filtersToParams", () => {
  /** 필터 → URLSearchParams 변환 */
  it("필터 값을 URLSearchParams로 변환한다", () => {
    const filters: ArticleFilters = {
      min_price: 50000,
      direction: "남향",
      verified_only: true,
    };
    const params = filtersToParams(filters);

    expect(params.get("min_price")).toBe("50000");
    expect(params.get("direction")).toBe("남향");
    expect(params.get("verified_only")).toBe("true");
  });

  /** 기본값/비활성 값은 URL에서 제외 */
  it("기본값(전체/all/rank/0/false/undefined)은 제외한다", () => {
    const filters: ArticleFilters = {
      trade_types: "전체",
      estate_type: "all",
      sort_by: "rank",
      min_price: 0,
      verified_only: false,
      direction: undefined,
    };
    const params = filtersToParams(filters);

    expect(params.toString()).toBe("");
  });

  /** sort_by 비기본값은 포함 */
  it("sort_by가 rank가 아니면 URL에 포함한다", () => {
    const filters: ArticleFilters = { sort_by: "price_desc" };
    const params = filtersToParams(filters);
    expect(params.get("sort_by")).toBe("price_desc");
  });

  /** 빈 필터 → 빈 파라미터 */
  it("빈 필터 객체는 빈 파라미터를 반환한다", () => {
    const params = filtersToParams({});
    expect(params.toString()).toBe("");
  });
});

// ── buildFilterURL 테스트 ──

describe("buildFilterURL", () => {
  /** 경로만 전달 */
  it("필터 없이 경로만 반환한다", () => {
    expect(buildFilterURL("/complex/123")).toBe("/complex/123");
  });

  /** 경로 + 필터 */
  it("경로와 필터를 합쳐 URL을 생성한다", () => {
    const url = buildFilterURL("/complex/123", undefined, { min_price: 50000 });
    expect(url).toBe("/complex/123?min_price=50000");
  });

  /** 경로 + extra + 필터 */
  it("extra 파라미터와 필터를 함께 포함한다", () => {
    const url = buildFilterURL("/search", { q: "강남" }, { trade_types: "매매" });
    expect(url).toContain("q=%EA%B0%95%EB%82%A8");
    expect(url).toContain("trade_types=%EB%A7%A4%EB%A7%A4");
  });
});

// ── 왕복 변환(roundtrip) 테스트 ──

describe("roundtrip: filtersToParams → parseFiltersFromParams", () => {
  /** 필터 → URL → 필터 왕복 일관성 */
  it("필터를 URL로 변환 후 다시 파싱하면 원본과 동일하다", () => {
    const original: ArticleFilters = {
      trade_types: "매매",
      min_price: 30000,
      max_price: 100000,
      min_area_m2: 59.5,
      max_area_m2: 134.2,
      verified_only: true,
      sort_by: "price_asc",
      min_rooms: 2,
      direction: "남향",
    };

    const params = filtersToParams(original);
    const restored = parseFiltersFromParams(params);

    expect(restored).toEqual(original);
  });

  /** 기본값만 있는 필터 → 빈 URL → 빈 필터 */
  it("기본값 필터는 빈 URL을 거쳐 빈 객체로 복원된다", () => {
    const defaultFilters: ArticleFilters = {
      trade_types: "전체",
      sort_by: "rank",
      verified_only: false,
      min_price: 0,
    };

    const params = filtersToParams(defaultFilters);
    expect(params.toString()).toBe("");

    const restored = parseFiltersFromParams(params);
    expect(restored).toEqual({});
  });
});
