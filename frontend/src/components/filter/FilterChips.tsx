/**
 * 활성 필터 칩 목록 — 현재 적용된 필터를 시각적으로 표시 + 개별 해제
 */
"use client";
import { useState } from "react";
import { ESTATE_TYPE_FILTER_OPTIONS } from "@/lib/constants";
import type { FilterState, FilterChip } from "./reducer";

interface Props {
  s: FilterState;
  setImmediate: (key: keyof FilterState) => (v: string) => void;
  dispatch: (action: { type: "SET"; key: keyof FilterState; value: string }) => void;
  emitChange: (overrides?: Partial<Record<string, string>>) => void;
  resetAll: () => void;
}

export function buildChipList(
  s: FilterState,
  setImmediate: Props["setImmediate"],
  dispatch: Props["dispatch"],
  emitChange: Props["emitChange"],
): FilterChip[] {
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

  // 가격 칩 prefix — 거래유형에 따라 "매매가/전세가/보증금/가격"
  const pricePrefix = s.tradeType === "매매" ? "매매가 "
    : s.tradeType === "전세" ? "전세가 "
    : s.tradeType === "월세" || s.tradeType === "단기임대" ? "보증금 "
    : "";
  if (s.minPrice) chips.push({ label: `${pricePrefix}${s.minPrice}만원~`, reset: () => { dispatch({ type: "SET", key: "minPrice", value: "" }); emitChange({ minPrice: "" }); } });
  if (s.maxPrice) chips.push({ label: `${pricePrefix}~${s.maxPrice}만원`, reset: () => { dispatch({ type: "SET", key: "maxPrice", value: "" }); emitChange({ maxPrice: "" }); } });
  if (s.minRent) chips.push({ label: `월세 ${s.minRent}만~`, reset: () => { dispatch({ type: "SET", key: "minRent", value: "" }); emitChange({ minRent: "" }); } });
  if (s.maxRent) chips.push({ label: `월세 ~${s.maxRent}만`, reset: () => { dispatch({ type: "SET", key: "maxRent", value: "" }); emitChange({ maxRent: "" }); } });
  if (s.minArea) chips.push({ label: `${s.minArea}${s.areaUnit}~`, reset: () => { dispatch({ type: "SET", key: "minArea", value: "" }); emitChange({ minArea: "" }); } });
  if (s.maxArea) chips.push({ label: `~${s.maxArea}${s.areaUnit}`, reset: () => { dispatch({ type: "SET", key: "maxArea", value: "" }); emitChange({ maxArea: "" }); } });
  if (s.minPpyeong) chips.push({ label: `평당 ${s.minPpyeong}만~`, reset: () => { dispatch({ type: "SET", key: "minPpyeong", value: "" }); emitChange({ minPpyeong: "" }); } });
  if (s.maxPpyeong) chips.push({ label: `평당 ~${s.maxPpyeong}만`, reset: () => { dispatch({ type: "SET", key: "maxPpyeong", value: "" }); emitChange({ maxPpyeong: "" }); } });
  if (s.minMaint) chips.push({ label: `관리비 ${s.minMaint}만~`, reset: () => { dispatch({ type: "SET", key: "minMaint", value: "" }); emitChange({ minMaint: "" }); } });
  if (s.maxMaint) chips.push({ label: `관리비 ~${s.maxMaint}만`, reset: () => { dispatch({ type: "SET", key: "maxMaint", value: "" }); emitChange({ maxMaint: "" }); } });
  if (s.minYield) chips.push({ label: `수익률 ${s.minYield}%~`, reset: () => { dispatch({ type: "SET", key: "minYield", value: "" }); emitChange({ minYield: "" }); } });
  if (s.maxYield) chips.push({ label: `수익률 ~${s.maxYield}%`, reset: () => { dispatch({ type: "SET", key: "maxYield", value: "" }); emitChange({ maxYield: "" }); } });
  if (s.tags) {
    const selected = s.tags.split(",").filter(Boolean);
    selected.forEach((tag) => {
      chips.push({
        label: `#${tag}`,
        reset: () => {
          const next = selected.filter((t) => t !== tag).join(",");
          dispatch({ type: "SET", key: "tags", value: next });
          emitChange({ tags: next });
        },
      });
    });
  }
  return chips;
}

const VISIBLE_MOBILE = 3;

export default function FilterChips({ s, setImmediate, dispatch, emitChange, resetAll }: Props) {
  const [expanded, setExpanded] = useState(false);
  const chipList = buildChipList(s, setImmediate, dispatch, emitChange);
  if (chipList.length === 0) return null;

  const hiddenCount = Math.max(0, chipList.length - VISIBLE_MOBILE);
  const showToggle = hiddenCount > 0;

  return (
    <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-gray-100">
      {chipList.map((chip, i) => (
        <span
          key={chip.label}
          className={`inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-sm rounded-full px-3 py-1 border border-blue-200 ${
            i >= VISIBLE_MOBILE && !expanded ? "hidden md:inline-flex" : ""
          }`}
        >
          {chip.label}
          <button onClick={chip.reset} className="hover:text-blue-900 font-bold ml-0.5" aria-label={`${chip.label} 제거`}>×</button>
        </span>
      ))}
      {showToggle && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-expanded={false}
          className="md:hidden inline-flex items-center text-xs text-blue-600 px-2 py-1 rounded-full bg-blue-50 hover:bg-blue-100 border border-blue-200"
        >
          +{hiddenCount} 더보기
        </button>
      )}
      {showToggle && expanded && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          aria-expanded={true}
          className="md:hidden inline-flex items-center text-xs text-gray-600 px-2 py-1 rounded-full bg-gray-100 hover:bg-gray-200 border border-gray-300"
        >
          접기
        </button>
      )}
      <button onClick={resetAll} className="text-sm text-gray-500 hover:text-gray-700 ml-1">
        전체 초기화
      </button>
    </div>
  );
}
