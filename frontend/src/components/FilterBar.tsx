"use client";

import { useReducer, useState, useCallback, useRef, useEffect, memo } from "react";
import type { ArticleFilters, FilterOptions } from "@/types";
import { DEBOUNCE_MS, SORT_OPTIONS, type RangePreset } from "@/lib/constants";
import FilterDropdown from "./FilterDropdown";
import { filterReducer, buildInitState, type FilterState } from "./filter/reducer";
import { buildArticleFilters } from "./filter/emitFilters";
import { TradeTypeSection, PriceSection, AreaSection, FloorSection, MoveInSection, RoomSection, DetailSection } from "./filter/FilterSections";
import FilterChips from "./filter/FilterChips";
import HintIcon from "./HintIcon";

interface Props {
  onChange: (filters: ArticleFilters) => void;
  filterOptions?: FilterOptions;
  sortBy?: string;
  onSortChange?: (sortBy: string) => void;
  initialFilters?: ArticleFilters;
}

export default memo(function FilterBar({ onChange, filterOptions, sortBy: externalSortBy, onSortChange, initialFilters: init }: Props) {
  const [s, dispatch] = useReducer(filterReducer, init, buildInitState);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const toggle = (name: string) => setOpenDropdown((prev) => (prev === name ? null : name));

  // Sync external sortBy (from table column click)
  const sortByRef = useRef(s.sortBy);
  useEffect(() => { sortByRef.current = s.sortBy; }, [s.sortBy]);
  useEffect(() => {
    if (externalSortBy !== undefined && externalSortBy !== sortByRef.current) {
      dispatch({ type: "SET", key: "sortBy", value: externalSortBy });
    }
  }, [externalSortBy]);

  // ── emitChange ──
  const emitChange = useCallback(
    (overrides: Partial<Record<string, string>> = {}) => {
      onChange(buildArticleFilters(s, overrides));
    },
    [s, onChange]
  );

  const emitChangeRef = useRef(emitChange);
  useEffect(() => { emitChangeRef.current = emitChange; }, [emitChange]);

  // ── 디바운스 ──
  const debounceMapRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  useEffect(() => {
    const map = debounceMapRef.current;
    return () => { Object.values(map).forEach(clearTimeout); };
  }, []);

  const setImmediate = (key: keyof FilterState) => (v: string) => {
    dispatch({ type: "SET", key, value: v });
    if (key === "sortBy" && onSortChange) {
      onSortChange(v);
      return;
    }
    emitChange({ [key]: v });
  };

  const setDebounced = (key: keyof FilterState) => (v: string) => {
    dispatch({ type: "SET", key, value: v });
    if (debounceMapRef.current[key]) clearTimeout(debounceMapRef.current[key]);
    debounceMapRef.current[key] = setTimeout(() => emitChangeRef.current({ [key]: v }), DEBOUNCE_MS);
  };

  const applyPreset = (preset: RangePreset, minKey: keyof FilterState, maxKey: keyof FilterState) => {
    const minVal = preset.min !== undefined ? String(preset.min) : "";
    const maxVal = preset.max !== undefined ? String(preset.max) : "";
    dispatch({ type: "SET_MULTI", updates: { [minKey]: minVal, [maxKey]: maxVal } });
    emitChange({ [minKey]: minVal, [maxKey]: maxVal });
  };

  const resetAll = () => {
    dispatch({ type: "RESET" });
    if (onSortChange) onSortChange("rank");
    onChange({});
    setOpenDropdown(null);
  };

  // ── 버튼 요약 텍스트 ──
  const priceSummary = s.minPrice || s.maxPrice ? `${s.minPrice || "0"}~${s.maxPrice || "∞"}만` : undefined;
  const areaSummary = s.minArea || s.maxArea ? `${s.minArea || "0"}~${s.maxArea || "∞"}${s.areaUnit}` : undefined;
  const floorSummary = s.floorPreset !== "전체" ? s.floorPreset : undefined;
  const roomSummary = s.minRooms !== "0" || s.minBaths !== "0"
    ? [s.minRooms !== "0" ? `${s.minRooms}방+` : "", s.minBaths !== "0" ? `${s.minBaths}욕실+` : ""].filter(Boolean).join(" ")
    : undefined;

  const detailParts: string[] = [];
  if (s.buildingName !== "전체") detailParts.push(s.buildingName);
  if (s.direction !== "전체") detailParts.push(s.direction);
  if (s.buildingAge !== "0") detailParts.push(s.buildingAge + "년");
  if (s.verifiedOnly === "true") detailParts.push("인증");
  if (s.sortBy !== "rank") {
    const sortLabel = SORT_OPTIONS.find((o) => o.v === s.sortBy)?.l;
    if (sortLabel) detailParts.push(sortLabel);
  }
  const detailSummary = detailParts.length > 0 ? detailParts.join(", ") : undefined;

  // ── 공통 핸들러 props ──
  const sectionProps = { s, setImmediate, setDebounced, applyPreset, dispatch, emitChange };

  return (
    <div className="bg-white rounded-lg shadow-sm border p-3 space-y-2">
      {/* ── 툴바 버튼 행 ── */}
      <div className="flex flex-wrap items-center gap-1.5">
        <HintIcon text="거래유형, 가격, 면적 등으로 매물을 필터링합니다" className="mr-0.5" />
        <FilterDropdown label="거래유형" isActive={s.tradeType !== "전체"} summary={s.tradeType !== "전체" ? s.tradeType : undefined} isOpen={openDropdown === "trade"} onToggle={() => toggle("trade")}>
          <TradeTypeSection s={s} setImmediate={setImmediate} />
        </FilterDropdown>

        <FilterDropdown label="가격" isActive={!!(s.minPrice || s.maxPrice || s.minRent || s.maxRent || s.minPpyeong || s.maxPpyeong)} summary={priceSummary} isOpen={openDropdown === "price"} onToggle={() => toggle("price")}>
          <PriceSection s={s} setDebounced={setDebounced} applyPreset={applyPreset} />
        </FilterDropdown>

        <FilterDropdown label="면적" isActive={!!(s.minArea || s.maxArea)} summary={areaSummary} isOpen={openDropdown === "area"} onToggle={() => toggle("area")}>
          <AreaSection {...sectionProps} />
        </FilterDropdown>

        <FilterDropdown label="층수" isActive={s.floorPreset !== "전체"} summary={floorSummary} isOpen={openDropdown === "floor"} onToggle={() => toggle("floor")}>
          <FloorSection s={s} setImmediate={setImmediate} />
        </FilterDropdown>

        <FilterDropdown label="입주" isActive={s.moveInType !== "전체"} summary={s.moveInType !== "전체" ? s.moveInType : undefined} isOpen={openDropdown === "movein"} onToggle={() => toggle("movein")}>
          <MoveInSection s={s} setImmediate={setImmediate} />
        </FilterDropdown>

        <FilterDropdown label="방/욕실" isActive={s.minRooms !== "0" || s.minBaths !== "0"} summary={roomSummary} isOpen={openDropdown === "room"} onToggle={() => toggle("room")}>
          <RoomSection s={s} setImmediate={setImmediate} />
        </FilterDropdown>

        <FilterDropdown label="상세" isActive={!!(detailSummary)} summary={detailSummary && detailSummary.length > 12 ? detailSummary.slice(0, 12) + ".." : detailSummary} isOpen={openDropdown === "detail"} onToggle={() => toggle("detail")}>
          <DetailSection {...sectionProps} filterOptions={filterOptions} />
        </FilterDropdown>

        <button onClick={resetAll} className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded hover:bg-gray-50 whitespace-nowrap">
          초기화
        </button>
      </div>

      {/* ── 활성 필터 칩 ── */}
      <FilterChips s={s} setImmediate={setImmediate} dispatch={dispatch} emitChange={emitChange} resetAll={resetAll} />
    </div>
  );
});
