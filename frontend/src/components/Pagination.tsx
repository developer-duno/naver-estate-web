/**
 * Pagination 컴포넌트 — 페이지 버튼 UI
 * complex/[no]/page.tsx에서 분리
 */
import { memo } from "react";

interface Props {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

function PaginationInner({ currentPage, totalPages, onPageChange }: Props) {
  const pages: number[] = [];
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, currentPage + 2);
  for (let i = start; i <= end; i++) pages.push(i);

  return (
    <div className="flex justify-center items-center gap-0.5 md:gap-1">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
        className="px-2 py-1 md:px-3 md:py-1.5 text-sm rounded border border-gray-300 disabled:opacity-30 hover:bg-gray-50"
      >
        이전
      </button>
      {start > 1 && (
        <>
          <button onClick={() => onPageChange(1)} className="px-2 py-1 md:px-3 md:py-1.5 text-sm rounded border border-gray-300 hover:bg-gray-50">1</button>
          {start > 2 && <span className="px-0.5 md:px-1 text-gray-500">...</span>}
        </>
      )}
      {pages.map((p) => (
        <button
          key={p}
          onClick={() => onPageChange(p)}
          className={`px-2 py-1 md:px-3 md:py-1.5 text-sm rounded border ${
            p === currentPage
              ? "bg-blue-600 text-white border-blue-600"
              : "border-gray-300 hover:bg-gray-50"
          }`}
        >
          {p}
        </button>
      ))}
      {end < totalPages && (
        <>
          {end < totalPages - 1 && <span className="px-0.5 md:px-1 text-gray-500">...</span>}
          <button onClick={() => onPageChange(totalPages)} className="px-2 py-1 md:px-3 md:py-1.5 text-sm rounded border border-gray-300 hover:bg-gray-50">{totalPages}</button>
        </>
      )}
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
        className="px-2 py-1 md:px-3 md:py-1.5 text-sm rounded border border-gray-300 disabled:opacity-30 hover:bg-gray-50"
      >
        다음
      </button>
    </div>
  );
}

export default memo(PaginationInner);
