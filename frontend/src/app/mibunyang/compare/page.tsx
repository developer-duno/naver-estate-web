"use client";

import { useState, useCallback, useEffect, useRef, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useQueries } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { getMbApartmentDetail, getMbUnsoldHistory } from "@/lib/api";
import { MB_COMPARE_ROWS, getBestIndices, formatCellValue } from "@/lib/mb-compare-utils";
import { exportMbCompareToXlsx } from "@/lib/mb-compare-export";
import { useSmartBack } from "@/hooks/useSmartBack";
import { useMbCompareHistory } from "@/hooks/useMbCompareHistory";
import { useMbCompareBookmarks } from "@/hooks/useMbCompareBookmarks";
import type { UnsoldDataset } from "@/components/mb/MbCompareUnsoldChart";
import type { MbCompareHistoryItem, MbCompareBookmarkItem } from "@/lib/storage";
import MbCompareHistory from "@/components/mb/MbCompareHistory";
import PromptModal from "@/components/PromptModal";
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
  const [promptOpen, setPromptOpen] = useState(false);
  const { history: compareHistory, add: addHistory, remove: removeHistory, clear: clearHistory } = useMbCompareHistory();
  const { bookmarks, add: addBookmark, remove: removeBookmark, clear: clearBookmarks, isBookmarked } = useMbCompareBookmarks();
  const historySaved = useRef(false);
  const idsKey = ids.join(",");

  // ids 변경 시 ref 리셋 (같은 컴포넌트 내 pill 클릭으로 URL만 변경될 때)
  useEffect(() => {
    historySaved.current = false;
  }, [idsKey]);

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

  // 비교 데이터 로드 완료 시 히스토리 자동 저장
  useEffect(() => {
    if (apartments.length >= 2 && !historySaved.current) {
      historySaved.current = true;
      addHistory({ ids: apartments.map((a) => a.id), names: apartments.map((a) => a.name) });
    }
  }, [apartments, addHistory]);

  const currentIds = useMemo(() => apartments.map((a) => a.id), [apartments]);
  const alreadyBookmarked = isBookmarked(currentIds);

  const handleBookmark = useCallback(() => {
    if (apartments.length < 2 || alreadyBookmarked) return;
    setPromptOpen(true);
  }, [apartments.length, alreadyBookmarked]);

  const handleBookmarkConfirm = useCallback(
    (label: string) => {
      setPromptOpen(false);
      addBookmark({
        ids: currentIds,
        names: apartments.map((a) => a.name),
        label: label.trim() || undefined,
      });
    },
    [currentIds, apartments, addBookmark],
  );

  const handleSelectCompare = useCallback(
    (item: MbCompareHistoryItem | MbCompareBookmarkItem) => {
      router.push(`/mibunyang/compare?ids=${item.ids.join(",")}`);
    },
    [router],
  );

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
      <div className="flex flex-wrap items-center gap-2 md:gap-4 mb-6">
        <button onClick={goBack} aria-label="이전 페이지" className="text-gray-400 hover:text-gray-600 text-xl no-print">
          &#8592;
        </button>
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">미분양 단지 비교</h1>
        <span className="text-gray-500 text-sm">({apartments.length}개 아파트)</span>
        <div className="ml-auto flex flex-wrap gap-2 no-print">
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
          <button
            onClick={handleBookmark}
            disabled={alreadyBookmarked}
            className="px-3 py-1.5 text-sm border border-amber-300 rounded-md hover:bg-amber-50 disabled:opacity-50 disabled:bg-amber-50"
          >
            {alreadyBookmarked ? "★ 저장됨" : "☆ 저장"}
          </button>
        </div>
      </div>

      {/* 최근 비교 / 저장된 비교 */}
      <div className="mb-4 no-print">
        <MbCompareHistory
          history={compareHistory}
          bookmarks={bookmarks}
          onSelectHistory={handleSelectCompare}
          onRemoveHistory={removeHistory}
          onClearHistory={clearHistory}
          onSelectBookmark={handleSelectCompare}
          onRemoveBookmark={removeBookmark}
          onClearBookmarks={clearBookmarks}
        />
      </div>

      {/* 북마크 이름 입력 모달 */}
      <PromptModal
        isOpen={promptOpen}
        title="비교 북마크 이름"
        placeholder="빈칸이면 자동 생성"
        onConfirm={handleBookmarkConfirm}
        onCancel={() => setPromptOpen(false)}
      />

      {/* 비교 테이블 (데스크톱) */}
      <div className="hidden md:block overflow-x-auto bg-white rounded-lg shadow-sm border">
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

      {/* 비교 카드 (모바일) */}
      <div className="md:hidden space-y-4">
        {apartments.map((apt, ci) => (
          <div key={apt.id} className="bg-white rounded-lg shadow-sm border p-4">
            <button
              onClick={() => router.push(`/mibunyang/${apt.id}`)}
              className={`${COMPARE_TEXT_COLORS[ci]} hover:underline font-semibold text-base mb-3 block`}
            >
              {apt.name}
            </button>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              {MB_COMPARE_ROWS.map((row, ri) => {
                const values = apartments.map((a) => row.getValue(a));
                const numValues = values.map((v) => (typeof v === "number" ? v : null));
                const bestIdxs = getBestIndices(numValues, row.direction);
                const isBest = bestIdxs.includes(ci);
                return (
                  <div key={ri} className={`contents ${isBest ? "font-bold" : ""}`}>
                    <dt className="text-gray-500 text-xs">{row.label}</dt>
                    <dd className={isBest ? "text-amber-700" : "text-gray-800"}>
                      {formatCellValue(row.getValue(apt))}
                      {isBest && row.direction && " ★"}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </div>
        ))}
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
