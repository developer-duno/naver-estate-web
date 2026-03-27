"use client";

import { useReducer, useState, useCallback, useRef, useEffect, memo } from "react";
import type { ArticleFilters, FilterOptions, SortBy } from "@/types";
import {
  M2_TO_PYEONG, FLOOR_PRESETS, DEBOUNCE_MS, SORT_OPTIONS,
  BUILDING_AGE_OPTIONS, MOVE_IN_OPTIONS,
  PRICE_PRESETS, AREA_PRESETS, AREA_PRESETS_PYEONG, MAINTENANCE_PRESETS, PPYEONG_PRESETS,
  ESTATE_TYPE_FILTER_OPTIONS,
  type RangePreset,
} from "@/lib/constants";
import FilterDropdown from "./FilterDropdown";

interface Props {
  onChange: (filters: ArticleFilters) => void;
  filterOptions?: FilterOptions;
  sortBy?: string;
  onSortChange?: (sortBy: string) => void;
  initialFilters?: ArticleFilters;
}

type FilterChip = { label: string; reset: () => void };

/** ArticleFilters → FilterBar 내부 상태 초기값 역파싱 */
function _initStr(v: number | undefined): string { return v ? String(v) : ""; }

// ── useReducer 타입 정의 ──

interface FilterState {
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
  sortBy: string;
}

type FilterAction =
  | { type: "SET"; key: keyof FilterState; value: string }
  | { type: "SET_MULTI"; updates: Partial<FilterState> }
  | { type: "RESET" };

const DEFAULT_STATE: FilterState = {
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
  sortBy: "rank",
};

function filterReducer(state: FilterState, action: FilterAction): FilterState {
  switch (action.type) {
    case "SET":
      return { ...state, [action.key]: action.value };
    case "SET_MULTI":
      return { ...state, ...action.updates };
    case "RESET":
      return { ...DEFAULT_STATE };
    default:
      return state;
  }
}

function buildInitState(init?: ArticleFilters): FilterState {
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
  };
}

/** 프리셋 버튼 목록 — 가격·면적·평당가·관리비 드롭다운에서 공통 사용 */
function PresetButtons({ presets, minKey, maxKey, currentMin, currentMax, onApply, size = "py-1" }: {
  presets: readonly RangePreset[];
  minKey: keyof FilterState;
  maxKey: keyof FilterState;
  currentMin: string;
  currentMax: string;
  onApply: (p: RangePreset, minK: keyof FilterState, maxK: keyof FilterState) => void;
  size?: string;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {presets.map((p) => {
        const isActive =
          (p.min !== undefined ? String(p.min) : "") === currentMin &&
          (p.max !== undefined ? String(p.max) : "") === currentMax;
        return (
          <button
            key={p.label}
            onClick={() => onApply(p, minKey, maxKey)}
            className={`px-2 ${size} text-xs border rounded ${
              isActive
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-gray-50 border-gray-300 text-gray-600 hover:bg-blue-50"
            }`}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

export default memo(function FilterBar({ onChange, filterOptions, sortBy: externalSortBy, onSortChange, initialFilters: init }: Props) {
  // ── useReducer로 21개 필터 상태 통합 ──
  const [s, dispatch] = useReducer(filterReducer, init, buildInitState);

  // 드롭다운 열림 상태 (UI 전용, reducer 미포함)
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const toggle = (name: string) => setOpenDropdown((prev) => (prev === name ? null : name));

  // Sync external sortBy (from table column click)
  const sortByRef = useRef(s.sortBy);
  sortByRef.current = s.sortBy;

  useEffect(() => {
    if (externalSortBy !== undefined && externalSortBy !== sortByRef.current) {
      dispatch({ type: "SET", key: "sortBy", value: externalSortBy });
    }
  }, [externalSortBy]);

  // ── emitChange ──
  const emitChange = useCallback(
    (overrides: Partial<Record<string, string>> = {}) => {
      const get = (key: keyof FilterState, fallback?: string) => overrides[key] ?? fallback ?? s[key];

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

      const sb = get("sortBy");
      if (sb !== "rank") filters.sort_by = sb as SortBy;

      onChange(filters);
    },
    [s, onChange]
  );

  // ── 디바운스 ──
  const emitChangeRef = useRef(emitChange);
  emitChangeRef.current = emitChange;

  const debounceMapRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  useEffect(() => {
    return () => { Object.values(debounceMapRef.current).forEach(clearTimeout); };
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

  // ── 프리셋 적용 ──
  const applyPreset = (preset: RangePreset, minKey: keyof FilterState, maxKey: keyof FilterState) => {
    const minVal = preset.min !== undefined ? String(preset.min) : "";
    const maxVal = preset.max !== undefined ? String(preset.max) : "";
    dispatch({ type: "SET_MULTI", updates: { [minKey]: minVal, [maxKey]: maxVal } });
    emitChange({ [minKey]: minVal, [maxKey]: maxVal });
  };

  // ── 초기화 ──
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

  const selectCls = "border border-gray-300 rounded px-2 py-1.5 text-xs bg-white w-full";
  const inputCls = "border border-gray-300 rounded px-2 py-1.5 text-xs w-full";
  const sectionLabel = "text-xs font-bold text-gray-700 mb-1";
  const separator = "border-t border-gray-200 my-2";

  return (
    <div className="bg-white rounded-lg shadow-sm border p-3 space-y-2">
      {/* ── 툴바 버튼 행 ── */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* 거래유형 */}
        <FilterDropdown
          label="거래유형"
          isActive={s.tradeType !== "전체"}
          summary={s.tradeType !== "전체" ? s.tradeType : undefined}
          isOpen={openDropdown === "trade"}
          onToggle={() => toggle("trade")}
        >
          <p className={sectionLabel}>거래유형 선택</p>
          <div className="flex flex-wrap gap-1 mt-1">
            {["전체", "매매", "전세", "월세", "단기임대"].map((t) => (
              <button
                key={t}
                onClick={() => setImmediate("tradeType")(t)}
                className={`px-2 py-1 text-xs border rounded ${
                  s.tradeType === t
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-gray-50 border-gray-300 text-gray-600 hover:bg-blue-50"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </FilterDropdown>

        {/* 가격 */}
        <FilterDropdown
          label="가격"
          isActive={!!(s.minPrice || s.maxPrice || s.minRent || s.maxRent || s.minPpyeong || s.maxPpyeong)}
          summary={priceSummary}
          isOpen={openDropdown === "price"}
          onToggle={() => toggle("price")}
        >
          <p className={sectionLabel}>빠른 선택 (매매가)</p>
          <div className="mb-2">
            <PresetButtons presets={PRICE_PRESETS} minKey="minPrice" maxKey="maxPrice"
              currentMin={s.minPrice} currentMax={s.maxPrice} onApply={applyPreset} />
          </div>
          <div className={separator} />
          <p className={sectionLabel}>가격 직접입력 (만원)</p>
          <div className="flex items-center gap-1 mb-2">
            <input type="number" min="0" value={s.minPrice} onChange={(e) => setDebounced("minPrice")(e.target.value)} className={inputCls} placeholder="최소" />
            <span className="text-xs text-gray-400">~</span>
            <input type="number" min="0" value={s.maxPrice} onChange={(e) => setDebounced("maxPrice")(e.target.value)} className={inputCls} placeholder="최대" />
          </div>

          {(s.tradeType === "월세" || s.tradeType === "단기임대") && (
            <>
              <div className={separator} />
              <p className={sectionLabel}>월세 (만원)</p>
              <div className="flex items-center gap-1 mb-2">
                <input type="number" min="0" value={s.minRent} onChange={(e) => setDebounced("minRent")(e.target.value)} className={inputCls} placeholder="최소" />
                <span className="text-xs text-gray-400">~</span>
                <input type="number" min="0" value={s.maxRent} onChange={(e) => setDebounced("maxRent")(e.target.value)} className={inputCls} placeholder="최대" />
              </div>
            </>
          )}

          <div className={separator} />
          <p className={sectionLabel}>평당가 (만원/평)</p>
          <div className="mb-2">
            <PresetButtons presets={PPYEONG_PRESETS} minKey="minPpyeong" maxKey="maxPpyeong"
              currentMin={s.minPpyeong} currentMax={s.maxPpyeong} onApply={applyPreset} />
          </div>
          <div className="flex items-center gap-1">
            <input type="number" min="0" value={s.minPpyeong} onChange={(e) => setDebounced("minPpyeong")(e.target.value)} className={inputCls} placeholder="최소" />
            <span className="text-xs text-gray-400">~</span>
            <input type="number" min="0" value={s.maxPpyeong} onChange={(e) => setDebounced("maxPpyeong")(e.target.value)} className={inputCls} placeholder="최대" />
          </div>
        </FilterDropdown>

        {/* 면적 */}
        <FilterDropdown
          label="면적"
          isActive={!!(s.minArea || s.maxArea)}
          summary={areaSummary}
          isOpen={openDropdown === "area"}
          onToggle={() => toggle("area")}
        >
          <div className="flex items-center justify-between mb-2">
            <p className={sectionLabel}>전용면적 프리셋</p>
            <button
              onClick={() => { const next = s.areaUnit === "m²" ? "평" : "m²"; dispatch({ type: "SET", key: "areaUnit", value: next }); emitChange({ areaUnit: next }); }}
              className="px-2 py-0.5 text-xs border rounded bg-gray-50 border-gray-300 hover:bg-blue-50"
            >
              {s.areaUnit === "m²" ? "평으로" : "m²으로"}
            </button>
          </div>
          <div className="mb-2">
            <PresetButtons presets={s.areaUnit === "평" ? AREA_PRESETS_PYEONG : AREA_PRESETS}
              minKey="minArea" maxKey="maxArea"
              currentMin={s.minArea} currentMax={s.maxArea} onApply={applyPreset} />
          </div>
          <div className={separator} />
          <p className={sectionLabel}>직접 입력 ({s.areaUnit})</p>
          <div className="flex items-center gap-1">
            <input type="number" min="0" value={s.minArea} onChange={(e) => setDebounced("minArea")(e.target.value)} className={inputCls} placeholder="최소" />
            <span className="text-xs text-gray-400">~</span>
            <input type="number" min="0" value={s.maxArea} onChange={(e) => setDebounced("maxArea")(e.target.value)} className={inputCls} placeholder="최대" />
          </div>
        </FilterDropdown>

        {/* 층수 */}
        <FilterDropdown
          label="층수"
          isActive={s.floorPreset !== "전체"}
          summary={floorSummary}
          isOpen={openDropdown === "floor"}
          onToggle={() => toggle("floor")}
        >
          <p className={sectionLabel}>층수 필터</p>
          <div className="flex flex-wrap gap-1 mt-1">
            {([
              { k: "전체", l: "전체" },
              { k: "저층", l: "저층(1~5)" },
              { k: "중층", l: "중층(6~10)" },
              { k: "고층", l: "고층(11↑)" },
            ] as const).map(({ k, l }) => (
              <button
                key={k}
                onClick={() => setImmediate("floorPreset")(k)}
                className={`px-2 py-1 text-xs border rounded ${
                  s.floorPreset === k
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-gray-50 border-gray-300 text-gray-600 hover:bg-blue-50"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </FilterDropdown>

        {/* 입주 */}
        <FilterDropdown
          label="입주"
          isActive={s.moveInType !== "전체"}
          summary={s.moveInType !== "전체" ? s.moveInType : undefined}
          isOpen={openDropdown === "movein"}
          onToggle={() => toggle("movein")}
        >
          <p className={sectionLabel}>입주가능일</p>
          <div className={separator} />
          {(MOVE_IN_OPTIONS as readonly string[]).map((m) => (
            <label key={m} className="flex items-center gap-2 py-1 text-xs cursor-pointer">
              <input
                type="radio"
                name="moveInType"
                checked={s.moveInType === m}
                onChange={() => setImmediate("moveInType")(m)}
                className="accent-blue-600"
              />
              {m}
            </label>
          ))}
        </FilterDropdown>

        {/* 방/욕실 */}
        <FilterDropdown
          label="방/욕실"
          isActive={s.minRooms !== "0" || s.minBaths !== "0"}
          summary={roomSummary}
          isOpen={openDropdown === "room"}
          onToggle={() => toggle("room")}
        >
          <p className={sectionLabel}>방 수</p>
          <select value={s.minRooms} onChange={(e) => setImmediate("minRooms")(e.target.value)} className={selectCls}>
            <option value="0">전체</option>
            <option value="1">1+</option>
            <option value="2">2+</option>
            <option value="3">3+</option>
            <option value="4">4+</option>
          </select>
          <div className="mt-3">
            <p className={sectionLabel}>욕실 수</p>
            <select value={s.minBaths} onChange={(e) => setImmediate("minBaths")(e.target.value)} className={selectCls}>
              <option value="0">전체</option>
              <option value="1">1+</option>
              <option value="2">2+</option>
            </select>
          </div>
        </FilterDropdown>

        {/* 상세 */}
        <FilterDropdown
          label="상세"
          isActive={!!(detailSummary)}
          summary={detailSummary && detailSummary.length > 12 ? detailSummary.slice(0, 12) + ".." : detailSummary}
          isOpen={openDropdown === "detail"}
          onToggle={() => toggle("detail")}
        >
          <div className="space-y-3 min-w-60">
            {filterOptions && filterOptions.building_names.length > 0 && (
              <div>
                <p className={sectionLabel}>동</p>
                <select value={s.buildingName} onChange={(e) => setImmediate("buildingName")(e.target.value)} className={selectCls}>
                  <option value="전체">전체</option>
                  {filterOptions.building_names.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
            )}
            <div>
              <p className={sectionLabel}>방향</p>
              <select value={s.direction} onChange={(e) => setImmediate("direction")(e.target.value)} className={selectCls}>
                {(filterOptions?.directions?.length ? ["전체", ...filterOptions.directions] : ["전체", "남향", "남동향", "남서향", "동향", "서향", "북향"]).map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div>
              <p className={sectionLabel}>관리비 (만원)</p>
              <div className="mb-1">
                <PresetButtons presets={MAINTENANCE_PRESETS} minKey="minMaint" maxKey="maxMaint"
                  currentMin={s.minMaint} currentMax={s.maxMaint} onApply={applyPreset} size="py-0.5" />
              </div>
              <div className="flex items-center gap-1">
                <input type="number" min="0" value={s.minMaint} onChange={(e) => setDebounced("minMaint")(e.target.value)} className={inputCls} placeholder="최소" />
                <span className="text-xs text-gray-400">~</span>
                <input type="number" min="0" value={s.maxMaint} onChange={(e) => setDebounced("maxMaint")(e.target.value)} className={inputCls} placeholder="최대" />
              </div>
            </div>
            <div>
              <p className={sectionLabel}>준공년도</p>
              <select value={s.buildingAge} onChange={(e) => setImmediate("buildingAge")(e.target.value)} className={selectCls}>
                {(BUILDING_AGE_OPTIONS as readonly { v: string; l: string }[]).map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            </div>
            <div>
              <p className={sectionLabel}>매물유형</p>
              <select value={s.estateType} onChange={(e) => setImmediate("estateType")(e.target.value)} className={selectCls}>
                <option value="all">전체</option>
                {ESTATE_TYPE_FILTER_OPTIONS.map((o) => (
                  <option key={o.code} value={o.code}>{o.label}</option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={s.verifiedOnly === "true"}
                onChange={(e) => { const v = String(e.target.checked); dispatch({ type: "SET", key: "verifiedOnly", value: v }); emitChange({ verifiedOnly: v }); }}
                className="rounded border-gray-300 accent-blue-600"
              />
              인증매물만
            </label>
            <div className={separator} />
            <div>
              <p className={sectionLabel}>정렬</p>
              <select value={s.sortBy} onChange={(e) => setImmediate("sortBy")(e.target.value)} className={selectCls}>
                {(SORT_OPTIONS as readonly { v: string; l: string }[]).map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            </div>
          </div>
        </FilterDropdown>

        {/* 초기화 버튼 */}
        <button onClick={resetAll} className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded hover:bg-gray-50">
          초기화
        </button>
      </div>

      {/* ── 활성 필터 칩 ── */}
      {(() => {
        /** 현재 필터 상태에서 활성 칩 목록 생성 */
        function buildChipList(): FilterChip[] {
          const chips: FilterChip[] = [];
          if (s.tradeType !== "전체") chips.push({ label: s.tradeType, reset: () => setImmediate("tradeType")("전체") });
          if (s.buildingName !== "전체") chips.push({ label: s.buildingName, reset: () => setImmediate("buildingName")("전체") });
          if (s.floorPreset !== "전체") {
            const fl = s.floorPreset === "저층" ? "저층(1-5)" : s.floorPreset === "중층" ? "중층(6-10)" : "고층(11+)";
            chips.push({ label: fl, reset: () => setImmediate("floorPreset")("전체") });
          }
          if (s.direction !== "전체") chips.push({ label: s.direction, reset: () => setImmediate("direction")("전체") });
          if (s.minRooms !== "0") chips.push({ label: s.minRooms + "방+", reset: () => setImmediate("minRooms")("0") });
          if (s.minBaths !== "0") chips.push({ label: s.minBaths + "욕실+", reset: () => setImmediate("minBaths")("0") });
          if (s.buildingAge !== "0") chips.push({ label: s.buildingAge + "년 이내", reset: () => setImmediate("buildingAge")("0") });
          if (s.moveInType !== "전체") chips.push({ label: s.moveInType, reset: () => setImmediate("moveInType")("전체") });
          if (s.estateType !== "all") chips.push({ label: ESTATE_TYPE_FILTER_OPTIONS.find((o) => o.code === s.estateType)?.label ?? s.estateType, reset: () => setImmediate("estateType")("all") });
          if (s.verifiedOnly === "true") chips.push({ label: "인증매물", reset: () => { dispatch({ type: "SET", key: "verifiedOnly", value: "false" }); emitChange({ verifiedOnly: "false" }); } });

          if (s.minPrice) chips.push({ label: `${s.minPrice}만원~`, reset: () => { dispatch({ type: "SET", key: "minPrice", value: "" }); emitChange({ minPrice: "" }); } });
          if (s.maxPrice) chips.push({ label: `~${s.maxPrice}만원`, reset: () => { dispatch({ type: "SET", key: "maxPrice", value: "" }); emitChange({ maxPrice: "" }); } });
          if (s.minRent) chips.push({ label: `월세 ${s.minRent}만~`, reset: () => { dispatch({ type: "SET", key: "minRent", value: "" }); emitChange({ minRent: "" }); } });
          if (s.maxRent) chips.push({ label: `월세 ~${s.maxRent}만`, reset: () => { dispatch({ type: "SET", key: "maxRent", value: "" }); emitChange({ maxRent: "" }); } });
          if (s.minArea) chips.push({ label: `${s.minArea}${s.areaUnit}~`, reset: () => { dispatch({ type: "SET", key: "minArea", value: "" }); emitChange({ minArea: "" }); } });
          if (s.maxArea) chips.push({ label: `~${s.maxArea}${s.areaUnit}`, reset: () => { dispatch({ type: "SET", key: "maxArea", value: "" }); emitChange({ maxArea: "" }); } });
          if (s.minPpyeong) chips.push({ label: `평당 ${s.minPpyeong}만~`, reset: () => { dispatch({ type: "SET", key: "minPpyeong", value: "" }); emitChange({ minPpyeong: "" }); } });
          if (s.maxPpyeong) chips.push({ label: `평당 ~${s.maxPpyeong}만`, reset: () => { dispatch({ type: "SET", key: "maxPpyeong", value: "" }); emitChange({ maxPpyeong: "" }); } });
          if (s.minMaint) chips.push({ label: `관리비 ${s.minMaint}만~`, reset: () => { dispatch({ type: "SET", key: "minMaint", value: "" }); emitChange({ minMaint: "" }); } });
          if (s.maxMaint) chips.push({ label: `관리비 ~${s.maxMaint}만`, reset: () => { dispatch({ type: "SET", key: "maxMaint", value: "" }); emitChange({ maxMaint: "" }); } });
          return chips;
        }

        const chipList = buildChipList();
        if (chipList.length === 0) return null;
        return (
          <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-gray-100">
            {chipList.map((chip) => (
              <span key={chip.label} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs rounded-full px-2.5 py-1 border border-blue-200">
                {chip.label}
                <button onClick={chip.reset} className="hover:text-blue-900 font-bold ml-0.5">×</button>
              </span>
            ))}
            <button onClick={resetAll} className="text-xs text-gray-500 hover:text-gray-700 ml-1">
              전체 초기화
            </button>
          </div>
        );
      })()}
    </div>
  );
});
