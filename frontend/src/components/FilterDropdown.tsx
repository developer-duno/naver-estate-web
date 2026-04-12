"use client";

import React, { useRef, useEffect, useCallback, useState } from "react";

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
 * 필터 툴바 드롭다운 — 데스크톱 앱 FilterDropdownPopup 패턴
 * 버튼 클릭 → 아래에 팝업 표시, 외부 클릭 → 닫기
 */
const FilterDropdown = React.memo(function FilterDropdown({
  label,
  isActive,
  summary,
  isOpen,
  onToggle,
  children,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [alignRight, setAlignRight] = useState(false);

  // 드롭다운 우측 오버플로 감지 (rAF로 렌더링 완료 후 측정)
  useEffect(() => {
    if (isOpen && panelRef.current) {
      requestAnimationFrame(() => {
        if (panelRef.current) {
          const rect = panelRef.current.getBoundingClientRect();
          setAlignRight(rect.right > window.innerWidth - 16);
        }
      });
    } else {
      setAlignRight(false);
    }
  }, [isOpen]);

  // 외부 클릭 시 닫기
  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      if (isOpen && ref.current && !ref.current.contains(e.target as Node)) {
        onToggle();
      }
    },
    [isOpen, onToggle]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen, handleClickOutside]);

  const buttonText = isActive && summary ? `${label}: ${summary} ▾` : `${label} ▾`;

  const btnClass = isActive
    ? "px-3 py-1.5 border rounded text-xs font-bold bg-blue-50 border-blue-600 text-blue-700 hover:bg-blue-100 whitespace-nowrap"
    : "px-3 py-1.5 border rounded text-xs bg-gray-50 border-gray-300 text-gray-700 hover:bg-gray-100 whitespace-nowrap";

  return (
    <div className="relative" ref={ref}>
      <button type="button" className={btnClass} onClick={onToggle}>
        {buttonText}
      </button>

      {isOpen && (
        <div ref={panelRef} className={`absolute top-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-50 min-w-[200px] max-w-[calc(100vw-2rem)] max-h-[70vh] overflow-y-auto p-3 ${alignRight ? "right-0" : "left-0"}`}>
          {children}
        </div>
      )}
    </div>
  );
});

export default FilterDropdown;
