"use client";

import { useQueries } from "@tanstack/react-query";
import { getPublicPriceHistory } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { Card } from "@/components/ui/card";
import Skeleton from "@/components/Skeleton";
import LoadRetry from "@/components/complex/consumer/LoadRetry";
import { MonthBands } from "@/components/complex/consumer/PriceTrendSection";
import { currentYm } from "@/components/complex/consumer/consumer-format";
import type { PublicPriceHistory } from "@/types";

interface Props {
  complexes: { complex_no: string; complex_name: string }[];
  /** 띠 그래프 마지막 달 "YYYYMM" — 기본 = 오늘 달, 시험은 고정값 */
  endYm?: string;
}

/** 최근 2년 거래가 있는 응답인가 — months 가 비거나 two_year 가 없으면 "실거래 없음" 칸 */
function hasTrades(h: PublicPriceHistory | undefined): h is PublicPriceHistory & { two_year: { min: number; max: number } } {
  return !!h && h.months.length > 0 && h.two_year != null;
}

/**
 * 비로그인 비교표 — 실거래가 추이(세션 491, 사장님 11-01 결정 '가: 단지마다 작은 그래프').
 * 단지마다 대표 면적의 월별 최저~최고 띠(단지 화면 MonthBands 와 같은 모양).
 * 세로 범위 = 거래 있는 전 단지 two_year 의 최저~최고 — 모든 칸이 같은 눈금이라 높낮이를 바로 비교한다.
 * 공개 창구(인증 없음)라 토큰을 보내지 않는다. 실패는 그 칸에 다시 시도(.claude/rules/error-propagation.md).
 */
export default function ComparePublicTrend({ complexes, endYm = currentYm() }: Props) {
  const queries = useQueries({
    queries: complexes.map((c) => ({
      queryKey: queryKeys.publicPriceHistory(c.complex_no, null),
      queryFn: () => getPublicPriceHistory(c.complex_no),
      staleTime: 60_000,
    })),
  });
  // 다 받은 뒤에 눈금을 정한다 — 늦게 온 단지 때문에 먼저 그린 칸의 눈금이 바뀌지 않게
  const settled = queries.every((q) => !q.isLoading);
  const traded = queries.map((q) => q.data).filter(hasTrades);
  const range = traded.length > 0
    ? { min: Math.min(...traded.map((h) => h.two_year.min)), max: Math.max(...traded.map((h) => h.two_year.max)) }
    : undefined;

  return (
    <Card className="p-4 gap-3" data-testid="compare-public-trend">
      <h2 className="text-base font-bold">실거래가 추이 · 대표 면적 · 최근 2년</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {complexes.map((c, i) => {
          const q = queries[i];
          const h = q?.data;
          return (
            <div key={c.complex_no} className="space-y-1 min-w-0" data-testid="compare-public-trend-cell">
              <h3 className="text-sm font-semibold">
                {c.complex_name}
                {h?.area_m2 != null && ` ${h.area_m2}㎡`}
              </h3>
              {q?.isError ? (
                <LoadRetry onRetry={() => q.refetch()} />
              ) : !settled || !q || q.isLoading ? (
                <Skeleton className="w-full max-w-[480px] h-28" />
              ) : hasTrades(h) ? (
                <MonthBands history={h} endYm={endYm} range={range} />
              ) : (
                <p className="text-sm text-gray-500 py-6">최근 2년 실거래 없음</p>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
