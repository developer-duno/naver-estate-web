"use client";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ArticleViewMode } from "@/lib/storage";

interface Props {
  value: ArticleViewMode;
  onChange: (mode: ArticleViewMode) => void;
}

/** 매물 카드 보기 모양 (큰 카드 / 중간 / 작게 1줄) 토글. 모바일 전용 — 부모가 md:hidden wrapper 책임. */
export default function ArticleViewToggle({ value, onChange }: Props) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(v) => { if (v) onChange(v as ArticleViewMode); }}
      role="group"
      aria-label="매물 카드 모양"
      className="w-auto flex flex-wrap gap-1"
    >
      <ToggleGroupItem
        value="large"
        aria-label="크게"
        className="h-auto min-w-0 px-2 py-1 text-sm border rounded bg-gray-50 border-gray-300 text-gray-600 hover:bg-blue-50 hover:text-gray-600 data-[state=on]:bg-blue-600 data-[state=on]:text-white data-[state=on]:border-blue-600"
      >
        크게
      </ToggleGroupItem>
      <ToggleGroupItem
        value="medium"
        aria-label="중간"
        className="h-auto min-w-0 px-2 py-1 text-sm border rounded bg-gray-50 border-gray-300 text-gray-600 hover:bg-blue-50 hover:text-gray-600 data-[state=on]:bg-blue-600 data-[state=on]:text-white data-[state=on]:border-blue-600"
      >
        중간
      </ToggleGroupItem>
      <ToggleGroupItem
        value="compact"
        aria-label="작게"
        className="h-auto min-w-0 px-2 py-1 text-sm border rounded bg-gray-50 border-gray-300 text-gray-600 hover:bg-blue-50 hover:text-gray-600 data-[state=on]:bg-blue-600 data-[state=on]:text-white data-[state=on]:border-blue-600"
      >
        작게
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
