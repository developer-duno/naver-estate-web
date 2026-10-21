import { useQuery } from "@tanstack/react-query";
import { getArticles } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { areaGroupOf, areaGroupRange } from "@/lib/area-group";

/** 매매 평균 요청 필터 — 경쟁 매물(CompetingListings)과 같은 queryKey 모양 */
const MAEMAE_FILTERS = { trade_types: "매매" };

/**
 * 단지 매물 건수 + 매매 매물 평균 호가 훅 (PR 6c §단계 A · 세션 475 PR 6)
 *
 * - count = 전체 매물 첫 쪽 응답의 total — "매물 N건". 요청·queryKey 는 그대로라 useCrawlAction 의
 *   `articles(no, undefined)` 다시 받기가 이 숫자를 갱신한다.
 * - avgPrice = 매매 매물만, avgAreaM2 묶음(소수점 버림)이 있으면 그 묶음만의 평균 — 거래유형·면적이 섞인
 *   평균을 막는다. complex.nearby_median_price 가 없을 때의 대체값이라 avgEnabled 일 때만 요청한다(기본 꺼짐 — 건수만 쓰는 곳은 요청 1개 그대로).
 */
export function useComplexArticleAvg(
  complexNo: string,
  accessToken?: string,
  opts: { avgEnabled?: boolean; avgAreaM2?: number | null } = {},
): {
  avgPrice: number | null;
  count: number;
  isLoading: boolean;
  isError: boolean;
} {
  const { avgEnabled = false, avgAreaM2 = null } = opts;
  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.articles(complexNo, undefined),
    queryFn: () => getArticles(complexNo, undefined, accessToken),
    enabled: !!complexNo,
    staleTime: 30_000,
  });
  const group = areaGroupOf(avgAreaM2);
  // 서버가 매매·같은 면적 묶음으로 먼저 거른다 — 첫 쪽만 받아도 그 묶음 매물이 빠지지 않게(세션 475 보완)
  const maemaeFilters = group != null ? { ...MAEMAE_FILTERS, ...areaGroupRange(group) } : MAEMAE_FILTERS;
  const maemae = useQuery({
    queryKey: queryKeys.articles(complexNo, maemaeFilters),
    queryFn: () => getArticles(complexNo, maemaeFilters, accessToken),
    enabled: !!complexNo && avgEnabled,
    staleTime: 30_000,
  });

  const prices = (maemae.data?.articles ?? [])
    .filter((a) => group == null || areaGroupOf(a.area2_m2) === group)
    .map((a) => a.numeric_price)
    .filter((p): p is number => p != null && p > 0);
  const avgPrice = avgEnabled && !maemae.isError && prices.length > 0
    ? Math.round(prices.reduce((s, v) => s + v, 0) / prices.length)
    : null;

  if (isError || !data) {
    return { avgPrice, count: 0, isLoading, isError };
  }

  return {
    avgPrice,
    count: data.total ?? 0,
    isLoading,
    isError,
  };
}
