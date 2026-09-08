"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getArticles } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { formatKoreanPrice } from "@/lib/format";
import { InfoCard, InfoRow } from "@/components/article/InfoCards";

interface Props {
  complexNo: string;
  tradeTypeName?: string;
  currentArticleNo: string;
  /** B2 게이트 토큰 — 부모(ArticleDetail)와 같은 queryKey 라 토큰도 같이 받아야 한다 (세션 395) */
  accessToken?: string;
  /** 세션 해석 완료 여부. 부모가 안 넘기면(단독 사용) 기존 동작 유지 */
  tokenReady?: boolean;
}

export default function CompetingListings({ complexNo, tradeTypeName, currentArticleNo, accessToken, tokenReady = true }: Props) {
  const filters = tradeTypeName ? { trade_types: tradeTypeName } : undefined;

  const { data, isError } = useQuery({
    queryKey: queryKeys.articles(complexNo, filters),
    queryFn: () => getArticles(complexNo, filters, accessToken),
    enabled: !!complexNo && tokenReady,
  });

  const stats = useMemo(() => {
    if (isError || !data?.articles) return null;
    const others = data.articles.filter((a) => a.article_no !== currentArticleNo);
    if (others.length === 0) return { count: 0 };

    const prices = others.map((a) => a.numeric_price).filter((p): p is number => p != null && p > 0);
    const ppyeongs = others.map((a) => a.price_per_pyeong).filter((p): p is number => p != null && p > 0);

    return {
      count: others.length,
      minPrice: prices.length > 0 ? Math.min(...prices) : null,
      maxPrice: prices.length > 0 ? Math.max(...prices) : null,
      avgPpyeong: ppyeongs.length > 0 ? Math.round(ppyeongs.reduce((s, v) => s + v, 0) / ppyeongs.length) : null,
    };
  }, [data, currentArticleNo, isError]);

  if (!stats) return null;

  const label = tradeTypeName ?? "전체";

  if (stats.count === 0) {
    return (
      <InfoCard title="경쟁 매물">
        <p className="text-sm text-gray-500">같은 단지에 {label} 경쟁 매물이 없습니다 (단독 매물)</p>
      </InfoCard>
    );
  }

  return (
    <InfoCard title="경쟁 매물">
      <InfoRow label={`같은 단지 ${label}`} value={`${stats.count}건`} />
      {stats.minPrice != null && stats.maxPrice != null && (
        <InfoRow
          label="가격 범위"
          value={stats.minPrice === stats.maxPrice
            ? formatKoreanPrice(stats.minPrice)
            : `${formatKoreanPrice(stats.minPrice)} ~ ${formatKoreanPrice(stats.maxPrice)}`}
        />
      )}
      {stats.avgPpyeong != null && (
        <InfoRow label="평균 평당가" value={`${stats.avgPpyeong.toLocaleString()}만원/평`} />
      )}
    </InfoCard>
  );
}
