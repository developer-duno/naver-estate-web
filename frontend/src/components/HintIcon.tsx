"use client";

import { useState, useCallback } from "react";

interface Props {
  text: string;
  className?: string;
}

/** 인라인 도움말 — ? 아이콘 + 호버(데스크톱)/탭(모바일) 툴팁 */
export default function HintIcon({ text, className }: Props) {
  const [open, setOpen] = useState(false);

  const toggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen((v) => !v);
  }, []);

  return (
    <span className={`relative inline-flex items-center group ${className ?? ""}`}>
      <button
        type="button"
        onClick={toggle}
        aria-label="도움말"
        title={text}
        className="w-4 h-4 rounded-full bg-gray-200 text-gray-500 text-[10px] font-bold leading-none flex items-center justify-center cursor-help hover:bg-blue-200 hover:text-blue-700 transition-colors shrink-0"
      >
        ?
      </button>
      <span
        role="tooltip"
        className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1.5 rounded bg-gray-800 text-white text-xs leading-snug whitespace-normal max-w-[220px] w-max z-50 pointer-events-none transition-opacity ${
          open ? "opacity-100" : "opacity-0 invisible group-hover:opacity-100 group-hover:visible"
        }`}
      >
        {text}
      </span>
    </span>
  );
}
