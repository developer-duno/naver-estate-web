/**
 * FilterState → ArticleFilters 변환 (순수 함수)
 */
import type { ArticleFilters, SortBy } from "@/types";
import { M2_TO_PYEONG, FLOOR_PRESETS } from "@/lib/constants";
import type { FilterState } from "./reducer";

export function buildArticleFilters(
  s: FilterState,
  overrides: Partial<Record<string, string>> = {},
): ArticleFilters {
  const get = (key: keyof FilterState, fallback?: string) =>
    overrides[key] ?? fallback ?? s[key];

  const filters: ArticleFilters = {};
  const tt = get("tradeType");
  if (tt !== "전체") filters.trade_types = tt;

  const safeNum = (v: string) => { const n = Number(v); return (v && n >= 0) ? n : null; };

  const mp = safeNum(get("minPrice"));
  const xp = safeNum(get("maxPrice"));
  if (mp !== null) filters.min_price = mp;
  if (xp !== null && (mp === null || xp >= mp)) filters.max_price = xp;

  const mr = safeNum(get("minRent"));
  const xr = safeNum(get("maxRent"));
  if (mr !== null) filters.min_rent = mr;
  if (xr !== null && (mr === null || xr >= mr)) filters.max_rent = xr;

  const unit = get("areaUnit");
  const ma = get("minArea");
  const xa = get("maxArea");
  const minAreaVal = ma ? (unit === "평" ? Number(ma) * M2_TO_PYEONG : Number(ma)) : null;
  const maxAreaVal = xa ? (unit === "평" ? Number(xa) * M2_TO_PYEONG : Number(xa)) : null;
  if (minAreaVal !== null && minAreaVal >= 0) filters.min_area_m2 = minAreaVal;
  if (maxAreaVal !== null && maxAreaVal >= 0 && (minAreaVal === null || maxAreaVal >= minAreaVal)) filters.max_area_m2 = maxAreaVal;

  const rooms = get("minRooms");
  if (rooms !== "0") filters.min_rooms = Number(rooms);
  const baths = get("minBaths");
  if (baths !== "0") filters.min_baths = Number(baths);

  const dir = get("direction");
  if (dir !== "전체") filters.direction = dir;

  const mpp = safeNum(get("minPpyeong"));
  const xpp = safeNum(get("maxPpyeong"));
  if (mpp !== null) filters.min_ppyeong = mpp;
  if (xpp !== null && (mpp === null || xpp >= mpp)) filters.max_ppyeong = xpp;

  const mm = safeNum(get("minMaint"));
  const xm = safeNum(get("maxMaint"));
  if (mm !== null) filters.min_maintenance = mm;
  if (xm !== null && (mm === null || xm >= mm)) filters.max_maintenance = xm;

  const age = get("buildingAge");
  if (age !== "0") filters.max_building_age = Number(age);

  const mi = get("moveInType");
  if (mi !== "전체") filters.move_in_type = mi;

  const et = get("estateType");
  if (et !== "all") filters.estate_type = et;

  const vo = get("verifiedOnly");
  if (vo === "true") filters.verified_only = true;

  const bn = get("buildingName");
  if (bn !== "전체") filters.building_name = bn;

  const fp = get("floorPreset");
  const preset = FLOOR_PRESETS[fp];
  if (preset) {
    filters.min_floor = preset.min;
    if (preset.max) filters.max_floor = preset.max;
  }

  const mny = safeNum(get("minYield"));
  const xny = safeNum(get("maxYield"));
  if (mny !== null) filters.min_yield = mny;
  if (xny !== null && (mny === null || xny >= mny)) filters.max_yield = xny;

  const sb = get("sortBy");
  if (sb !== "rank") filters.sort_by = sb as SortBy;

  return filters;
}
