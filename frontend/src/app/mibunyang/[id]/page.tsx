"use client";

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

const LazyUnsoldChart = dynamic(() => import("@/components/mb/MbUnsoldTrendChart"), {
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

  const apt = detailQuery.data;
  if (!apt) return null;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* 헤더 */}
      <div className="mb-6">
        <button onClick={goBack} className="text-sm text-gray-500 hover:text-gray-700 mb-2" aria-label="뒤로 가기">
          ← 목록으로
        </button>
        <h1 className="text-2xl font-bold text-gray-900">{apt.name}</h1>
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
        <TradeStatsSection apartment={apt} />

        {/* 미분양 추이 */}
        <section className="bg-white rounded-lg shadow-sm border p-4 md:p-6">
          <h3 className="text-base font-bold text-gray-800 mb-4 pb-2 border-b border-gray-200">미분양 추이</h3>
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
