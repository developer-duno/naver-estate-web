"use client";

import { List, MapPin } from "lucide-react";
import { MAP_ENABLED } from "@/lib/constants";
import type { MbViewMode } from "@/lib/storage";

/** 목록 ↔ 지도 보기 토글. MbPresaleTab 세그먼트 컨트롤 스타일 답습.
 * 지도 SDK Client ID 미설정(MAP_ENABLED=false) 시 렌더하지 않음 — graceful degradation. */
export default function MbViewToggle({
  viewMode,
  onChange,
}: {
  viewMode: MbViewMode;
  onChange: (m: MbViewMode) => void;
}) {
  if (!MAP_ENABLED) return null;

  const options: { key: MbViewMode; label: string; Icon: typeof List }[] = [
    { key: "list", label: "목록", Icon: List },
    { key: "map", label: "지도", Icon: MapPin },
  ];

  return (
    <div
      className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5"
      role="tablist"
      aria-label="보기 방식"
    >
      {options.map(({ key, label, Icon }) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={viewMode === key}
          onClick={() => onChange(key)}
          className={`flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
            viewMode === key
              ? "bg-blue-600 text-white shadow-sm"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          <Icon className="w-4 h-4" aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );
}
