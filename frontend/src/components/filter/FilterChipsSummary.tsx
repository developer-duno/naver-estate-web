/**
 * 적용된 필터 한 줄 요약 (읽기 전용) — 단지 상세 페이지 매물 표 위에 표시
 * FilterBar 내부 칩과 역할 분리: 위(인터랙티브, X 제거) vs 아래(읽기 전용 표시)
 */
"use client";
import { useState } from "react";
import type { ArticleFilters } from "@/types";
import { buildChipList } from "./FilterChips";
import { buildInitState } from "./reducer";

interface Props {
  filters: ArticleFilters;
}

const VISIBLE_MOBILE = 3;
const noopSet = () => () => {};
const noopDispatch = () => {};
const noopEmit = () => {};

export default function FilterChipsSummary({ filters }: Props) {
  const [expanded, setExpanded] = useState(false);
  const s = buildInitState(filters);
  const chipList = buildChipList(s, noopSet, noopDispatch, noopEmit);
  if (chipList.length === 0) return null;

  const hiddenCount = Math.max(0, chipList.length - VISIBLE_MOBILE);
  const showToggle = hiddenCount > 0;

  return (
    <div className="flex items-center gap-1.5 flex-wrap bg-gray-50 border border-gray-200 rounded-md px-3 py-2">
      <span className="text-xs text-gray-500 mr-1">적용된 필터:</span>
      {chipList.map((chip, i) => (
        <span
          key={chip.label}
          className={`inline-flex items-center bg-blue-50 text-blue-700 text-sm rounded-full px-3 py-1 border border-blue-200 cursor-default ${
            i >= VISIBLE_MOBILE && !expanded ? "hidden md:inline-flex" : ""
          }`}
        >
          {chip.label}
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
    </div>
  );
}
