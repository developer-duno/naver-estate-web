"use client";

import { memo } from "react";
import { ESTATE_TYPE_TABS, ESTATE_TYPE_COLORS } from "@/lib/constants";

interface Props {
  selected: string[];
  onChange: (codes: string[]) => void;
}

/** 매물유형 토글 탭 — 네이버 부동산 스타일 (복수 선택) */
export default memo(function EstateTypeTabs({ selected, onChange }: Props) {
  const allCodes = ESTATE_TYPE_TABS.map((t) => t.code);
  const allSelected = selected.length === allCodes.length;

  function toggle(code: string) {
    const isSelected = selected.includes(code);
    if (isSelected) {
      // 최소 1개 유지
      if (selected.length <= 1) return;
      onChange(selected.filter((c) => c !== code));
    } else {
      onChange([...selected, code]);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {ESTATE_TYPE_TABS.map((tab) => {
        const active = selected.includes(tab.code);
        return (
          <button
            key={tab.code}
            type="button"
            onClick={() => toggle(tab.code)}
            className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
              active
                ? `${ESTATE_TYPE_COLORS[tab.label] ?? "bg-green-100 border-green-500 text-green-700"} font-semibold`
                : "bg-white border-gray-300 text-gray-500 hover:border-gray-400"
            }`}
          >
            {active && <span className="mr-1">✓</span>}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
});
