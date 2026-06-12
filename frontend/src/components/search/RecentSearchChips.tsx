"use client";

import type { SearchHistoryItem } from "@/lib/storage";

/** 최근 검색 칩 — /search 직접 진입·결과 0건 양쪽에서 재사용 (세션 299 A1) */
export default function RecentSearchChips({
  items,
  onSelect,
}: {
  items: SearchHistoryItem[];
  onSelect: (item: SearchHistoryItem) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="max-w-md mx-auto pt-2">
      <p className="text-xs text-gray-500 mb-2">최근 검색</p>
      <div className="flex flex-wrap gap-2 justify-center">
        {items.map((item) => (
          <button
            type="button"
            key={item.timestamp}
            onClick={() => onSelect(item)}
            className="text-xs px-2.5 py-1 rounded-full border border-gray-300 bg-white hover:bg-blue-50 hover:border-blue-300 text-gray-700"
          >
            {item.type === "keyword"
              ? item.keyword
              : `${item.sido} ${item.sigungu}${item.dong ? ` ${item.dong}` : ""}`}
          </button>
        ))}
      </div>
    </div>
  );
}
