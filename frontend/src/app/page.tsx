"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getStats } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import RegionSelector from "@/components/RegionSelector";
import EstateTypeTabs from "@/components/EstateTypeTabs";
import FilterBar from "@/components/FilterBar";
import SearchHistory from "@/components/SearchHistory";
import { ESTATE_TYPE_TABS } from "@/lib/constants";
import type { ArticleFilters } from "@/types";
import { buildFilterURL } from "@/hooks/useFilterParams";
import { useSearchHistory } from "@/hooks/useSearchHistory";
import { useFavorites } from "@/hooks/useFavorites";
import type { SearchHistoryItem } from "@/lib/storage";

export default function HomePage() {
  const router = useRouter();
  const allCodes = ESTATE_TYPE_TABS.map((t) => t.code) as string[];
  const [selectedTypes, setSelectedTypes] = useState<string[]>(["APT"]);
  const [articleFilters, setArticleFilters] = useState<ArticleFilters>({});
  const { history, add: addHistory, remove: removeHistory, clear: clearHistory } = useSearchHistory();
  const { favorites } = useFavorites();

  const { data: stats, isLoading: statsLoading, isError: statsError, refetch: loadStats } = useQuery({
    queryKey: queryKeys.stats,
    queryFn: () => getStats(),
    staleTime: 60_000,
  });

  const typesParam = selectedTypes.length < allCodes.length
    ? `&types=${selectedTypes.join(",")}`
    : "";

  const handleRegionSearch = (sido: string, sigungu: string, dong?: string) => {
    addHistory({ type: "region", sido, sigungu, dong });
    const extra: Record<string, string> = { sido, sigungu };
    if (dong) extra.dong = dong;
    if (typesParam) extra.types = selectedTypes.join(",");
    router.push(buildFilterURL("/search", extra, articleFilters));
  };

  const handleHistorySelect = (item: SearchHistoryItem) => {
    if (item.type === "keyword" && item.keyword) {
      const extra: Record<string, string> = { q: item.keyword };
      if (typesParam) extra.types = selectedTypes.join(",");
      router.push(buildFilterURL("/search", extra, articleFilters));
    } else if (item.type === "region" && item.sido && item.sigungu) {
      const extra: Record<string, string> = { sido: item.sido, sigungu: item.sigungu };
      if (item.dong) extra.dong = item.dong;
      if (typesParam) extra.types = selectedTypes.join(",");
      router.push(buildFilterURL("/search", extra, articleFilters));
    }
  };

  const complexCount = stats?.complex_count ?? 0;
  const articleCount = stats?.article_count ?? 0;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* hero band — main-hero.webp + 카피 (LCP 후보) */}
      <div className="relative w-full aspect-21/9 sm:aspect-3/1 mb-6 rounded-lg overflow-hidden bg-gray-100">
        <Image
          src="/blog-hero/main-hero.webp"
          alt="2u부동산 — 네이버 아파트·오피스텔 매물 조회"
          fill
          priority
          sizes="(max-width: 768px) 100vw, 768px"
          className="object-cover"
        />
      </div>

      {/* 타이틀 + 통계 인라인 */}
      <div className="text-center mb-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">네이버 아파트·오피스텔 매물 조회</h1>
        <p className="mt-1 text-sm text-gray-500">전국 매물을 검색하고 필터링하세요</p>
        {statsLoading ? (
          <p className="mt-2 text-sm text-gray-400">통계 로딩...</p>
        ) : statsError ? (
          <button onClick={() => loadStats()} className="mt-2 text-sm text-gray-400 hover:text-blue-500">통계 재시도</button>
        ) : (
          <div className="flex justify-center gap-3 mt-3">
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-5 py-2.5 text-center">
              <p className="text-xs text-blue-600 font-medium">단지</p>
              <p className="text-lg font-bold text-blue-700">{complexCount.toLocaleString()}</p>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-lg px-5 py-2.5 text-center">
              <p className="text-xs text-green-600 font-medium">매물</p>
              <p className="text-lg font-bold text-green-700">{articleCount.toLocaleString()}</p>
            </div>
          </div>
        )}
      </div>

      {/* 매물유형 탭 */}
      <div className="flex justify-center mb-4">
        <EstateTypeTabs selected={selectedTypes} onChange={setSelectedTypes} />
      </div>

      {/* 매물 필터 */}
      <div className="mb-4">
        <FilterBar onChange={setArticleFilters} />
      </div>

      {/* 검색 영역: 지역 선택 */}
      <div className="bg-white rounded-lg shadow-sm border p-4">
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">지역 선택</label>
        <RegionSelector onSearch={handleRegionSearch} />
      </div>

      {/* 미분양 현황 바로가기 */}
      <div className="mt-4">
        <button onClick={() => router.push("/mibunyang")} className="w-full bg-white rounded-lg shadow-sm border p-4 text-left hover:bg-gray-50 transition-colors">
          <span className="text-sm font-semibold text-gray-700">미분양 현황 바로가기</span>
          <p className="text-xs text-gray-500 mt-1">전국 미분양 아파트 현황, 지역별 통계를 확인하세요</p>
        </button>
      </div>

      {/* 최근 검색 */}
      <SearchHistory history={history} onSelect={handleHistorySelect} onRemove={removeHistory} onClear={clearHistory} />

      {/* 즐겨찾기 단지 */}
      {favorites.length > 0 && (
        <div className="mt-4">
          <span className="text-xs font-semibold text-gray-500 mb-1.5 block">즐겨찾기</span>
          <div className="flex flex-wrap gap-1.5">
            {favorites.map((f) => (
              <button
                key={f.complex_no}
                onClick={() => router.push(`/complex/${f.complex_no}`)}
                className="inline-flex items-center gap-1 bg-yellow-50 text-yellow-800 text-xs rounded-full px-2.5 py-1 border border-yellow-200 hover:bg-yellow-100 cursor-pointer transition-colors"
              >
                <span className="text-yellow-500">&#9733;</span>
                {f.complex_name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
