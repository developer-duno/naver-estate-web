"use client";

import type { MbCompareHistoryItem, MbCompareBookmarkItem } from "@/lib/storage";

interface Props {
  history: MbCompareHistoryItem[];
  bookmarks?: MbCompareBookmarkItem[];
  onSelectHistory: (item: MbCompareHistoryItem) => void;
  onRemoveHistory: (timestamp: number) => void;
  onClearHistory: () => void;
  onSelectBookmark?: (item: MbCompareBookmarkItem) => void;
  onRemoveBookmark?: (saved_at: number) => void;
  onClearBookmarks?: () => void;
}

const PILL_STYLES = {
  history: {
    wrapper: "bg-gray-100 text-gray-700 border-gray-200 hover:bg-blue-50 hover:border-blue-200",
    label: "hover:text-blue-600",
    close: "text-gray-400",
  },
  bookmark: {
    wrapper: "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100 hover:border-amber-300",
    label: "hover:text-amber-900",
    close: "text-amber-400",
  },
} as const;

function ComparePill({
  label,
  prefix,
  variant,
  onSelect,
  onRemove,
}: {
  label: string;
  prefix?: string;
  variant: "history" | "bookmark";
  onSelect: () => void;
  onRemove: () => void;
}) {
  const s = PILL_STYLES[variant];
  return (
    <span
      title={label}
      className={`inline-flex items-center gap-1 text-xs rounded-full px-2.5 py-1 border cursor-pointer transition-colors ${s.wrapper}`}
    >
      <button type="button" onClick={onSelect} className={`truncate max-w-48 ${s.label}`}>
        {prefix}{label}
      </button>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className={`${s.close} hover:text-red-500 ml-0.5`}
        aria-label={`${label} 삭제`}
      >
        ×
      </button>
    </span>
  );
}

export default function MbCompareHistory({
  history,
  bookmarks = [],
  onSelectHistory,
  onRemoveHistory,
  onClearHistory,
  onSelectBookmark,
  onRemoveBookmark,
  onClearBookmarks,
}: Props) {
  const showHistory = history.length > 0;
  const showBookmarks = bookmarks.length > 0 && onSelectBookmark && onRemoveBookmark;

  if (!showHistory && !showBookmarks) return null;

  return (
    <div className="space-y-2 mt-2">
      {showHistory && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-gray-500">최근 비교</span>
            <button type="button" onClick={onClearHistory} className="text-xs text-gray-400 hover:text-gray-600">
              전체 삭제
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {history.map((item) => (
              <ComparePill
                key={item.timestamp}
                label={item.names.join(" vs ")}
                variant="history"
                onSelect={() => onSelectHistory(item)}
                onRemove={() => onRemoveHistory(item.timestamp)}
              />
            ))}
          </div>
        </div>
      )}
      {showBookmarks && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-amber-600">저장된 비교</span>
            {onClearBookmarks && (
              <button type="button" onClick={onClearBookmarks} className="text-xs text-amber-400 hover:text-amber-600">
                전체 삭제
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {bookmarks.map((item) => (
              <ComparePill
                key={item.saved_at}
                label={item.label ?? item.names.join(" vs ")}
                prefix="★ "
                variant="bookmark"
                onSelect={() => onSelectBookmark!(item)}
                onRemove={() => onRemoveBookmark!(item.saved_at)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
