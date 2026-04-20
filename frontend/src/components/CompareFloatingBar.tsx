"use client";

import { useRouter } from "next/navigation";
import type { CompareItem } from "@/hooks/useCompare";

interface Props {
  list: CompareItem[];
  onRemove: (complexNo: string) => void;
  onClear: () => void;
}

export default function CompareFloatingBar({ list, onRemove, onClear }: Props) {
  const router = useRouter();
  if (list.length === 0) return null;

  const isFull = list.length >= 4;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-blue-500 shadow-lg z-50 px-4 py-2.5">
      {isFull && (
        <div
          role="status"
          className="max-w-7xl mx-auto mb-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800"
        >
          <span aria-hidden="true">⚠ </span>
          비교 목록이 가득 찼습니다. 다른 단지를 추가하려면 기존 단지를 먼저 빼주세요.
        </div>
      )}
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-sm font-semibold text-blue-600 shrink-0">비교 {list.length}/4</span>
          <div className="flex gap-1.5 flex-wrap">
            {list.map((c) => (
              <span key={c.complex_no} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs rounded-full px-2.5 py-1 border border-blue-200">
                {c.complex_name}
                <button onClick={() => onRemove(c.complex_no)} className="hover:text-blue-900 font-bold">x</button>
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onClear}
            className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded px-2.5 py-1.5"
          >
            초기화
          </button>
          <button
            onClick={() => router.push(`/compare?ids=${list.map((c) => c.complex_no).join(",")}`)}
            disabled={list.length < 2}
            className="text-xs font-medium bg-blue-600 text-white rounded px-4 py-1.5 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            비교하기
          </button>
        </div>
      </div>
    </div>
  );
}
