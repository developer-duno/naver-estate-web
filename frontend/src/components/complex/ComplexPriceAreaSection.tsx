"use client";

import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { getPriceStats } from "@/lib/api";
import Skeleton from "@/components/Skeleton";
import type { ArticleFilters } from "@/types";

const LazyCharts = dynamic(() => import("@/components/PriceChartInner"), { ssr: false });

const AREA_FILTER_TOLERANCE_M2 = 4;

interface Props {
  complexNo: string;
  onFilterChange?: (filters: ArticleFilters) => void;
}

/** 면적별 가격 섹션 — 평균/최저/최고 막대 차트 + 클릭 시 해당 면적 필터 적용. */
export default function ComplexPriceAreaSection({ complexNo, onFilterChange }: Props) {
  const priceStatsQuery = useQuery({
    queryKey: queryKeys.priceStats(complexNo),
    queryFn: () => getPriceStats(complexNo),
    staleTime: 30_000,
  });

  if (priceStatsQuery.isLoading) {
    return (
      <div role="status" aria-label="로딩 중">
        <span className="sr-only">면적별 가격 로딩 중...</span>
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (priceStatsQuery.isError) {
    return (
      <div className="text-center py-4">
        <p className="text-red-500 text-sm">가격 통계를 불러오지 못했습니다</p>
        <button
          type="button"
          onClick={() => priceStatsQuery.refetch()}
          className="text-xs text-blue-600 hover:underline mt-2"
        >
          다시 시도
        </button>
      </div>
    );
  }
  const priceStats = priceStatsQuery.data;
  if (!priceStats || priceStats.by_area.length === 0) {
    return <p className="text-gray-500 text-sm text-center">면적별 가격 데이터가 부족합니다</p>;
  }

  const handleAreaClick = (label: string) => {
    if (!onFilterChange) return;
    const match = label.match(/(\d+)/);
    if (!match) return;
    const area = parseInt(match[1], 10);
    onFilterChange({
      min_area_m2: area - AREA_FILTER_TOLERANCE_M2,
      max_area_m2: area + AREA_FILTER_TOLERANCE_M2,
    });
  };

  return (
    <div>
      {onFilterChange && (
        <p className="text-xs text-gray-400 mb-1 text-right">막대를 클릭하면 해당 면적 매물만 표시됩니다</p>
      )}
      <LazyCharts type="area" data={priceStats.by_area} onAreaClick={onFilterChange ? handleAreaClick : undefined} />
    </div>
  );
}
