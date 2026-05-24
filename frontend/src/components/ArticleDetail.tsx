"use client";

import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { getArticleLive, getArticles, getPriceStats, getPyeongDetails } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { tradeKey } from "@/lib/trade-types";
import type { Article, Complex } from "@/types";
import Skeleton from "@/components/Skeleton";
import ChartAccordion from "@/components/ChartAccordion";
import PriceHeader from "@/components/article/PriceHeader";
import MarketPosition from "@/components/article/MarketPosition";
import CompetingListings from "@/components/article/CompetingListings";
import InfoCards from "@/components/article/InfoCards";
import MaintenanceCost from "@/components/article/MaintenanceCost";
import ArticleDescription from "@/components/article/ArticleDescription";
import PriceHistoryTable from "@/components/article/PriceHistoryTable";
import ArticleFavoriteButton from "@/components/ArticleFavoriteButton";

interface Props {
  articleNo: string;
  onClose: () => void;
  complex?: Complex;
}

export default function ArticleDetail({ articleNo, onClose, complex }: Props) {
  const { data: article, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.articleLive(articleNo),
    queryFn: () => getArticleLive(articleNo),
  });

  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const prev = document.activeElement as HTMLElement | null;
    el.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key !== "Tab") return;
      const focusable = el.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => { document.removeEventListener("keydown", handleKeyDown); prev?.focus(); };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="article-detail-title"
        className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center gap-2 px-6 py-4 border-b">
          <h2 id="article-detail-title" className="text-lg font-bold truncate min-w-0">
            매물 상세{article?.complex_name ? ` — ${article.complex_name}` : ""}
          </h2>
          <div className="flex items-center gap-1 shrink-0 no-print">
            {article && (
              <>
                <ArticleFavoriteButton
                  articleNo={articleNo}
                  complexNo={article.complex_no}
                  complexName={article.complex_name}
                  tradeTypeName={article.trade_type_name}
                  price={article.deal_or_warrant_prc}
                />
              </>
            )}
            <button onClick={onClose} aria-label="닫기" className="text-gray-400 hover:text-gray-600 text-xl">×</button>
          </div>
        </div>

        <div className="overflow-y-auto p-6 max-h-[calc(90vh-64px)]">
          {isLoading && (
            <div role="status" aria-label="로딩 중" className="py-4 space-y-3">
              <span className="sr-only">매물 정보를 불러오는 중...</span>
              <Skeleton className="h-8 w-2/3" />
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-40 w-full" />
            </div>
          )}
          {!isLoading && isError && (
            <div className="text-center py-8">
              <p className="text-red-500 mb-3">매물 정보를 불러올 수 없습니다.</p>
              <button onClick={() => refetch()} className="text-sm text-blue-600 hover:underline">다시 시도</button>
            </div>
          )}
          {!isLoading && !isError && !article && (
            <p className="text-center text-gray-500 py-8">매물 정보를 불러올 수 없습니다.</p>
          )}
          {!isLoading && article && (
            <ArticleDetailBody article={article} articleNo={articleNo} complex={complex} />
          )}
        </div>
      </div>
    </div>
  );
}

interface BodyProps {
  article: Article;
  articleNo: string;
  complex?: Complex;
}

function ArticleDetailBody({ article, articleNo, complex }: BodyProps) {
  const complexNo = article.complex_no;
  const area2M2 = article.area2_m2;
  const tradeTypeName = article.trade_type_name;
  const validArea = area2M2 != null && area2M2 > 0;

  // 자식 컴포넌트와 동일 queryKey — React Query 가 dedupe 하므로 네트워크 호출 증가 0
  const priceStatsQuery = useQuery({
    queryKey: queryKeys.priceStats(complexNo),
    queryFn: () => getPriceStats(complexNo),
    enabled: !!complexNo,
  });
  const pyeongQuery = useQuery({
    queryKey: queryKeys.pyeongDetails(complexNo),
    queryFn: () => getPyeongDetails(complexNo),
    enabled: !!complexNo,
  });
  const competingFilters = tradeTypeName ? { trade_types: tradeTypeName } : undefined;
  const articlesQuery = useQuery({
    queryKey: queryKeys.articles(complexNo, competingFilters),
    queryFn: () => getArticles(complexNo, competingFilters),
    enabled: !!complexNo,
  });

  const hasMarketPosition = useMemo(() => {
    if (priceStatsQuery.isError || !priceStatsQuery.data || !validArea) return false;
    const bucket = Math.floor((area2M2 as number) / 5) * 5;
    const matched = priceStatsQuery.data.by_area.find((row) => {
      const num = parseInt(row.label, 10);
      return !isNaN(num) && num === bucket;
    });
    if (!matched) return false;
    const key = tradeKey(tradeTypeName);
    if (!key) return false;
    return matched[key] != null;
  }, [priceStatsQuery.data, priceStatsQuery.isError, area2M2, validArea, tradeTypeName]);

  const hasMaintenance = useMemo(() => {
    if (pyeongQuery.isError || !pyeongQuery.data?.pyeong_details?.length || !validArea) return false;
    return pyeongQuery.data.pyeong_details.some(
      (p) =>
        (p.avg_maintenance_cost != null && p.avg_maintenance_cost !== 0) ||
        (p.summer_maintenance_cost != null && p.summer_maintenance_cost !== 0) ||
        (p.winter_maintenance_cost != null && p.winter_maintenance_cost !== 0) ||
        (p.latest_maintenance_cost != null && p.latest_maintenance_cost !== 0),
    );
  }, [pyeongQuery.data, pyeongQuery.isError, validArea]);

  const hasCompeting = useMemo(() => {
    if (articlesQuery.isError || !articlesQuery.data?.articles) return false;
    // count === 0 도 "단독 매물" 안내 박스 렌더하므로 hasContent = true
    return true;
  }, [articlesQuery.data, articlesQuery.isError]);

  return (
    <div className="space-y-4">
      <PriceHeader article={article} />
      <PriceHistoryTable articleNo={articleNo} />
      <InfoCards article={article} complex={complex} />
      <ChartAccordion
        title="시세 정보"
        hasContent={hasMarketPosition}
        emptyHint={
          priceStatsQuery.isError
            ? "시세 정보를 불러오지 못했습니다."
            : "이 면적의 시세 정보가 아직 수집되지 않았습니다."
        }
      >
        <MarketPosition complexNo={complexNo} tradeTypeName={tradeTypeName} area2M2={area2M2} />
      </ChartAccordion>
      <ChartAccordion
        title="경쟁 매물"
        hasContent={hasCompeting}
        emptyHint="경쟁 매물 정보를 불러오지 못했습니다."
      >
        <CompetingListings complexNo={complexNo} tradeTypeName={tradeTypeName} currentArticleNo={articleNo} />
      </ChartAccordion>
      <ChartAccordion
        title="관리비 상세"
        hasContent={hasMaintenance}
        emptyHint={
          pyeongQuery.isError
            ? "관리비 정보를 불러오지 못했습니다."
            : "이 면적의 관리비 정보가 아직 수집되지 않았습니다."
        }
      >
        <MaintenanceCost complexNo={complexNo} area2M2={area2M2} />
      </ChartAccordion>
      <ArticleDescription article={article} />
    </div>
  );
}
