"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import MbApartmentTable from "@/components/mb/MbApartmentTable";
import Pagination from "@/components/Pagination";
import { MbTabContent, ExportButton } from "@/components/mb/MbTabContent";
import { exportMbApartmentsToXlsx } from "@/lib/mb-export";
import { PAGE_SIZE } from "@/lib/constants";
import type { MbApartment } from "@/types";

/** 미분양 단지 탭 — 아파트 목록 + 정렬 + 페이지네이션 + 비교 */
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
  return (
    <MbTabContent loading={query.isLoading} error={query.error} refetch={query.refetch}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-500">
          총 {query.data?.total?.toLocaleString() ?? 0}개
        </span>
        <ExportButton
          disabled={!query.data?.apartments?.length}
          onClick={() => exportMbApartmentsToXlsx(query.data?.apartments ?? [])}
        />
      </div>
      <MbApartmentTable
        apartments={query.data?.apartments ?? []}
        startIndex={(page - 1) * PAGE_SIZE}
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
    </MbTabContent>
  );
}
