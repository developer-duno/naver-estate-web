"use client";

import { useQueries, type UseQueryResult } from "@tanstack/react-query";
import { getPublicPriceHistory } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { Card } from "@/components/ui/card";
import Skeleton from "@/components/Skeleton";
import LoadRetry from "@/components/complex/consumer/LoadRetry";
import { MonthBands } from "@/components/complex/consumer/PriceTrendSection";
import { currentYm } from "@/components/complex/consumer/consumer-format";
import type { PublicPriceHistory } from "@/types";

/** 칸 하나의 재료 — 면적은 단지 화면과 같은 defaultArea 로 고른 값 */
export interface PublicTrendTarget {
  complex_no: string;
  complex_name: string;
  area: number;
}

interface TrendCell {
  target: PublicTrendTarget;
  query: UseQueryResult<PublicPriceHistory>;
}

export interface PublicTrend {
  /** 그릴 칸 — 기록이 없다고 확정된 단지는 빠진다(불러오는 중·실패는 남는다) */
  cells: TrendCell[];
  /** 모든 단지 응답이 왔나 — 그 전엔 눈금을 정하지 않는다 */
  settled: boolean;
  /** 같은 눈금 — 기록 있는 전 단지 two_year 최저~최고 */
  range?: { min: number; max: number };
}

/** 최근 2년 거래가 있는 응답인가 — months 가 비거나 two_year 가 없으면 기록 없음 */
function hasTrades(h: PublicPriceHistory | undefined): h is PublicPriceHistory & { two_year: { min: number; max: number } } {
  return !!h && h.months.length > 0 && h.two_year != null;
}

/**
 * 비로그인 비교표 실거래가 추이 재료(세션 491). 카드를 그릴지·출처 글자를 정하려고 화면이 직접 부른다.
 * 공개 창구(인증 없음)라 토큰을 보내지 않는다. 쿼리 키 = 단지 화면과 같은 publicPriceHistory(no, area).
 */
export function usePublicTrend(targets: PublicTrendTarget[], enabled: boolean): PublicTrend {
  const queries = useQueries({
    queries: targets.map((t) => ({
      queryKey: queryKeys.publicPriceHistory(t.complex_no, t.area),
      queryFn: () => getPublicPriceHistory(t.complex_no, t.area),
      enabled,
      staleTime: 60_000,
    })),
  });
  // 실패는 '기록 없음'이 아니다 — 칸을 남겨 다시 시도(.claude/rules/error-propagation.md)
  const cells = targets
    .map((target, i) => ({ target, query: queries[i] }))
    .filter(({ query }) => query.isError || query.isLoading || hasTrades(query.data));
  // 다 받은 뒤에 눈금을 정한다 — 늦게 온 단지 때문에 먼저 그린 칸의 눈금이 바뀌지 않게
  const settled = queries.every((q) => !q.isLoading);
  const traded = queries.map((q) => q.data).filter(hasTrades);
  const range = traded.length > 0
    ? { min: Math.min(...traded.map((h) => h.two_year.min)), max: Math.max(...traded.map((h) => h.two_year.max)) }
    : undefined;
  return { cells, settled, range };
}

interface Props {
  trend: PublicTrend;
  /** 띠 그래프 마지막 달 "YYYYMM" — 기본 = 오늘 달, 시험은 고정값 */
  endYm?: string;
}

/**
 * 비로그인 비교표 — 실거래가 추이(사장님 11-01 결정 '가: 단지마다 작은 그래프').
 * 단지마다 대표 면적의 월별 최저~최고 띠(단지 화면 MonthBands 와 같은 모양) · 모든 칸이 같은 눈금이라 높낮이를 바로 비교한다.
 * 우리에게 실거래 기록이 없는 단지는 칸을 그리지 않는다(사장님 11-01 "그 칸은 안 그림").
 */
export default function ComparePublicTrend({ trend, endYm = currentYm() }: Props) {
  const { cells, settled, range } = trend;
  return (
    <Card className="p-4 gap-3" data-testid="compare-public-trend">
      <h2 className="text-base font-bold">실거래가 추이 · 대표 면적 · 최근 2년</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {cells.map(({ target, query: q }) => {
          const h = q.data;
          return (
            <div key={target.complex_no} className="space-y-1 min-w-0" data-testid="compare-public-trend-cell">
              <h3 className="text-sm font-semibold">
                {target.complex_name}
                {h?.area_m2 != null && ` 전용 ${h.area_m2}㎡`}
              </h3>
              {q.isError ? (
                <LoadRetry onRetry={() => q.refetch()} />
              ) : !settled || !hasTrades(h) ? (
                <Skeleton className="w-full max-w-[480px] h-28" />
              ) : (
                <MonthBands history={h} endYm={endYm} range={range} />
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
