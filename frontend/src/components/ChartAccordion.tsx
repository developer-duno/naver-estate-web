"use client";

import React, { useEffect, useState } from "react";

interface ChartAccordionProps {
  title: string;
  badge?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  forceOpen?: boolean;
}

export default function ChartAccordion({
  title,
  badge,
  children,
  defaultOpen = false,
  forceOpen = false,
}: ChartAccordionProps) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    const mql = window.matchMedia("print");
    const handler = (e: MediaQueryListEvent) => { if (e.matches) setOpen(true); };
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  const isOpen = forceOpen || open;
  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={isOpen}
        className="w-full flex justify-between items-center px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <span className="font-semibold text-sm">{title}</span>
        <div className="flex items-center gap-2">
          {badge && (
            <span className="text-xs text-green-600 font-bold">{badge}</span>
          )}
          <span className="text-gray-400 text-xs no-print">{isOpen ? "▲" : "▼"}</span>
        </div>
      </button>
      {isOpen && <div className="p-4 border-t">{children}</div>}
    </div>
  );
}
