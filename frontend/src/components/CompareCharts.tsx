"use client";

import React, { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { getPriceHistory, getPriceStats, getPyeongDetails } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import Skeleton from "@/components/Skeleton";
import ErrorBoundary from "@/components/ErrorBoundary";
import ChartAccordion from "@/components/ChartAccordion";
import CompareRadarChart from "@/components/CompareRadarChart";
import ComparePriceTrendChart from "@/components/ComparePriceTrendChart";
import ComparePriceBarChart from "@/components/ComparePriceBarChart";
import CompareFloorChart from "@/components/CompareFloorChart";
import CompareAreaPriceTable from "@/components/CompareAreaPriceTable";
import CompareMaintenanceTable from "@/components/CompareMaintenanceTable";
import CompareUnitCompositionTable from "@/components/CompareUnitCompositionTable";
import type { Complex, PriceStats, PriceHistoryResponse, PyeongDetail } from "@/types";

/* ── Props ── */

interface Props {
  complexes: { complex_no: string; complex_name: string }[];
  fullComplexes: Complex[];
  pricePerPyeong?: Record<string, number>;
  expandAll?: boolean;
  /** B2 게이트: 승인 중개사 전용 시세·면적 데이터 조회용 토큰 */
  accessToken?: string;
  /** 토큰 해석 완료 여부 — 쿼리 enabled 가드 (승인 중개사 잠금 오인 차단) */
  tokenReady?: boolean;
}

/**
 * 에러 분기 공용 안내 + "다시 시도" (ArticleDetail RetryHint 선례).
 * onRetry 는 실패한 쿼리만 재조회하는 그룹 핸들러를 받는다.
 */
function RetryNotice({ message, onRetry, className }: { message: string; onRetry: () => void; className?: string }) {
  return (
    <div className={className}>
      <p className="text-sm text-red-600">{message}</p>
      <button
        type="button"
        onClick={() => onRetry()}
        className="text-xs text-blue-600 hover:underline mt-1"
      >
        다시 시도
      </button>
    </div>
  );
}

/* ── 메인 컨테이너 ── */

export default function CompareCharts({ complexes, fullComplexes, pricePerPyeong, expandAll = false, accessToken, tokenReady = true }: Props) {
  // 데이터 fetch (B2 게이트: accessToken 전달 + tokenReady enabled 가드)
  const historyQueries = useQueries({
    queries: complexes.map((c) => ({
      queryKey: queryKeys.priceHistory(c.complex_no),
      queryFn: () => getPriceHistory(c.complex_no, undefined, undefined, accessToken),
      enabled: tokenReady,
      staleTime: 60_000,
    })),
  });

  const statsQueries = useQueries({
    queries: complexes.map((c) => ({
      queryKey: queryKeys.priceStats(c.complex_no),
      queryFn: () => getPriceStats(c.complex_no, accessToken),
      enabled: tokenReady,
      staleTime: 60_000,
    })),
  });

  const pyeongQueries = useQueries({
    queries: complexes.map((c) => ({
      queryKey: queryKeys.pyeongDetails(c.complex_no),
      queryFn: () => getPyeongDetails(c.complex_no, accessToken),
      enabled: tokenReady,
      staleTime: 60_000,
    })),
  });

  const historyLoading = historyQueries.some((q) => q.isLoading);
  const statsLoading = statsQueries.some((q) => q.isLoading);
  const historyError = historyQueries.some((q) => q.isError);
  const statsError = statsQueries.some((q) => q.isError);
  const pyeongError = pyeongQueries.some((q) => q.isError);

  // 그룹별 재시도 — 실패한 쿼리만 재조회 (성공분 불필요 재호출 방지)
  const retryHistory = () => historyQueries.forEach((q) => { if (q.isError) q.refetch(); });
  const retryStats = () => statsQueries.forEach((q) => { if (q.isError) q.refetch(); });
  const retryPyeong = () => pyeongQueries.forEach((q) => { if (q.isError) q.refetch(); });

  // 데이터 조립
  const historyDatasets = complexes
    .map((c, i) => {
      const data = historyQueries[i]?.data as PriceHistoryResponse | undefined;
      if (!data?.items?.length) return null;
      return { complexNo: c.complex_no, complexName: c.complex_name, items: data.items };
    })
    .filter(Boolean) as { complexNo: string; complexName: string; items: PriceHistoryResponse["items"] }[];

  const statsDatasets = complexes
    .map((c, i) => {
      const data = statsQueries[i]?.data as PriceStats | undefined;
      if (!data) return null;
      return { complexNo: c.complex_no, complexName: c.complex_name, priceStats: data };
    })
    .filter(Boolean) as { complexNo: string; complexName: string; priceStats: PriceStats }[];

  const pyeongDatasets = useMemo(() =>
    complexes
      .map((c, i) => {
        const data = pyeongQueries[i]?.data as { pyeong_details: PyeongDetail[] } | undefined;
        if (!data?.pyeong_details?.length) return null;
        return { name: c.complex_name, details: data.pyeong_details };
      })
      .filter(Boolean) as { name: string; details: PyeongDetail[] }[],
  [complexes, pyeongQueries]);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">가격 비교 차트</h2>

      {/* 1. 레이더 — API 불필요, 즉시 렌더 */}
      <ChartAccordion title="종합 비교 (레이더)" defaultOpen forceOpen={expandAll}>
        <ErrorBoundary>
          <CompareRadarChart complexes={fullComplexes} pricePerPyeong={pricePerPyeong} />
        </ErrorBoundary>
      </ChartAccordion>

      {/* 2. 가격 추이 */}
      <ChartAccordion title="가격 추이 비교" forceOpen={expandAll}>
        <ErrorBoundary>
          {historyLoading ? (
            <div role="status" aria-label="로딩 중" className="py-4">
              <span className="sr-only">가격 추이 로딩 중...</span>
              <Skeleton className="h-72 w-full" />
            </div>
          ) : historyError ? (
            <RetryNotice className="py-4 text-center" message="가격 추이를 불러오지 못했습니다." onRetry={retryHistory} />
          ) : historyDatasets.length > 0 ? (
            <ComparePriceTrendChart datasets={historyDatasets} />
          ) : (
            <p className="text-gray-500 text-sm py-4 text-center">가격 추이 데이터가 없습니다.</p>
          )}
        </ErrorBoundary>
      </ChartAccordion>

      {/* 3. 현재 평균가 */}
      <ChartAccordion title="현재 평균가 비교" forceOpen={expandAll}>
        <ErrorBoundary>
          {statsLoading ? (
            <div role="status" aria-label="로딩 중" className="py-4">
              <span className="sr-only">가격 통계 로딩 중...</span>
              <Skeleton className="h-72 w-full" />
            </div>
          ) : statsError ? (
            <RetryNotice className="py-4 text-center" message="가격 통계를 불러오지 못했습니다." onRetry={retryStats} />
          ) : statsDatasets.length > 0 ? (
            <ComparePriceBarChart datasets={statsDatasets} />
          ) : (
            <p className="text-gray-500 text-sm py-4 text-center">가격 통계 데이터가 없습니다.</p>
          )}
        </ErrorBoundary>
      </ChartAccordion>

      {/* 4. 층별 가격 */}
      <ChartAccordion title="층별 가격 비교" forceOpen={expandAll}>
        <ErrorBoundary>
          {statsLoading ? (
            <div role="status" aria-label="로딩 중" className="py-4">
              <span className="sr-only">층별 가격 로딩 중...</span>
              <Skeleton className="h-72 w-full" />
            </div>
          ) : statsError ? (
            <RetryNotice className="py-4 text-center" message="층별 가격을 불러오지 못했습니다." onRetry={retryStats} />
          ) : statsDatasets.length > 0 ? (
            <CompareFloorChart datasets={statsDatasets} />
          ) : (
            <p className="text-gray-500 text-sm py-4 text-center">층별 가격 데이터가 없습니다.</p>
          )}
        </ErrorBoundary>
      </ChartAccordion>

      {/* 5. 상세 데이터 */}
      <ChartAccordion title="상세 데이터 (면적별 가격 · 관리비 · 세대구성)" forceOpen={expandAll}>
        <ErrorBoundary>
          <div className="space-y-6">
            {/* 5-A: 면적별 가격표 */}
            <div>
              <h3 className="text-sm font-semibold mb-2">면적별 가격</h3>
              {statsError ? (
                <RetryNotice message="면적별 가격을 불러오지 못했습니다." onRetry={retryStats} />
              ) : statsDatasets.length > 0 ? (
                <CompareAreaPriceTable
                  datasets={statsDatasets.map((ds) => ({
                    name: ds.complexName,
                    stats: ds.priceStats,
                  }))}
                />
              ) : (
                <p className="text-gray-500 text-sm">면적별 데이터 없음</p>
              )}
            </div>

            {/* 5-B: 관리비 비교 */}
            <div>
              <h3 className="text-sm font-semibold mb-2">관리비 비교</h3>
              {pyeongError ? (
                <RetryNotice message="관리비를 불러오지 못했습니다." onRetry={retryPyeong} />
              ) : pyeongDatasets.length > 0 ? (
                <CompareMaintenanceTable datasets={pyeongDatasets} />
              ) : (
                <p className="text-gray-500 text-sm">관리비 데이터 없음</p>
              )}
            </div>

            {/* 5-C: 세대 구성 */}
            <div>
              <h3 className="text-sm font-semibold mb-2">세대 구성</h3>
              {pyeongError ? (
                <RetryNotice message="세대 구성을 불러오지 못했습니다." onRetry={retryPyeong} />
              ) : pyeongDatasets.length > 0 ? (
                <CompareUnitCompositionTable datasets={pyeongDatasets} />
              ) : (
                <p className="text-gray-500 text-sm">세대 구성 데이터 없음</p>
              )}
            </div>
          </div>
        </ErrorBoundary>
      </ChartAccordion>
    </div>
  );
}
