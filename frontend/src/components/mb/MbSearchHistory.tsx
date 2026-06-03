"use client";

import type { MbSearchHistoryItem } from "@/lib/storage";

interface Props {
  history: MbSearchHistoryItem[];
  onSelect: (item: MbSearchHistoryItem) => void;
  onRemove: (timestamp: number) => void;
  onClear: () => void;
}

function formatLabel(item: MbSearchHistoryItem): string {
  let label = item.region;
  if (item.gu) label += ` ${item.gu}`;
  if (item.keyword) label += ` '${item.keyword}'`;
  return label;
}

export default function MbSearchHistory({ history, onSelect, onRemove, onClear }: Props) {
  if (history.length === 0) return null;

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold text-gray-500">최근 검색</span>
        <button type="button" onClick={onClear} className="text-xs text-gray-400 hover:text-gray-600">
          전체 삭제
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {history.map((item) => (
          <span
            key={item.timestamp}
            className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-xs rounded-full px-2.5 py-1 border border-gray-200 hover:bg-blue-50 hover:border-blue-200 cursor-pointer transition-colors"
          >
            <button type="button" onClick={() => onSelect(item)} className="hover:text-blue-600">
              {formatLabel(item)}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(item.timestamp);
              }}
              className="text-gray-400 hover:text-red-500 ml-0.5"
              aria-label={`${formatLabel(item)} 검색 기록 삭제`}
            >
              ×
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
