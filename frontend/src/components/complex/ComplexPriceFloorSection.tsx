"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { getPriceStats } from "@/lib/api";
import ComplexPriceFloorTab from "@/components/ComplexPriceFloorTab";
import type { ArticleFilters } from "@/types";

interface Props {
  complexNo: string;
  onFilterChange?: (filters: ArticleFilters) => void;
}

/** 층수별 가격 섹션 — useQuery wrapper. 기존 ComplexPriceFloorTab UI 재활용. */
export default function ComplexPriceFloorSection({ complexNo, onFilterChange }: Props) {
  const priceStatsQuery = useQuery({
    queryKey: queryKeys.priceStats(complexNo),
    queryFn: () => getPriceStats(complexNo),
    staleTime: 30_000,
  });

  return (
    <ComplexPriceFloorTab
      priceStats={priceStatsQuery.data ?? null}
      error={priceStatsQuery.isError}
      loading={priceStatsQuery.isLoading}
      onFilterChange={onFilterChange}
      onRetry={() => priceStatsQuery.refetch()}
    />
  );
}
