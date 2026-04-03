"use client";

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
      {/* 타이틀 + 통계 인라인 */}
      <div className="text-center mb-4">
        <h1 className="text-2xl font-bold text-gray-900">네이버 아파트·오피스텔 매물 조회</h1>
        <div className="flex justify-center items-center gap-4 mt-2 text-sm text-gray-500">
          <span>전국 매물을 검색하고 필터링하세요</span>
          <span className="text-gray-300">|</span>
          {statsLoading ? (
            <span className="text-gray-400">통계 로딩...</span>
          ) : statsError ? (
            <button onClick={() => loadStats()} className="text-gray-400 hover:text-blue-500">통계 재시도</button>
          ) : (
            <>
              <span>단지 <strong className="text-blue-600">{complexCount.toLocaleString()}</strong></span>
              <span>매물 <strong className="text-green-600">{articleCount.toLocaleString()}</strong></span>
            </>
          )}
        </div>
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
