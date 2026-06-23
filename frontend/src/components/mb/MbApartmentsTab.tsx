"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { UseQueryResult } from "@tanstack/react-query";
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

// 지도는 무겁고 SSR 불가(window.naver) → dynamic(ssr:false). MbLocationMap [id]/page 선례 답습.
const LazyClusterMap = dynamic(() => import("@/components/mb/MbClusterMap"), {
  ssr: false,
  loading: () => <div className="w-full h-96 rounded-lg border border-gray-200 bg-gray-50" />,
});

/** 미분양 단지 탭 — 아파트 목록 + 정렬 + 페이지네이션 + 비교 + 지도 토글 */
export default function MbApartmentsTab({
  query,
  page,
  sort,
  onSortChange,
  onPageChange,
  isInCompare,
  onCompareToggle,
  compareFull,
}: {
  query: UseQueryResult<{ apartments: MbApartment[]; total: number; page: number; page_size: number }>;
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
  const apartments = query.data?.apartments ?? [];

  return (
    <MbTabContent loading={query.isLoading} error={query.error} refetch={query.refetch}>
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-3">
        <span className="text-sm text-gray-500">
          총 {query.data?.total?.toLocaleString() ?? 0}개
        </span>
        <div className="flex items-center gap-2">
          <MbViewToggle viewMode={viewMode} onChange={setViewMode} />
          {viewMode === "list" && (
            <>
              <MbSortSelect sort={sort} onSortChange={onSortChange} options={MB_APT_SORT_OPTIONS} defaultLabel="기본 (단지명순)" />
              <ExportButton
                disabled={!apartments.length}
                onClick={() => exportMbApartmentsToXlsx(apartments)}
              />
            </>
          )}
        </div>
      </div>

      {viewMode === "map" ? (
        <div className="relative">
          <div className="absolute right-2 top-2 z-10">
            <MbMapToolbar active={activeLayer} onChange={setActiveLayer} />
          </div>
          {/* 미분양단지 탭은 지역 선택이 전제(지역 미선택 시 안내 화면) → 항상 그 지역 fitBounds */}
          <LazyClusterMap apartments={apartments} onSelect={setSelected} regionSelected markerKind="unsold" className="h-[calc(100vh-220px)] min-h-100" />
          {/* 선택 단지가 현재 목록에 있을 때만 카드 표시 — 페이지·세그먼트 전환 후 옛 선택 stale 방지 */}
          {selected && apartments.some((a) => a.id === selected.id) && (
            <MbSelectedCard apt={selected} onClose={() => setSelected(null)}>
              {activeLayer && <MbInfraOverlay apt={selected} layer={activeLayer} />}
            </MbSelectedCard>
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
