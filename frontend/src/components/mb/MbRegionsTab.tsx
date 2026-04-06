"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import MbRegionStatsTable from "@/components/mb/MbRegionStatsTable";
import { MbTabContent, ExportButton } from "@/components/mb/MbTabContent";
import { exportMbRegionsToXlsx } from "@/lib/mb-export";
import type { MbRegion } from "@/types";

/** 지역 통계 탭 — 시/군/구별 인구·세대·미분양·시세 */
export default function MbRegionsTab({
  query,
}: {
  query: UseQueryResult<{ regions: MbRegion[]; total: number }>;
}) {
  return (
    <MbTabContent loading={query.isLoading} error={query.error} refetch={query.refetch}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-500">
          {query.data?.regions?.length ?? 0}개 지역
        </span>
        <ExportButton
          disabled={!query.data?.regions?.length}
          onClick={() => exportMbRegionsToXlsx(query.data?.regions ?? [])}
        />
      </div>
      <MbRegionStatsTable regions={query.data?.regions ?? []} />
    </MbTabContent>
  );
}
