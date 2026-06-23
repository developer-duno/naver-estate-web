"use client";

/**
 * 미분양/분양 지도뷰 우측 세로 툴바 — 네이버부동산식 인프라 토글.
 * 5종(학군·교통·안전·대기질·어린이집) 버튼. 클릭 시 선택 단지 카드에 해당 지표 강조.
 * 세션 318 3단계: 우리 DB 보유 필드 기반(MbApartment 인프라 필드 실측).
 */

import { GraduationCap, TrainFront, Shield, Wind, Baby } from "lucide-react";

export type ToolbarLayer = "school" | "transit" | "safety" | "air" | "childcare";

const LAYERS: { key: ToolbarLayer; label: string; Icon: typeof GraduationCap }[] = [
  { key: "school", label: "학군", Icon: GraduationCap },
  { key: "transit", label: "교통", Icon: TrainFront },
  { key: "safety", label: "안전", Icon: Shield },
  { key: "air", label: "대기질", Icon: Wind },
  { key: "childcare", label: "어린이집", Icon: Baby },
];

interface Props {
  active: ToolbarLayer | null;
  onChange: (layer: ToolbarLayer | null) => void;
}

/** 지도뷰 우측 세로 툴바 — 토글 클릭 시 선택 단지 카드에 해당 지표 오버레이. */
export default function MbMapToolbar({ active, onChange }: Props) {
  return (
    <div
      className="flex flex-col gap-1 bg-white rounded-lg border border-gray-200 shadow-md p-1"
      role="toolbar"
      aria-label="지도 정보 레이어"
    >
      {LAYERS.map(({ key, label, Icon }) => {
        const isActive = active === key;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(isActive ? null : key)}
            className={`flex flex-col items-center gap-0.5 px-2 py-2 rounded-md text-xs font-medium transition-colors w-14 ${
              isActive
                ? "bg-blue-600 text-white"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            <Icon className="w-5 h-5" aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
