/**
 * 프리셋 버튼 목록 — 가격·면적·평당가·관리비 드롭다운에서 공통 사용
 *
 * unit/presetUnit: 면적 빠른선택에서 단위가 다른 경우(예: state="평", preset="m²")
 * convertArea로 변환 후 비교. 가격·관리비 등 단위 고정 호출처는 미전달(undefined) → 기존 동작.
 */
import { convertArea, type RangePreset } from "@/lib/constants";
import type { FilterState } from "./reducer";

interface Props {
  presets: readonly RangePreset[];
  minKey: keyof FilterState;
  maxKey: keyof FilterState;
  currentMin: string;
  currentMax: string;
  onApply: (p: RangePreset, minK: keyof FilterState, maxK: keyof FilterState) => void;
  size?: string;
  unit?: "m²" | "평";
  presetUnit?: "m²" | "평";
}

export default function PresetButtons({ presets, minKey, maxKey, currentMin, currentMax, onApply, size = "py-1", unit, presetUnit }: Props) {
  const matches = (presetVal: number | undefined, currentVal: string) => {
    if (presetVal === undefined) return currentVal === "";
    const raw = String(presetVal);
    if (unit && presetUnit && unit !== presetUnit) {
      return convertArea(raw, presetUnit, unit) === currentVal;
    }
    return raw === currentVal;
  };
  return (
    <div className="flex flex-wrap gap-1">
      {presets.map((p) => {
        const isActive = matches(p.min, currentMin) && matches(p.max, currentMax);
        return (
          <button
            key={p.label}
            onClick={() => onApply(p, minKey, maxKey)}
            className={`px-2 ${size} text-sm border rounded ${
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
