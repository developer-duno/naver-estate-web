"use client";

import React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface Props {
  /** 버튼에 표시할 기본 라벨 */
  label: string;
  /** 필터가 활성화되었는지 (스타일 변경) */
  isActive: boolean;
  /** 활성 시 버튼에 표시할 요약 텍스트 (예: "매매/전세") */
  summary?: string;
  /** 드롭다운 열림 여부 */
  isOpen: boolean;
  /** 열기/닫기 토글 콜백 */
  onToggle: () => void;
  /** 드롭다운 내부 콘텐츠 */
  children: React.ReactNode;
}

/**
 * 필터 툴바 드롭다운 — Radix Popover 기반 (shadcn wrapper)
 * 외부 클릭/ESC 닫기·우측 오버플로 회피·키보드 a11y 모두 Radix 자동
 */
const FilterDropdown = React.memo(function FilterDropdown({
  label,
  isActive,
  summary,
  isOpen,
  onToggle,
  children,
}: Props) {
  const buttonText = isActive && summary ? `${label}: ${summary} ▾` : `${label} ▾`;

  const btnClass = isActive
    ? "px-3 py-2 border rounded text-sm font-bold bg-blue-50 border-blue-600 text-blue-700 hover:bg-blue-100 whitespace-nowrap"
    : "px-3 py-2 border rounded text-sm bg-gray-50 border-gray-300 text-gray-700 hover:bg-gray-100 whitespace-nowrap";

  return (
    <Popover open={isOpen} onOpenChange={(next) => { if (next !== isOpen) onToggle(); }}>
      <PopoverTrigger asChild>
        <button type="button" className={btnClass}>
          {buttonText}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={4}
        collisionPadding={16}
        className="w-auto min-w-50 max-w-[calc(100vw-2rem)] max-h-[70vh] overflow-y-auto bg-white border border-gray-300 rounded-lg shadow-lg p-3 gap-0 ring-0 text-gray-700"
      >
        {children}
      </PopoverContent>
    </Popover>
  );
});

export default FilterDropdown;
