import { useQuery } from "@tanstack/react-query";
import { getArticles } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

/**
 * 단지 매물 평균 호가 + 건수 훅 (PR 6c §단계 A)
 *
 * complex.nearby_median_price / recent_trades_6m NULL fallback 으로 사용.
 * useCrawlAction prefix invalidation (`["articles", no]`) 으로 자동 갱신.
 */
export function useComplexArticleAvg(complexNo: string): {
  avgPrice: number | null;
  count: number;
  isLoading: boolean;
  isError: boolean;
} {
  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.articles(complexNo, undefined),
    queryFn: () => getArticles(complexNo, undefined),
    enabled: !!complexNo,
    staleTime: 30_000,
  });

  if (isError || !data) {
    return { avgPrice: null, count: 0, isLoading, isError };
  }

  const prices = (data.articles ?? [])
    .map((a) => a.numeric_price)
    .filter((p): p is number => p != null && p > 0);

  const avgPrice = prices.length > 0
    ? Math.round(prices.reduce((s, v) => s + v, 0) / prices.length)
    : null;

  return {
    avgPrice,
    count: data.total ?? 0,
    isLoading,
    isError,
  };
}
