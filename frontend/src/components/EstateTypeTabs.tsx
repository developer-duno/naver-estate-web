"use client";

import { memo } from "react";
import { ESTATE_TYPE_TABS } from "@/lib/constants";

interface Props {
  selected: string[];
  onChange: (codes: string[]) => void;
}

/** 매물유형 토글 탭 — 네이버 부동산 스타일 (복수 선택) */
export default memo(function EstateTypeTabs({ selected, onChange }: Props) {
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
            className={`min-h-10 px-3.5 py-1.5 text-sm rounded-full border transition-colors ${
              active
                ? "bg-brand-navy border-brand-navy text-white font-bold"
                : "bg-white border-brand-line text-brand-muted hover:border-brand-navy-line"
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
