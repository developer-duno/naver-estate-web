"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { getPriceStats } from "@/lib/api";
import ComplexPriceFloorTab from "@/components/ComplexPriceFloorTab";
import LockedDataCard, { isAuthGateError, lockReasonOf } from "@/components/ui/locked-data-card";
import type { ArticleFilters } from "@/types";

interface Props {
  complexNo: string;
  onFilterChange?: (filters: ArticleFilters) => void;
  accessToken?: string;
  /** 비로그인 확정 — 요청 없이 잠금 카드(세션 481 보완 F4) */
  loggedOut?: boolean;
}

/** 층수별 가격 섹션 — useQuery wrapper. 기존 ComplexPriceFloorTab UI 재활용. */
export default function ComplexPriceFloorSection({ complexNo, onFilterChange, accessToken, loggedOut = false }: Props) {
  const priceStatsQuery = useQuery({
    queryKey: queryKeys.priceStats(complexNo),
    queryFn: () => getPriceStats(complexNo, accessToken),
    enabled: !loggedOut,
    staleTime: 30_000,
  });

  if (loggedOut) return <LockedDataCard label="층별 시세" />;
  // 401/403 은 잠금 안내 — ComplexPriceFloorTab 은 error 를 bool 로만 받아 구분 불가
  if (priceStatsQuery.isError && isAuthGateError(priceStatsQuery.error)) {
    return <LockedDataCard label="층별 시세" reason={lockReasonOf(priceStatsQuery.error)} />;
  }

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
