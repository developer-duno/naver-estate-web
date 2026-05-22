import type { FilterState } from "./reducer";
import { SORT_OPTIONS } from "@/lib/constants";

export function calcDetailActive(s: FilterState): number {
  let count = 0;
  if (s.buildingName !== "전체") count++;
  if (s.direction !== "전체") count++;
  if (s.buildingAge !== "0") count++;
  if (s.verifiedOnly === "true") count++;
  if (s.tags && s.tags.split(",").filter(Boolean).length > 0) count++;
  if (s.sortBy !== "rank" && SORT_OPTIONS.some((o) => o.v === s.sortBy)) count++;
  if (s.estateType !== "all") count++;
  if (s.minMaint || s.maxMaint) count++;
  if (s.minYield || s.maxYield) count++;
  return count;
}

export function activeFilterCount(s: FilterState): number {
  let count = 0;
  if (s.tradeType !== "전체") count++;
  if (s.minPrice || s.maxPrice || s.minRent || s.maxRent || s.minPpyeong || s.maxPpyeong) count++;
  if (s.minArea || s.maxArea) count++;
  if (s.floorPreset !== "전체") count++;
  if (s.moveInType !== "전체") count++;
  if (s.minRooms !== "0" || s.minBaths !== "0") count++;
  count += calcDetailActive(s);
  return count;
}

export function activeFilterCountImmediate(s: FilterState): number {
  let count = 0;
  if (s.tradeType !== "전체") count++;
  if (s.floorPreset !== "전체") count++;
  if (s.moveInType !== "전체") count++;
  if (s.minRooms !== "0" || s.minBaths !== "0") count++;
  if (s.buildingName !== "전체") count++;
  if (s.direction !== "전체") count++;
  if (s.buildingAge !== "0") count++;
  if (s.verifiedOnly === "true") count++;
  if (s.tags && s.tags.split(",").filter(Boolean).length > 0) count++;
  if (s.sortBy !== "rank" && SORT_OPTIONS.some((o) => o.v === s.sortBy)) count++;
  if (s.estateType !== "all") count++;
  return count;
}
