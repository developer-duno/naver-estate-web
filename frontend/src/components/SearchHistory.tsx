"use client";

import type { SearchHistoryItem } from "@/lib/storage";

interface Props {
  history: SearchHistoryItem[];
  onSelect: (item: SearchHistoryItem) => void;
  onRemove: (timestamp: number) => void;
  onClear: () => void;
}

export default function SearchHistory({ history, onSelect, onRemove, onClear }: Props) {
  if (history.length === 0) return null;

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold text-gray-500">최근 검색</span>
        <button onClick={onClear} className="text-xs text-gray-400 hover:text-gray-600">전체 삭제</button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {history.map((item) => (
          <span
            key={item.timestamp}
            className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-xs rounded-full px-2.5 py-1 border border-gray-200 hover:bg-blue-50 hover:border-blue-200 cursor-pointer transition-colors"
          >
            <button onClick={() => onSelect(item)} className="hover:text-blue-600">
              {item.type === "keyword"
                ? item.keyword
                : `${item.sido} ${item.sigungu}${item.dong ? ` ${item.dong}` : ""}`}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(item.timestamp); }}
              className="text-gray-400 hover:text-red-500 ml-0.5"
            >
              x
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
