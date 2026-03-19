"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useCallback, useMemo } from "react";
import type { ArticleFilters } from "@/types";

/** URL에 저장할 필터 키 (page/page_size/sort_by/selected_articles 제외) */
const FILTER_KEYS: (keyof ArticleFilters)[] = [
  "trade_types", "min_price", "max_price", "min_rent", "max_rent",
  "min_area_m2", "max_area_m2", "min_rooms", "min_baths", "direction",
  "min_ppyeong", "max_ppyeong", "min_maintenance", "max_maintenance",
  "building_name", "verified_only", "max_building_age", "move_in_type",
  "estate_type", "min_floor", "max_floor", "tags",
];

const INT_KEYS = new Set<string>([
  "min_price", "max_price", "min_rent", "max_rent", "min_rooms", "min_baths",
  "min_ppyeong", "max_ppyeong", "min_maintenance", "max_maintenance",
  "max_building_age", "min_floor", "max_floor",
]);
const FLOAT_KEYS = new Set<string>(["min_area_m2", "max_area_m2"]);
const BOOL_KEYS = new Set<string>(["verified_only"]);

/** URL searchParams → ArticleFilters */
export function parseFiltersFromParams(params: URLSearchParams): ArticleFilters {
  const filters: ArticleFilters = {};
  for (const key of FILTER_KEYS) {
    const val = params.get(key);
    if (val === null || val === "") continue;
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

/** ArticleFilters → URLSearchParams (비어있는 값 제외) */
export function filtersToParams(filters: ArticleFilters): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const val = (filters as Record<string, unknown>)[key];
    if (val === undefined || val === null || val === "" || val === false || val === 0) continue;
    if (val === "전체" || val === "all") continue;
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

/** URL 쿼리 파라미터에서 필터를 읽고 변경하는 훅 */
export function useFilterParams() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const filters = useMemo(
    () => parseFiltersFromParams(searchParams),
    [searchParams],
  );

  const setFilters = useCallback(
    (newFilters: ArticleFilters) => {
      const params = new URLSearchParams(searchParams.toString());
      // 기존 필터 키 제거
      for (const key of FILTER_KEYS) params.delete(key);
      // 새 필터 추가
      const filterParams = filtersToParams(newFilters);
      filterParams.forEach((v, k) => params.set(k, v));
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [searchParams, router, pathname],
  );

  return { filters, setFilters, buildURL: buildFilterURL };
}
