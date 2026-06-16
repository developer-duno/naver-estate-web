"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { queryKeys } from "@/lib/query-keys";
import { getMbApartmentDetail, getMbUnsoldHistory, getMbPresaleDetail } from "@/lib/api";
import { useSmartBack } from "@/hooks/useSmartBack";
import {
  OverviewSection,
  PresaleSection,
  EnvironmentSection,
  TradeStatsSection,
} from "@/components/mb/MbDetailSections";
import MbScheduleTimeline from "@/components/mb/MbScheduleTimeline";
import MbUnitSupplyTable from "@/components/mb/MbUnitSupplyTable";
import LoadingSpinner from "@/components/LoadingSpinner";
import { SkeletonPage } from "@/components/Skeleton";
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

  // 분양 단지면(presale_type 보유) 청약 일정·평형별 공급 추가 조회.
  // detail 로드 후에만 활성화 — presale_type 으로 분양 여부 판별.
  const isPresale = apt?.presale_type != null;
  const presaleQuery = useQuery({
    queryKey: queryKeys.mb.presaleDetail(id),
    queryFn: () => getMbPresaleDetail(id),
    enabled: !!id && isPresale,
  });
  const presale = presaleQuery.data;
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
    return <SkeletonPage message="아파트 정보를 불러오는 중..." />;
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

        {/* 청약 일정 (차수별 12종) — 분양 단지 + 일정 데이터 있을 때 */}
        {isPresale && presale && presale.schedules.length > 0 && (
          <section data-testid="mb-presale-schedule" className="bg-white rounded-lg shadow-sm border p-4 md:p-6">
            <h3 className="text-base font-bold text-gray-800 mb-4 pb-2 border-b border-gray-200">청약 일정</h3>
            <MbScheduleTimeline schedules={presale.schedules} />
          </section>
        )}

        {/* 평형별 공급 + 특공 세분화 — 분양 단지 + 공급 데이터 있을 때 */}
        {isPresale && presale && presale.unit_supplies.length > 0 && (
          <section data-testid="mb-presale-units" className="bg-white rounded-lg shadow-sm border p-4 md:p-6">
            <h3 className="text-base font-bold text-gray-800 mb-4 pb-2 border-b border-gray-200">평형별 공급 현황</h3>
            <MbUnitSupplyTable units={presale.unit_supplies} summary={presale.presale_summary} />
          </section>
        )}

        <EnvironmentSection apartment={apt} />

        {apt.latitude != null && apt.longitude != null && apt.latitude !== 0 && apt.longitude !== 0 && (
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
            <div>
              <p className="text-sm text-red-500">추이 데이터를 불러오지 못했습니다.</p>
              <button
                type="button"
                onClick={() => historyQuery.refetch()}
                className="text-sm text-blue-600 hover:underline mt-1"
              >
                다시 시도
              </button>
            </div>
          ) : (
            <LazyUnsoldChart items={historyQuery.data?.items ?? []} />
          )}
        </section>
      </div>
    </div>
  );
}
