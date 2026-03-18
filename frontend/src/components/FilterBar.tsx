"use client";

import { useState, useCallback, useRef, useEffect, memo } from "react";
import type { ArticleFilters, FilterOptions, SortBy } from "@/types";
import {
  M2_TO_PYEONG, FLOOR_PRESETS, DEBOUNCE_MS, SORT_OPTIONS,
  BUILDING_AGE_OPTIONS, MOVE_IN_OPTIONS,
  PRICE_PRESETS, AREA_PRESETS, MAINTENANCE_PRESETS, PPYEONG_PRESETS,
  type RangePreset,
} from "@/lib/constants";
import FilterDropdown from "./FilterDropdown";

interface Props {
  onChange: (filters: ArticleFilters) => void;
  filterOptions?: FilterOptions;
  sortBy?: string;
  onSortChange?: (sortBy: string) => void;
}

type FilterChip = { label: string; reset: () => void };

export default function FilterBar({ onChange, filterOptions, sortBy: externalSortBy, onSortChange }: Props) {
  // ── 상태 (21개 — 기존과 동일) ──
  const [tradeType, setTradeType] = useState("전체");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [minRent, setMinRent] = useState("");
  const [maxRent, setMaxRent] = useState("");
  const [areaUnit, setAreaUnit] = useState<"m²" | "평">("m²");
  const [minArea, setMinArea] = useState("");
  const [maxArea, setMaxArea] = useState("");
  const [minRooms, setMinRooms] = useState("0");
  const [minBaths, setMinBaths] = useState("0");
  const [direction, setDirection] = useState("전체");
  const [minPpyeong, setMinPpyeong] = useState("");
  const [maxPpyeong, setMaxPpyeong] = useState("");
  const [minMaint, setMinMaint] = useState("");
  const [maxMaint, setMaxMaint] = useState("");
  const [buildingAge, setBuildingAge] = useState("0");
  const [moveInType, setMoveInType] = useState("전체");
  const [estateType, setEstateType] = useState("all");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [buildingName, setBuildingName] = useState("전체");
  const [floorPreset, setFloorPreset] = useState("전체");
  const [sortBy, setSortBy] = useState("rank");

  // 드롭다운 열림 상태
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const toggle = (name: string) => setOpenDropdown((prev) => (prev === name ? null : name));

  // Sync external sortBy (from table column click)
  const sortByRef = useRef(sortBy);
  sortByRef.current = sortBy;

  useEffect(() => {
    if (externalSortBy !== undefined && externalSortBy !== sortByRef.current) {
      setSortBy(externalSortBy);
    }
  }, [externalSortBy]);

  // ── emitChange (기존과 100% 동일) ──
  const emitChange = useCallback(
    (overrides: Partial<Record<string, string>> = {}) => {
      const get = (key: string, fallback: string) => overrides[key] ?? fallback;

      const filters: ArticleFilters = {};
      const tt = get("tradeType", tradeType);
      if (tt !== "전체") filters.trade_types = tt;

      const safeNum = (v: string) => { const n = Number(v); return (v && n >= 0) ? n : null; };

      const mp = safeNum(get("minPrice", minPrice));
      const xp = safeNum(get("maxPrice", maxPrice));
      if (mp !== null) filters.min_price = mp;
      if (xp !== null && (mp === null || xp >= mp)) filters.max_price = xp;

      const mr = safeNum(get("minRent", minRent));
      const xr = safeNum(get("maxRent", maxRent));
      if (mr !== null) filters.min_rent = mr;
      if (xr !== null && (mr === null || xr >= mr)) filters.max_rent = xr;

      const unit = get("areaUnit", areaUnit);
      const ma = get("minArea", minArea);
      const xa = get("maxArea", maxArea);
      const minAreaVal = ma ? (unit === "평" ? Number(ma) * M2_TO_PYEONG : Number(ma)) : null;
      const maxAreaVal = xa ? (unit === "평" ? Number(xa) * M2_TO_PYEONG : Number(xa)) : null;
      if (minAreaVal !== null && minAreaVal >= 0) filters.min_area_m2 = minAreaVal;
      if (maxAreaVal !== null && maxAreaVal >= 0 && (minAreaVal === null || maxAreaVal >= minAreaVal)) filters.max_area_m2 = maxAreaVal;

      const rooms = get("minRooms", minRooms);
      if (rooms !== "0") filters.min_rooms = Number(rooms);
      const baths = get("minBaths", minBaths);
      if (baths !== "0") filters.min_baths = Number(baths);

      const dir = get("direction", direction);
      if (dir !== "전체") filters.direction = dir;

      const mpp = safeNum(get("minPpyeong", minPpyeong));
      const xpp = safeNum(get("maxPpyeong", maxPpyeong));
      if (mpp !== null) filters.min_ppyeong = mpp;
      if (xpp !== null && (mpp === null || xpp >= mpp)) filters.max_ppyeong = xpp;

      const mm = safeNum(get("minMaint", minMaint));
      const xm = safeNum(get("maxMaint", maxMaint));
      if (mm !== null) filters.min_maintenance = mm;
      if (xm !== null && (mm === null || xm >= mm)) filters.max_maintenance = xm;

      const age = get("buildingAge", buildingAge);
      if (age !== "0") filters.max_building_age = Number(age);

      const mi = get("moveInType", moveInType);
      if (mi !== "전체") filters.move_in_type = mi;

      const et = get("estateType", estateType);
      if (et !== "all") filters.estate_type = et;

      const vo = get("verifiedOnly", String(verifiedOnly));
      if (vo === "true") filters.verified_only = true;

      const bn = get("buildingName", buildingName);
      if (bn !== "전체") filters.building_name = bn;

      const fp = get("floorPreset", floorPreset);
      const preset = FLOOR_PRESETS[fp];
      if (preset) {
        filters.min_floor = preset.min;
        if (preset.max) filters.max_floor = preset.max;
      }

      const sb = get("sortBy", sortBy);
      if (sb !== "rank") filters.sort_by = sb as SortBy;

      onChange(filters);
    },
    [
      tradeType, minPrice, maxPrice, minRent, maxRent,
      areaUnit, minArea, maxArea, minRooms, minBaths,
      direction, minPpyeong, maxPpyeong, minMaint, maxMaint,
      buildingAge, moveInType, estateType, verifiedOnly,
      buildingName, floorPreset, sortBy, onChange,
    ]
  );

  // ── 디바운스 (기존과 동일) ──
  const emitChangeRef = useRef(emitChange);
  emitChangeRef.current = emitChange;

  const debounceMapRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  useEffect(() => {
    return () => { Object.values(debounceMapRef.current).forEach(clearTimeout); };
  }, []);

  const setImmediate = (setter: (v: string) => void, key: string) => (v: string) => {
    setter(v);
    if (key === "sortBy" && onSortChange) {
      onSortChange(v);
      return;
    }
    emitChange({ [key]: v });
  };

  const setDebounced = (setter: (v: string) => void, key: string) => (v: string) => {
    setter(v);
    if (debounceMapRef.current[key]) clearTimeout(debounceMapRef.current[key]);
    debounceMapRef.current[key] = setTimeout(() => emitChangeRef.current({ [key]: v }), DEBOUNCE_MS);
  };

  // ── 프리셋 적용 ──
  const applyPreset = (preset: RangePreset, minSetter: (v: string) => void, maxSetter: (v: string) => void, minKey: string, maxKey: string) => {
    const minVal = preset.min !== undefined ? String(preset.min) : "";
    const maxVal = preset.max !== undefined ? String(preset.max) : "";
    minSetter(minVal);
    maxSetter(maxVal);
    emitChange({ [minKey]: minVal, [maxKey]: maxVal });
  };

  // ── 초기화 (기존과 동일) ──
  const resetAll = () => {
    setTradeType("전체");
    setMinPrice(""); setMaxPrice("");
    setMinRent(""); setMaxRent("");
    setAreaUnit("m²"); setMinArea(""); setMaxArea("");
    setMinRooms("0"); setMinBaths("0");
    setDirection("전체");
    setMinPpyeong(""); setMaxPpyeong("");
    setMinMaint(""); setMaxMaint("");
    setBuildingAge("0"); setMoveInType("전체");
    setEstateType("all"); setVerifiedOnly(false);
    setBuildingName("전체"); setFloorPreset("전체");
    setSortBy("rank");
    if (onSortChange) onSortChange("rank");
    onChange({});
    setOpenDropdown(null);
  };

  // ── 버튼 요약 텍스트 (데스크톱 _update_button_labels 패턴) ──
  const priceSummary = minPrice || maxPrice ? `${minPrice || "0"}~${maxPrice || "∞"}만` : undefined;
  const areaSummary = minArea || maxArea ? `${minArea || "0"}~${maxArea || "∞"}${areaUnit}` : undefined;
  const floorSummary = floorPreset !== "전체" ? floorPreset : undefined;
  const roomSummary = minRooms !== "0" || minBaths !== "0"
    ? [minRooms !== "0" ? `${minRooms}방+` : "", minBaths !== "0" ? `${minBaths}욕실+` : ""].filter(Boolean).join(" ")
    : undefined;

  const detailParts: string[] = [];
  if (buildingName !== "전체") detailParts.push(buildingName);
  if (direction !== "전체") detailParts.push(direction);
  if (buildingAge !== "0") detailParts.push(buildingAge + "년");
  if (verifiedOnly) detailParts.push("인증");
  if (sortBy !== "rank") {
    const sortLabel = SORT_OPTIONS.find((s) => s.v === sortBy)?.l;
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
          isActive={tradeType !== "전체"}
          summary={tradeType !== "전체" ? tradeType : undefined}
          isOpen={openDropdown === "trade"}
          onToggle={() => toggle("trade")}
        >
          <p className={sectionLabel}>거래유형 선택</p>
          <div className={separator} />
          {["매매", "전세", "월세", "단기임대"].map((t) => (
            <label key={t} className="flex items-center gap-2 py-1 text-xs cursor-pointer">
              <input
                type="radio"
                name="tradeType"
                checked={tradeType === t}
                onChange={() => setImmediate(setTradeType, "tradeType")(t)}
                className="accent-blue-600"
              />
              {t}
            </label>
          ))}
          <div className={separator} />
          <button
            onClick={() => setImmediate(setTradeType, "tradeType")("전체")}
            className="text-xs text-gray-500 hover:text-gray-700 w-full text-left"
          >
            전체 (해제)
          </button>
        </FilterDropdown>

        {/* 가격 */}
        <FilterDropdown
          label="가격"
          isActive={!!(minPrice || maxPrice || minRent || maxRent || minPpyeong || maxPpyeong)}
          summary={priceSummary}
          isOpen={openDropdown === "price"}
          onToggle={() => toggle("price")}
        >
          <p className={sectionLabel}>빠른 선택 (매매가)</p>
          <div className="flex flex-wrap gap-1 mb-2">
            {PRICE_PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => applyPreset(p, setMinPrice, setMaxPrice, "minPrice", "maxPrice")}
                className={`px-2 py-1 text-xs border rounded ${
                  (p.min !== undefined ? String(p.min) : "") === minPrice &&
                  (p.max !== undefined ? String(p.max) : "") === maxPrice
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-gray-50 border-gray-300 text-gray-600 hover:bg-blue-50"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className={separator} />
          <p className={sectionLabel}>가격 직접입력 (만원)</p>
          <div className="flex items-center gap-1 mb-2">
            <input type="number" min="0" value={minPrice} onChange={(e) => setDebounced(setMinPrice, "minPrice")(e.target.value)} className={inputCls} placeholder="최소" />
            <span className="text-xs text-gray-400">~</span>
            <input type="number" min="0" value={maxPrice} onChange={(e) => setDebounced(setMaxPrice, "maxPrice")(e.target.value)} className={inputCls} placeholder="최대" />
          </div>

          {(tradeType === "월세" || tradeType === "단기임대") && (
            <>
              <div className={separator} />
              <p className={sectionLabel}>월세 (만원)</p>
              <div className="flex items-center gap-1 mb-2">
                <input type="number" min="0" value={minRent} onChange={(e) => setDebounced(setMinRent, "minRent")(e.target.value)} className={inputCls} placeholder="최소" />
                <span className="text-xs text-gray-400">~</span>
                <input type="number" min="0" value={maxRent} onChange={(e) => setDebounced(setMaxRent, "maxRent")(e.target.value)} className={inputCls} placeholder="최대" />
              </div>
            </>
          )}

          <div className={separator} />
          <p className={sectionLabel}>평당가 (만원/평)</p>
          <div className="flex flex-wrap gap-1 mb-2">
            {PPYEONG_PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => applyPreset(p, setMinPpyeong, setMaxPpyeong, "minPpyeong", "maxPpyeong")}
                className={`px-2 py-1 text-xs border rounded ${
                  (p.min !== undefined ? String(p.min) : "") === minPpyeong &&
                  (p.max !== undefined ? String(p.max) : "") === maxPpyeong
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-gray-50 border-gray-300 text-gray-600 hover:bg-blue-50"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <input type="number" min="0" value={minPpyeong} onChange={(e) => setDebounced(setMinPpyeong, "minPpyeong")(e.target.value)} className={inputCls} placeholder="최소" />
            <span className="text-xs text-gray-400">~</span>
            <input type="number" min="0" value={maxPpyeong} onChange={(e) => setDebounced(setMaxPpyeong, "maxPpyeong")(e.target.value)} className={inputCls} placeholder="최대" />
          </div>
        </FilterDropdown>

        {/* 면적 */}
        <FilterDropdown
          label="면적"
          isActive={!!(minArea || maxArea)}
          summary={areaSummary}
          isOpen={openDropdown === "area"}
          onToggle={() => toggle("area")}
        >
          <div className="flex items-center justify-between mb-2">
            <p className={sectionLabel}>전용면적 프리셋</p>
            <button
              onClick={() => { setAreaUnit(areaUnit === "m²" ? "평" : "m²"); emitChange({ areaUnit: areaUnit === "m²" ? "평" : "m²" }); }}
              className="px-2 py-0.5 text-xs border rounded bg-gray-50 border-gray-300 hover:bg-blue-50"
            >
              {areaUnit === "m²" ? "평으로" : "m²으로"}
            </button>
          </div>
          <div className="flex flex-wrap gap-1 mb-2">
            {AREA_PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => applyPreset(p, setMinArea, setMaxArea, "minArea", "maxArea")}
                className={`px-2 py-1 text-xs border rounded ${
                  (p.min !== undefined ? String(p.min) : "") === minArea &&
                  (p.max !== undefined ? String(p.max) : "") === maxArea
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-gray-50 border-gray-300 text-gray-600 hover:bg-blue-50"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className={separator} />
          <p className={sectionLabel}>직접 입력 ({areaUnit})</p>
          <div className="flex items-center gap-1">
            <input type="number" min="0" value={minArea} onChange={(e) => setDebounced(setMinArea, "minArea")(e.target.value)} className={inputCls} placeholder="최소" />
            <span className="text-xs text-gray-400">~</span>
            <input type="number" min="0" value={maxArea} onChange={(e) => setDebounced(setMaxArea, "maxArea")(e.target.value)} className={inputCls} placeholder="최대" />
          </div>
        </FilterDropdown>

        {/* 층수 */}
        <FilterDropdown
          label="층수"
          isActive={floorPreset !== "전체"}
          summary={floorSummary}
          isOpen={openDropdown === "floor"}
          onToggle={() => toggle("floor")}
        >
          <p className={sectionLabel}>층수 필터</p>
          <div className={separator} />
          {["전체", "저층", "중층", "고층"].map((f) => (
            <label key={f} className="flex items-center gap-2 py-1 text-xs cursor-pointer">
              <input
                type="radio"
                name="floorPreset"
                checked={floorPreset === f}
                onChange={() => setImmediate(setFloorPreset, "floorPreset")(f)}
                className="accent-blue-600"
              />
              {f === "저층" ? "저층 (1~5층)" : f === "중층" ? "중층 (6~10층)" : f === "고층" ? "고층 (11층↑)" : f}
            </label>
          ))}
        </FilterDropdown>

        {/* 입주 */}
        <FilterDropdown
          label="입주"
          isActive={moveInType !== "전체"}
          summary={moveInType !== "전체" ? moveInType : undefined}
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
                checked={moveInType === m}
                onChange={() => setImmediate(setMoveInType, "moveInType")(m)}
                className="accent-blue-600"
              />
              {m}
            </label>
          ))}
        </FilterDropdown>

        {/* 방/욕실 */}
        <FilterDropdown
          label="방/욕실"
          isActive={minRooms !== "0" || minBaths !== "0"}
          summary={roomSummary}
          isOpen={openDropdown === "room"}
          onToggle={() => toggle("room")}
        >
          <p className={sectionLabel}>방 수</p>
          <select value={minRooms} onChange={(e) => setImmediate(setMinRooms, "minRooms")(e.target.value)} className={selectCls}>
            <option value="0">전체</option>
            <option value="1">1+</option>
            <option value="2">2+</option>
            <option value="3">3+</option>
            <option value="4">4+</option>
          </select>
          <div className="mt-3">
            <p className={sectionLabel}>욕실 수</p>
            <select value={minBaths} onChange={(e) => setImmediate(setMinBaths, "minBaths")(e.target.value)} className={selectCls}>
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
                <select value={buildingName} onChange={(e) => setImmediate(setBuildingName, "buildingName")(e.target.value)} className={selectCls}>
                  <option value="전체">전체</option>
                  {filterOptions.building_names.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
            )}
            <div>
              <p className={sectionLabel}>방향</p>
              <select value={direction} onChange={(e) => setImmediate(setDirection, "direction")(e.target.value)} className={selectCls}>
                {(filterOptions?.directions?.length ? ["전체", ...filterOptions.directions] : ["전체", "남향", "남동향", "남서향", "동향", "서향", "북향"]).map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div>
              <p className={sectionLabel}>관리비 (만원)</p>
              <div className="flex flex-wrap gap-1 mb-1">
                {MAINTENANCE_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => applyPreset(p, setMinMaint, setMaxMaint, "minMaint", "maxMaint")}
                    className={`px-2 py-0.5 text-xs border rounded ${
                      (p.min !== undefined ? String(p.min) : "") === minMaint &&
                      (p.max !== undefined ? String(p.max) : "") === maxMaint
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-gray-50 border-gray-300 text-gray-600 hover:bg-blue-50"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1">
                <input type="number" min="0" value={minMaint} onChange={(e) => setDebounced(setMinMaint, "minMaint")(e.target.value)} className={inputCls} placeholder="최소" />
                <span className="text-xs text-gray-400">~</span>
                <input type="number" min="0" value={maxMaint} onChange={(e) => setDebounced(setMaxMaint, "maxMaint")(e.target.value)} className={inputCls} placeholder="최대" />
              </div>
            </div>
            <div>
              <p className={sectionLabel}>준공년도</p>
              <select value={buildingAge} onChange={(e) => setImmediate(setBuildingAge, "buildingAge")(e.target.value)} className={selectCls}>
                {(BUILDING_AGE_OPTIONS as readonly { v: string; l: string }[]).map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            </div>
            <div>
              <p className={sectionLabel}>매물유형</p>
              <select value={estateType} onChange={(e) => setImmediate(setEstateType, "estateType")(e.target.value)} className={selectCls}>
                <option value="all">전체</option>
                <option value="apt">아파트</option>
                <option value="opst">오피스텔</option>
                <option value="presale">분양권</option>
                <option value="jgc">재건축</option>
                <option value="rdv">재개발</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={verifiedOnly}
                onChange={(e) => { setVerifiedOnly(e.target.checked); emitChange({ verifiedOnly: String(e.target.checked) }); }}
                className="rounded border-gray-300 accent-blue-600"
              />
              인증매물만
            </label>
            <div className={separator} />
            <div>
              <p className={sectionLabel}>정렬</p>
              <select value={sortBy} onChange={(e) => setImmediate(setSortBy, "sortBy")(e.target.value)} className={selectCls}>
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

      {/* ── 활성 필터 칩 (기존과 동일) ── */}
      {(() => {
        const chipList: FilterChip[] = [];
        if (tradeType !== "전체") chipList.push({ label: tradeType, reset: () => setImmediate(setTradeType, "tradeType")("전체") });
        if (buildingName !== "전체") chipList.push({ label: buildingName, reset: () => setImmediate(setBuildingName, "buildingName")("전체") });
        if (floorPreset !== "전체") {
          const fl = floorPreset === "저층" ? "저층(1-5)" : floorPreset === "중층" ? "중층(6-10)" : "고층(11+)";
          chipList.push({ label: fl, reset: () => setImmediate(setFloorPreset, "floorPreset")("전체") });
        }
        if (direction !== "전체") chipList.push({ label: direction, reset: () => setImmediate(setDirection, "direction")("전체") });
        if (minRooms !== "0") chipList.push({ label: minRooms + "방+", reset: () => setImmediate(setMinRooms, "minRooms")("0") });
        if (minBaths !== "0") chipList.push({ label: minBaths + "욕실+", reset: () => setImmediate(setMinBaths, "minBaths")("0") });
        if (buildingAge !== "0") chipList.push({ label: buildingAge + "년 이내", reset: () => setImmediate(setBuildingAge, "buildingAge")("0") });
        if (moveInType !== "전체") chipList.push({ label: moveInType, reset: () => setImmediate(setMoveInType, "moveInType")("전체") });
        if (estateType !== "all") chipList.push({ label: { apt: "아파트", opst: "오피스텔", presale: "분양권", jgc: "재건축", rdv: "재개발" }[estateType] ?? estateType, reset: () => setImmediate(setEstateType, "estateType")("all") });
        if (verifiedOnly) chipList.push({ label: "인증매물", reset: () => { setVerifiedOnly(false); emitChange({ verifiedOnly: "false" }); } });

        if (minPrice) chipList.push({ label: `${minPrice}만원~`, reset: () => { setMinPrice(""); emitChange({ minPrice: "" }); } });
        if (maxPrice) chipList.push({ label: `~${maxPrice}만원`, reset: () => { setMaxPrice(""); emitChange({ maxPrice: "" }); } });
        if (minRent) chipList.push({ label: `월세 ${minRent}만~`, reset: () => { setMinRent(""); emitChange({ minRent: "" }); } });
        if (maxRent) chipList.push({ label: `월세 ~${maxRent}만`, reset: () => { setMaxRent(""); emitChange({ maxRent: "" }); } });
        if (minArea) chipList.push({ label: `${minArea}${areaUnit}~`, reset: () => { setMinArea(""); emitChange({ minArea: "" }); } });
        if (maxArea) chipList.push({ label: `~${maxArea}${areaUnit}`, reset: () => { setMaxArea(""); emitChange({ maxArea: "" }); } });
        if (minPpyeong) chipList.push({ label: `평당 ${minPpyeong}만~`, reset: () => { setMinPpyeong(""); emitChange({ minPpyeong: "" }); } });
        if (maxPpyeong) chipList.push({ label: `평당 ~${maxPpyeong}만`, reset: () => { setMaxPpyeong(""); emitChange({ maxPpyeong: "" }); } });
        if (minMaint) chipList.push({ label: `관리비 ${minMaint}만~`, reset: () => { setMinMaint(""); emitChange({ minMaint: "" }); } });
        if (maxMaint) chipList.push({ label: `관리비 ~${maxMaint}만`, reset: () => { setMaxMaint(""); emitChange({ maxMaint: "" }); } });

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
}
