/**
 * 활성 필터 칩 목록 — 현재 적용된 필터를 시각적으로 표시 + 개별 해제
 */
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

export default function FilterChips({ s, setImmediate, dispatch, emitChange, resetAll }: Props) {
  const chipList = buildChipList(s, setImmediate, dispatch, emitChange);
  if (chipList.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-gray-100 max-h-16 md:max-h-none overflow-y-auto">
      {chipList.map((chip) => (
        <span key={chip.label} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-sm rounded-full px-3 py-1 border border-blue-200">
          {chip.label}
          <button onClick={chip.reset} className="hover:text-blue-900 font-bold ml-0.5">×</button>
        </span>
      ))}
      <button onClick={resetAll} className="text-sm text-gray-500 hover:text-gray-700 ml-1">
        전체 초기화
      </button>
    </div>
  );
}
