"use client";

import { useState, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useQueries } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { getMbApartmentDetail, getMbUnsoldHistory } from "@/lib/api";
import { MB_COMPARE_ROWS, getBestIndices, formatCellValue } from "@/lib/mb-compare-utils";
import { exportMbCompareToXlsx } from "@/lib/mb-compare-export";
import { useSmartBack } from "@/hooks/useSmartBack";
import type { UnsoldDataset } from "@/components/mb/MbCompareUnsoldChart";
import LoadingSpinner from "@/components/LoadingSpinner";
import { COMPARE_TEXT_COLORS } from "@/lib/constants";

const LazyMbCompareRadarChart = dynamic(
  () => import("@/components/mb/MbCompareRadarChart"),
  { ssr: false, loading: () => <LoadingSpinner message="차트 로딩..." /> },
);
const LazyMbComparePriceChart = dynamic(
  () => import("@/components/mb/MbComparePriceChart"),
  { ssr: false, loading: () => <LoadingSpinner message="차트 로딩..." /> },
);
const LazyMbCompareUnsoldChart = dynamic(
  () => import("@/components/mb/MbCompareUnsoldChart"),
  { ssr: false, loading: () => <LoadingSpinner message="차트 로딩..." /> },
);

function CompareContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const goBack = useSmartBack();
  const MAX_COMPARE = 4;
  const ids = (searchParams.get("ids") ?? "").split(",").filter(Boolean).slice(0, MAX_COMPARE);
  const [isExporting, setIsExporting] = useState(false);
  const [copied, setCopied] = useState(false);

  const queries = useQueries({
    queries: ids.map((id) => ({
      queryKey: queryKeys.mb.apartmentDetail(id),
      queryFn: () => getMbApartmentDetail(id),
    })),
  });

  const historyQueries = useQueries({
    queries: ids.map((id) => ({
      queryKey: queryKeys.mb.unsoldHistory(id),
      queryFn: () => getMbUnsoldHistory(id),
    })),
  });

  const isLoading = queries.some((q) => q.isLoading);
  const apartments = queries.map((q) => q.data).filter((d): d is NonNullable<typeof d> => !!d);

  const unsoldDatasets: UnsoldDataset[] = apartments.map((apt, i) => ({
    apartmentId: apt.id,
    apartmentName: apt.name,
    items: historyQueries[i]?.data?.items ?? [],
  }));

  const handleExport = useCallback(async () => {
    if (apartments.length < 2) return;
    setIsExporting(true);
    try { await exportMbCompareToXlsx(apartments); } catch { /* */ } finally { setIsExporting(false); }
  }, [apartments]);

  const handlePrint = useCallback(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert("복사에 실패했습니다");
    }
  }, []);

  if (ids.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center">
        <p className="text-gray-600 mb-4">비교할 아파트를 선택해주세요.</p>
        <button onClick={goBack} className="text-sm text-blue-600 hover:underline">← 미분양 목록</button>
      </div>
    );
  }

  if (ids.length < 2 && !isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center">
        <p className="text-gray-600 mb-4">비교할 아파트를 2개 이상 선택해주세요.</p>
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
      <div className="flex items-center gap-4 mb-6">
        <button onClick={goBack} aria-label="이전 페이지" className="text-gray-400 hover:text-gray-600 text-xl no-print">
          &#8592;
        </button>
        <h1 className="text-2xl font-bold text-gray-900">미분양 단지 비교</h1>
        <span className="text-gray-500 text-sm">({apartments.length}개 아파트)</span>
        <div className="ml-auto flex gap-2 no-print">
          <button
            onClick={handleCopy}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
          >
            {copied ? "복사됨" : "URL 복사"}
          </button>
          <button
            onClick={handlePrint}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
          >
            인쇄
          </button>
          <button
            onClick={handleExport}
            disabled={apartments.length < 2 || isExporting}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            {isExporting ? "생성 중..." : "엑셀"}
          </button>
        </div>
      </div>

      {/* 비교 테이블 */}
      <div className="overflow-x-auto bg-white rounded-lg shadow-sm border">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-gray-100 border-b-2 border-gray-300">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-gray-700 min-w-35">항목</th>
              {apartments.map((apt, i) => (
                <th
                  key={apt.id}
                  className={`px-4 py-3 text-center font-semibold ${COMPARE_TEXT_COLORS[i]} min-w-40 cursor-pointer hover:underline`}
                  onClick={() => router.push(`/mibunyang/${apt.id}`)}
                >
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

      {/* 차트 섹션 */}
      <div className="mt-6 space-y-6">
        <LazyMbCompareRadarChart apartments={apartments} />
        <LazyMbComparePriceChart apartments={apartments} />
        <LazyMbCompareUnsoldChart datasets={unsoldDatasets} />
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
