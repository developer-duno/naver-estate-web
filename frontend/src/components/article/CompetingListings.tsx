"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getArticles } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { formatKoreanPrice } from "@/lib/format";
import { areaGroupOf, sameAreaFilters } from "@/lib/area-group";
import { InfoCard, InfoRow } from "@/components/article/InfoCards";

interface Props {
  complexNo: string;
  tradeTypeName?: string;
  currentArticleNo: string;
  /** 지금 매물 전용면적(㎡) — 같은 면적 묶음(소수점 버림)끼리만 비교한다(세션 475 PR 6). 모르면 모든 면적 */
  areaM2?: number | null;
  /** B2 게이트 토큰 — 부모(ArticleDetail)와 같은 queryKey 라 토큰도 같이 받아야 한다 (세션 395) */
  accessToken?: string;
  /**
   * 세션 해석 완료 여부. **필수** — 기본값을 두면 새 호출부가 토큰을 빠뜨려도 컴파일이
   * 통과해 B2 게이트 401 이 조용히 재발한다(세션 395 사후검증). 비로그인은 accessToken
   * 만 undefined 이고 tokenReady 는 여전히 true 로 넘어온다.
   */
  tokenReady: boolean;
}

export default function CompetingListings({ complexNo, tradeTypeName, currentArticleNo, areaM2, accessToken, tokenReady }: Props) {
  // 서버가 같은 면적 묶음으로 먼저 거른다 — 첫 쪽만 받아도 맞는 매물이 빠지지 않게(세션 475 보완)
  const filters = sameAreaFilters(tradeTypeName, areaM2);

  const { data, isError } = useQuery({
    queryKey: queryKeys.articles(complexNo, filters),
    queryFn: () => getArticles(complexNo, filters, accessToken),
    enabled: !!complexNo && tokenReady,
  });

  const group = areaGroupOf(areaM2);

  const stats = useMemo(() => {
    if (isError || !data?.articles) return null;
    const others = data.articles.filter(
      (a) => a.article_no !== currentArticleNo && (group == null || areaGroupOf(a.area2_m2) === group),
    );
    if (others.length === 0) return { count: 0 };

    const prices = others.map((a) => a.numeric_price).filter((p): p is number => p != null && p > 0);
    const ppyeongs = others.map((a) => a.price_per_pyeong).filter((p): p is number => p != null && p > 0);

    return {
      count: others.length,
      minPrice: prices.length > 0 ? Math.min(...prices) : null,
      maxPrice: prices.length > 0 ? Math.max(...prices) : null,
      avgPpyeong: ppyeongs.length > 0 ? Math.round(ppyeongs.reduce((s, v) => s + v, 0) / ppyeongs.length) : null,
    };
  }, [data, currentArticleNo, isError, group]);

  if (!stats) return null;

  const label = tradeTypeName ?? "전체";
  const areaLabel = group != null ? ` · 같은 면적(${group}㎡ 대)` : "";

  if (stats.count === 0) {
    return (
      <InfoCard title="경쟁 매물">
        <p className="text-sm text-gray-500">같은 단지{group != null ? `·같은 면적(${group}㎡ 대)` : ""}에 {label} 경쟁 매물이 없습니다 (단독 매물)</p>
      </InfoCard>
    );
  }

  return (
    <InfoCard title="경쟁 매물">
      <InfoRow label={`같은 단지 ${label}${areaLabel}`} value={`${stats.count}건`} />
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
