"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useCallback, useMemo } from "react";
import type { ArticleFilters, SortBy } from "@/types";

/** URL에 저장할 필터 키 (page/page_size/selected_articles 제외) */
const FILTER_KEYS: (keyof ArticleFilters)[] = [
  "trade_types", "min_price", "max_price", "min_rent", "max_rent",
  "min_area_m2", "max_area_m2", "min_rooms", "min_baths", "direction",
  "min_ppyeong", "max_ppyeong", "min_maintenance", "max_maintenance",
  "building_name", "verified_only", "max_building_age", "move_in_type",
  "estate_type", "min_floor", "max_floor", "tags",
  "min_yield", "max_yield", "sort_by",
];

const INT_KEYS = new Set<string>([
  "min_price", "max_price", "min_rent", "max_rent", "min_rooms", "min_baths",
  "min_ppyeong", "max_ppyeong", "min_maintenance", "max_maintenance",
  "max_building_age", "min_floor", "max_floor",
]);
const FLOAT_KEYS = new Set<string>(["min_area_m2", "max_area_m2", "min_yield", "max_yield"]);
const BOOL_KEYS = new Set<string>(["verified_only"]);

/** 유효한 sort_by 값 (백엔드 Literal과 동기화) */
const VALID_SORT_BY = new Set<string>([
  "rank", "price_asc", "price_desc", "area_asc", "area_desc",
  "ppyeong_asc", "ppyeong_desc", "maintenance_asc", "maintenance_desc",
  "confirm_asc", "confirm_desc",
]);

/** URL searchParams → ArticleFilters */
export function parseFiltersFromParams(params: URLSearchParams): ArticleFilters {
  const filters: ArticleFilters = {};
  for (const key of FILTER_KEYS) {
    const val = params.get(key);
    if (val === null || val === "") continue;
    if (key === "sort_by") {
      if (VALID_SORT_BY.has(val) && val !== "rank") {
        (filters as Record<string, unknown>)[key] = val;
      }
      continue;
    }
    if (INT_KEYS.has(key)) {
      const n = parseInt(val, 10);
      if (!isNaN(n)) (filters as Record<string, unknown>)[key] = n;
    } else if (FLOAT_KEYS.has(key)) {
      const n = parseFloat(val);
      if (!isNaN(n)) (filters as Record<string, unknown>)[key] = n;
    } else if (BOOL_KEYS.has(key)) {
      (filters as Record<string, unknown>)[key] = val === "true";
    } else {
      (filters as Record<string, unknown>)[key] = val;
    }
  }
  return filters;
}

/** URL searchParams → page 번호 (기본 1) */
export function parsePageFromParams(params: URLSearchParams): number {
  const val = params.get("page");
  if (!val) return 1;
  const n = parseInt(val, 10);
  return isNaN(n) || n < 1 ? 1 : n;
}

/** ArticleFilters → URLSearchParams (비어있는 값 제외) */
export function filtersToParams(filters: ArticleFilters): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const val = (filters as Record<string, unknown>)[key];
    if (val === undefined || val === null || val === "" || val === false || val === 0) continue;
    if (val === "전체" || val === "all" || val === "rank") continue;
    params.set(key, String(val));
  }
  return params;
}

/** 경로 + 기존 params + 필터 params를 합쳐 URL 생성 */
export function buildFilterURL(
  path: string,
  extra?: Record<string, string>,
  filters?: ArticleFilters,
): string {
  const params = new URLSearchParams();
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v) params.set(k, v);
    }
  }
  if (filters) {
    const filterParams = filtersToParams(filters);
    filterParams.forEach((v, k) => params.set(k, v));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

/** URL 쿼리 파라미터에서 필터·페이지·정렬을 읽고 변경하는 훅 */
export function useFilterParams() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const filters = useMemo(
    () => parseFiltersFromParams(searchParams),
    [searchParams],
  );

  const page = useMemo(
    () => parsePageFromParams(searchParams),
    [searchParams],
  );

  const sortBy: SortBy = (filters.sort_by as SortBy) ?? "rank";

  /** URL을 교체하는 내부 헬퍼 */
  const replaceURL = useCallback(
    (params: URLSearchParams) => {
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  /** 필터 변경 → URL 업데이트 (page는 1로 리셋) */
  const setFilters = useCallback(
    (newFilters: ArticleFilters) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const key of FILTER_KEYS) params.delete(key);
      params.delete("page");
      const filterParams = filtersToParams(newFilters);
      filterParams.forEach((v, k) => params.set(k, v));
      replaceURL(params);
    },
    [searchParams, replaceURL],
  );

  /** 페이지 변경 → URL 업데이트 */
  const setPage = useCallback(
    (newPage: number) => {
      const params = new URLSearchParams(searchParams.toString());
      if (newPage > 1) params.set("page", String(newPage));
      else params.delete("page");
      replaceURL(params);
    },
    [searchParams, replaceURL],
  );

  /** 정렬 변경 → URL 업데이트 (page는 1로 리셋) */
  const setSortBy = useCallback(
    (newSortBy: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("page");
      if (newSortBy && newSortBy !== "rank") {
        params.set("sort_by", newSortBy);
      } else {
        params.delete("sort_by");
      }
      replaceURL(params);
    },
    [searchParams, replaceURL],
  );

  /** URL 쿼리 문자열 (변경 감지용) */
  const filterKey = searchParams.toString();

  return { filters, page, sortBy, setFilters, setPage, setSortBy, buildURL: buildFilterURL, filterKey };
}
