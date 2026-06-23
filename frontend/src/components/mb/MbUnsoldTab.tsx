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
  const apartments = query.data?.unsold ?? [];

  return (
    <MbTabContent loading={query.isLoading} error={query.error} refetch={query.refetch}>
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-3">
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
        <>
          {/* 미분양만 탭도 지역 선택 전제 → 항상 그 지역 fitBounds */}
          <LazyClusterMap apartments={apartments} onSelect={setSelected} regionSelected />
          {/* 선택 단지가 현재 목록에 있을 때만 카드 표시 — 페이지 전환 후 옛 선택 stale 방지 */}
          {selected && apartments.some((a) => a.id === selected.id) && (
            <MbSelectedCard apt={selected} onClose={() => setSelected(null)} />
          )}
        </>
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
