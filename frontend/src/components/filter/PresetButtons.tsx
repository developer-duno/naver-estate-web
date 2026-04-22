/**
 * 프리셋 버튼 목록 — 가격·면적·평당가·관리비 드롭다운에서 공통 사용
 */
import type { RangePreset } from "@/lib/constants";
import type { FilterState } from "./reducer";

interface Props {
  presets: readonly RangePreset[];
  minKey: keyof FilterState;
  maxKey: keyof FilterState;
  currentMin: string;
  currentMax: string;
  onApply: (p: RangePreset, minK: keyof FilterState, maxK: keyof FilterState) => void;
  size?: string;
}

export default function PresetButtons({ presets, minKey, maxKey, currentMin, currentMax, onApply, size = "py-1" }: Props) {
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
