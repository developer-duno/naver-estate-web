"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import MbApartmentTable from "@/components/mb/MbApartmentTable";
import { MbTabContent, ExportButton } from "@/components/mb/MbTabContent";
import { exportMbApartmentsToXlsx } from "@/lib/mb-export";
import type { MbApartment } from "@/types";

/** 미분양만 탭 — unsold > 0 아파트 목록 */
export default function MbUnsoldTab({
  query,
  sort,
  onSortChange,
  isInCompare,
  onCompareToggle,
  compareFull,
}: {
  query: UseQueryResult<{ unsold: MbApartment[]; total: number }>;
  sort: string;
  onSortChange: (s: string) => void;
  isInCompare: (id: string) => boolean;
  onCompareToggle: (id: string, name: string) => void;
  compareFull: boolean;
}) {
  return (
    <MbTabContent loading={query.isLoading} error={query.error} refetch={query.refetch}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-500">
          미분양 {query.data?.total?.toLocaleString() ?? 0}개
        </span>
        <ExportButton
          disabled={!query.data?.unsold?.length}
          onClick={() => exportMbApartmentsToXlsx(query.data?.unsold ?? [])}
        />
      </div>
      <MbApartmentTable
        apartments={query.data?.unsold ?? []}
        sort={sort}
        onSortChange={onSortChange}
        isInCompare={isInCompare}
        onCompareToggle={onCompareToggle}
        compareFull={compareFull}
      />
    </MbTabContent>
  );
}
