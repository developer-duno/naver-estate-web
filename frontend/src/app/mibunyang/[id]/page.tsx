"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { queryKeys } from "@/lib/query-keys";
import { getMbApartmentDetail, getMbUnsoldHistory } from "@/lib/api";
import { useSmartBack } from "@/hooks/useSmartBack";
import {
  OverviewSection,
  PresaleSection,
  EnvironmentSection,
  TradeStatsSection,
} from "@/components/mb/MbDetailSections";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useMbFavoriteStatus } from "@/hooks/useMbFavorites";
import { exportMbUnsoldHistoryToXlsx } from "@/lib/mb-export";

const LazyUnsoldChart = dynamic(() => import("@/components/mb/MbUnsoldTrendChart"), {
  ssr: false,
});

const LazyLocationMap = dynamic(() => import("@/components/mb/MbLocationMap"), {
  ssr: false,
});

export default function MbDetailPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const goBack = useSmartBack();

  const detailQuery = useQuery({
    queryKey: queryKeys.mb.apartmentDetail(id),
    queryFn: () => getMbApartmentDetail(id),
    enabled: !!id,
  });

  const historyQuery = useQuery({
    queryKey: queryKeys.mb.unsoldHistory(id),
    queryFn: () => getMbUnsoldHistory(id),
    enabled: !!id,
  });

  const apt = detailQuery.data;
  const { starred, toggle: toggleStar } = useMbFavoriteStatus(id);
  const [exporting, setExporting] = useState(false);
  const handleExportHistory = useCallback(async () => {
    if (!historyQuery.data?.items?.length || !apt) return;
    setExporting(true);
    try { await exportMbUnsoldHistoryToXlsx(historyQuery.data.items, apt.name); } catch { /* */ } finally { setExporting(false); }
  }, [historyQuery.data, apt]);

  useEffect(() => {
    if (apt?.name) document.title = `${apt.name} - 미분양 상세 | 아파트·오피스텔`;
  }, [apt?.name]);

  if (detailQuery.isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-6">
        <LoadingSpinner message="아파트 정보를 불러오는 중..." />
      </div>
    );
  }

  if (detailQuery.error) {
    const is404 = detailQuery.error.message?.includes("404") || detailQuery.error.message?.includes("찾을 수 없");
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center">
        <p className="text-lg text-red-600 mb-4">
          {is404 ? "아파트를 찾을 수 없습니다." : "데이터를 불러오지 못했습니다."}
        </p>
        <div className="flex gap-3 justify-center">
          <button onClick={goBack} className="text-sm text-blue-600 hover:underline">
            뒤로 가기
          </button>
          <button onClick={() => detailQuery.refetch()} className="text-sm text-blue-600 hover:underline">
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  if (!apt) return null;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* 헤더 */}
      <div className="mb-6">
        <button onClick={goBack} className="text-sm text-gray-500 hover:text-gray-700 mb-2" aria-label="뒤로 가기">
          ← 목록으로
        </button>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-gray-900">{apt.name}</h1>
          <button
            type="button"
            onClick={() => toggleStar(apt.name, apt.region)}
            className={`text-xl leading-none ${starred ? "text-yellow-500" : "text-gray-300 hover:text-yellow-400"}`}
            aria-label={starred ? "즐겨찾기 해제" : "즐겨찾기 추가"}
          >
            {starred ? "★" : "☆"}
          </button>
        </div>
        <p className="text-sm text-gray-500 mt-1">
          {apt.region} {apt.gu ?? ""} {apt.dong ?? ""}
          {apt.unsold != null && (
            <span className="ml-2 text-red-600 font-medium">미분양 {apt.unsold}세대</span>
          )}
        </p>
      </div>

      {/* 5개 섹션 — 선형 스크롤 */}
      <div className="space-y-6">
        <OverviewSection apartment={apt} />
        <PresaleSection apartment={apt} />
        <EnvironmentSection apartment={apt} />

        {apt.latitude != null && apt.longitude != null && (
          <section className="bg-white rounded-lg shadow-sm border p-4 md:p-6">
            <h3 className="text-base font-bold text-gray-800 mb-4 pb-2 border-b border-gray-200">위치</h3>
            <LazyLocationMap latitude={apt.latitude} longitude={apt.longitude} name={apt.name} />
          </section>
        )}

        <TradeStatsSection apartment={apt} />

        {/* 미분양 추이 */}
        <section data-testid="mb-unsold-trend" className="bg-white rounded-lg shadow-sm border p-4 md:p-6">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-200">
            <h3 className="text-base font-bold text-gray-800">미분양 추이</h3>
            {historyQuery.data?.items?.length ? (
              <button
                type="button"
                disabled={exporting}
                onClick={handleExportHistory}
                className="text-xs px-3 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-40"
              >
                {exporting ? "다운로드 중..." : "엑셀"}
              </button>
            ) : null}
          </div>
          {historyQuery.isLoading ? (
            <LoadingSpinner size="sm" message="추이 데이터 로딩 중..." />
          ) : historyQuery.error ? (
            <p className="text-sm text-red-500">추이 데이터를 불러오지 못했습니다.</p>
          ) : (
            <LazyUnsoldChart items={historyQuery.data?.items ?? []} />
          )}
        </section>
      </div>
    </div>
  );
}
