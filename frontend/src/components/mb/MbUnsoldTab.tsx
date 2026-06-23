"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { getMbApartmentDetail } from "@/lib/api";
import MbApartmentTable from "@/components/mb/MbApartmentTable";
import Pagination from "@/components/Pagination";
import { MbTabContent, ExportButton } from "@/components/mb/MbTabContent";
import MbSortSelect from "@/components/mb/MbSortSelect";
import MbViewToggle from "@/components/mb/MbViewToggle";
import MbSelectedCard from "@/components/mb/MbSelectedCard";
import MbMapToolbar, { type ToolbarLayer } from "@/components/mb/MbMapToolbar";
import MbInfraOverlay from "@/components/mb/MbInfraOverlay";
import { exportMbApartmentsToXlsx } from "@/lib/mb-export";
import { MB_APT_SORT_OPTIONS } from "@/lib/mb-sort-options";
import { PAGE_SIZE } from "@/lib/constants";
import { useMbViewMode } from "@/hooks/useMbViewMode";
import type { MbApartment } from "@/types";

// 지도는 무겁고 SSR 불가(window.naver) → dynamic(ssr:false).
const LazyClusterMap = dynamic(() => import("@/components/mb/MbClusterMap"), {
  ssr: false,
  loading: () => <div className="w-full h-96 rounded-lg border border-gray-200 bg-gray-50" />,
});

/** 미분양만 탭 — unsold > 0 아파트 목록 + 정렬 + 페이지네이션 + 지도 토글 */
export default function MbUnsoldTab({
  query,
  page,
  sort,
  onSortChange,
  onPageChange,
  isInCompare,
  onCompareToggle,
  compareFull,
}: {
  query: UseQueryResult<{ unsold: MbApartment[]; total: number }>;
  page: number;
  sort: string;
  onSortChange: (s: string) => void;
  onPageChange: (p: number) => void;
  isInCompare: (id: string) => boolean;
  onCompareToggle: (id: string, name: string) => void;
  compareFull: boolean;
}) {
  const { viewMode, setViewMode } = useMbViewMode();
  const [selected, setSelected] = useState<MbApartment | null>(null);
  const [activeLayer, setActiveLayer] = useState<ToolbarLayer | null>(null);
  const apartments = query.data?.unsold ?? [];

  // 마커 클릭 시 선택 단지 상세(중첩 infra/school/transport)를 lazy fetch — 목록 API 는 평탄
  // 필드만 줘서 교통·대기질·어린이집 레이어가 빈 정보였음(세션 319 A). 클릭당 1회, 우리 DB 조회
  // (네이버 IP 무관), 5분 캐시로 재선택 dedupe. selected 있을 때만 enabled.
  const detailQuery = useQuery({
    queryKey: queryKeys.mb.apartmentDetail(selected?.id ?? ""),
    queryFn: () => getMbApartmentDetail(selected!.id),
    enabled: !!selected,
    staleTime: 5 * 60 * 1000,
  });
  const detailApt = detailQuery.data ?? selected;

  return (
    <MbTabContent loading={query.isLoading} error={query.error} refetch={query.refetch}>
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-3 flex-none">
        <span className="text-sm text-gray-500">
          미분양 {query.data?.total?.toLocaleString() ?? 0}개
        </span>
        <div className="flex items-center gap-2">
          <MbViewToggle viewMode={viewMode} onChange={setViewMode} />
          {viewMode === "list" && (
            <>
              <MbSortSelect sort={sort} onSortChange={onSortChange} options={MB_APT_SORT_OPTIONS} defaultLabel="기본 (미분양 많은순)" />
              <ExportButton
                disabled={!apartments.length}
                onClick={() => exportMbApartmentsToXlsx(apartments)}
              />
            </>
          )}
        </div>
      </div>

      {viewMode === "map" ? (
        <div className="relative flex-1 min-h-0">
          <div className="absolute right-2 top-2 z-10">
            <MbMapToolbar active={activeLayer} onChange={setActiveLayer} />
          </div>
          {/* 미분양만 탭도 지역 선택 전제 → 항상 그 지역 fitBounds */}
          <LazyClusterMap apartments={apartments} onSelect={setSelected} regionSelected markerKind="unsold" className="h-full" />
          {/* 툴바 레이어를 켰는데 단지 선택 전이면 안내 — 버튼만 켜지고 무반응인 혼란 방지(세션 319 E). */}
          {activeLayer && !selected && (
            <div className="absolute left-2 bottom-2 z-10 bg-white/90 rounded-md border border-gray-200 px-3 py-1.5 shadow-sm" role="status">
              <p className="text-xs text-gray-600">지도에서 단지를 선택하면 정보가 표시됩니다.</p>
            </div>
          )}
          {/* 선택 단지가 현재 목록에 있을 때만 카드 표시 — 페이지 전환 후 옛 선택 stale 방지.
              지도 위 absolute 좌하단 오버레이 — 부모 overflow-hidden 클립 영역 밖(세션 319 리뷰 B). */}
          {selected && apartments.some((a) => a.id === selected.id) && (
            <div className="absolute left-2 right-2 bottom-2 z-10 sm:right-auto sm:max-w-md max-h-[55%] overflow-y-auto">
              <MbSelectedCard apt={selected} onClose={() => setSelected(null)}>
                {activeLayer && (
                  <MbInfraOverlay apt={detailApt ?? selected} layer={activeLayer} loading={detailQuery.isLoading} error={detailQuery.isError} />
                )}
              </MbSelectedCard>
            </div>
          )}
        </div>
      ) : (
        <>
          <MbApartmentTable
            apartments={apartments}
            sort={sort}
            onSortChange={onSortChange}
            isInCompare={isInCompare}
            onCompareToggle={onCompareToggle}
            compareFull={compareFull}
          />
          {query.data && query.data.total > PAGE_SIZE && (
            <div className="mt-4">
              <Pagination
                currentPage={page}
                totalPages={Math.ceil(query.data.total / PAGE_SIZE)}
                onPageChange={onPageChange}
              />
            </div>
          )}
        </>
      )}
    </MbTabContent>
  );
}
