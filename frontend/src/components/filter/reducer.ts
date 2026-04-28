/**
 * FilterBar 상태 관리 — 타입, 리듀서, 상수
 */
import type { ArticleFilters } from "@/types";
import { convertArea } from "@/lib/constants";

// ── 타입 ──

export interface FilterState {
  tradeType: string;
  minPrice: string;
  maxPrice: string;
  minRent: string;
  maxRent: string;
  areaUnit: string;
  minArea: string;
  maxArea: string;
  minRooms: string;
  minBaths: string;
  direction: string;
  minPpyeong: string;
  maxPpyeong: string;
  minMaint: string;
  maxMaint: string;
  buildingAge: string;
  moveInType: string;
  estateType: string;
  verifiedOnly: string;
  buildingName: string;
  floorPreset: string;
  minYield: string;
  maxYield: string;
  sortBy: string;
  /** 선택된 태그 쉼표 문자열 (예: "복층,테라스"). 빈 문자열이면 미적용 */
  tags: string;
}

export type FilterAction =
  | { type: "SET"; key: keyof FilterState; value: string }
  | { type: "SET_MULTI"; updates: Partial<FilterState> }
  | { type: "SET_AREA_UNIT"; value: "m²" | "평" }
  | { type: "RESET" };

export type FilterChip = { label: string; reset: () => void };

// ── 상수 ──

export const DEFAULT_STATE: FilterState = {
  tradeType: "전체",
  minPrice: "", maxPrice: "",
  minRent: "", maxRent: "",
  areaUnit: "m²",
  minArea: "", maxArea: "",
  minRooms: "0", minBaths: "0",
  direction: "전체",
  minPpyeong: "", maxPpyeong: "",
  minMaint: "", maxMaint: "",
  buildingAge: "0", moveInType: "전체",
  estateType: "all", verifiedOnly: "false",
  buildingName: "전체", floorPreset: "전체",
  minYield: "", maxYield: "",
  sortBy: "rank",
  tags: "",
};

// ── 리듀서 ──

export function filterReducer(state: FilterState, action: FilterAction): FilterState {
  switch (action.type) {
    case "SET":
      return { ...state, [action.key]: action.value };
    case "SET_MULTI":
      return { ...state, ...action.updates };
    case "SET_AREA_UNIT": {
      if (state.areaUnit === action.value) return state;
      const from = state.areaUnit as "m²" | "평";
      return {
        ...state,
        areaUnit: action.value,
        minArea: convertArea(state.minArea, from, action.value),
        maxArea: convertArea(state.maxArea, from, action.value),
      };
    }
    case "RESET":
      return { ...DEFAULT_STATE };
    default:
      return state;
  }
}

// ── 초기값 역파싱 ──

function _initStr(v: number | undefined): string { return v ? String(v) : ""; }

export function buildInitState(init?: ArticleFilters): FilterState {
  return {
    ...DEFAULT_STATE,
    tradeType: init?.trade_types || "전체",
    minPrice: _initStr(init?.min_price),
    maxPrice: _initStr(init?.max_price),
    minRent: _initStr(init?.min_rent),
    maxRent: _initStr(init?.max_rent),
    minArea: _initStr(init?.min_area_m2),
    maxArea: _initStr(init?.max_area_m2),
    minRooms: init?.min_rooms ? String(init.min_rooms) : "0",
    minBaths: init?.min_baths ? String(init.min_baths) : "0",
    direction: init?.direction || "전체",
    minPpyeong: _initStr(init?.min_ppyeong),
    maxPpyeong: _initStr(init?.max_ppyeong),
    minMaint: _initStr(init?.min_maintenance),
    maxMaint: _initStr(init?.max_maintenance),
    buildingAge: init?.max_building_age ? String(init.max_building_age) : "0",
    moveInType: init?.move_in_type || "전체",
    estateType: init?.estate_type || "all",
    verifiedOnly: init?.verified_only ? "true" : "false",
    buildingName: init?.building_name || "전체",
    minYield: _initStr(init?.min_yield),
    maxYield: _initStr(init?.max_yield),
    tags: init?.tags ?? "",
  };
}
