"use client";

import { useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useQueries } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { getMbApartmentDetail } from "@/lib/api";
import { MB_COMPARE_ROWS, getBestIndices, formatCellValue } from "@/lib/mb-compare-utils";
import { exportMbCompareToXlsx } from "@/lib/mb-compare-export";
import { useSmartBack } from "@/hooks/useSmartBack";
import LoadingSpinner from "@/components/LoadingSpinner";

const COMPARE_COLORS = ["text-red-600", "text-blue-600", "text-amber-600", "text-emerald-600"];

function CompareContent() {
  const searchParams = useSearchParams();
  const goBack = useSmartBack();
  const ids = (searchParams.get("ids") ?? "").split(",").filter(Boolean);
  const [isExporting, setIsExporting] = useState(false);

  const queries = useQueries({
    queries: ids.map((id) => ({
      queryKey: queryKeys.mb.apartmentDetail(id),
      queryFn: () => getMbApartmentDetail(id),
    })),
  });

  const isLoading = queries.some((q) => q.isLoading);
  const apartments = queries.map((q) => q.data).filter((d): d is NonNullable<typeof d> => !!d);

  const handleExport = useCallback(async () => {
    if (apartments.length < 2) return;
    setIsExporting(true);
    try { await exportMbCompareToXlsx(apartments); } catch { /* */ } finally { setIsExporting(false); }
  }, [apartments]);

  if (ids.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center">
        <p className="text-gray-600 mb-4">비교할 아파트를 선택해주세요.</p>
        <button onClick={goBack} className="text-sm text-blue-600 hover:underline">← 미분양 목록</button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-6">
        <LoadingSpinner message="비교 데이터 로딩 중..." />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <button onClick={goBack} className="text-sm text-gray-500 hover:text-gray-700 mb-2">← 미분양 목록</button>
          <h1 className="text-2xl font-bold text-gray-900">미분양 단지 비교</h1>
        </div>
        <button
          type="button"
          disabled={apartments.length < 2 || isExporting}
          onClick={handleExport}
          className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-100 disabled:opacity-40"
        >
          {isExporting ? "생성 중..." : "엑셀"}
        </button>
      </div>

      {/* 비교 테이블 */}
      <div className="overflow-x-auto bg-white rounded-lg shadow-sm border">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-gray-100 border-b-2 border-gray-300">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-gray-700 min-w-35">항목</th>
              {apartments.map((apt, i) => (
                <th key={apt.id} className={`px-4 py-3 text-center font-semibold ${COMPARE_COLORS[i]} min-w-40`}>
                  {apt.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MB_COMPARE_ROWS.map((row, ri) => {
              const values = apartments.map((a) => row.getValue(a));
              const numValues = values.map((v) => (typeof v === "number" ? v : null));
              const bestIdxs = getBestIndices(numValues, row.direction);
              return (
                <tr key={ri} className={ri % 2 === 0 ? "bg-white" : "bg-gray-50/60"}>
                  <td className="px-4 py-2 font-medium text-gray-700 border-r border-gray-200">
                    {row.label}
                  </td>
                  {apartments.map((apt, ci) => {
                    const isBest = bestIdxs.includes(ci);
                    return (
                      <td
                        key={apt.id}
                        className={`px-4 py-2 text-center ${isBest ? "font-bold bg-yellow-50" : "text-gray-600"}`}
                      >
                        {formatCellValue(row.getValue(apt))}
                        {isBest && row.direction && " ★"}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function MbComparePage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <CompareContent />
    </Suspense>
  );
}
