"use client";

import { useRouter } from "next/navigation";
import type { MbCompareItem } from "@/hooks/useMbCompare";

const MAX_DISPLAY = 4;

interface Props {
  list: MbCompareItem[];
  onRemove: (id: string) => void;
  onClear: () => void;
}

export default function MbCompareFloatingBar({ list, onRemove, onClear }: Props) {
  const router = useRouter();

  if (list.length === 0) return null;

  const handleCompare = () => {
    const ids = list.map((c) => c.id).join(",");
    router.push(`/mibunyang/compare?ids=${ids}`);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-blue-500 shadow-lg z-50 px-4 py-2.5">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
          <span className="text-sm font-medium text-gray-700 shrink-0">비교 {list.length}/{MAX_DISPLAY}</span>
          {list.map((c) => (
            <span
              key={c.id}
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded-full max-w-[120px]"
            >
              <span className="truncate">{c.name}</span>
              <button
                type="button"
                onClick={() => onRemove(c.id)}
                className="text-blue-500 hover:text-red-500 shrink-0"
                aria-label={`${c.name} 제거`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onClear}
            className="text-xs text-gray-500 hover:text-red-600"
          >
            초기화
          </button>
          <button
            type="button"
            onClick={handleCompare}
            disabled={list.length < 2}
            className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            비교하기
          </button>
        </div>
      </div>
    </div>
  );
}
