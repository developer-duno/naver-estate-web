"use client";

import { useCallback, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { getMbApartments, getMbUnsold, getMbRegions, getMbTrades } from "@/lib/api";
import MbRegionSelector from "@/components/mb/MbRegionSelector";
import { SkeletonPage } from "@/components/Skeleton";
import { PAGE_SIZE } from "@/lib/constants";
import { useMbCompare } from "@/hooks/useMbCompare";
import { useMbFavorites } from "@/hooks/useMbFavorites";
import { useMbSearchHistory } from "@/hooks/useMbSearchHistory";
import { useMbCompareHistory } from "@/hooks/useMbCompareHistory";
import { useMbCompareBookmarks } from "@/hooks/useMbCompareBookmarks";
import MbCompareFloatingBar from "@/components/mb/MbCompareFloatingBar";
import MbSearchHistory from "@/components/mb/MbSearchHistory";
import MbCompareHistory from "@/components/mb/MbCompareHistory";
import MbFavoritesTab from "@/components/mb/MbFavoritesTab";
import MbApartmentsTab from "@/components/mb/MbApartmentsTab";
import MbUnsoldTab from "@/components/mb/MbUnsoldTab";
import MbRegionsTab from "@/components/mb/MbRegionsTab";
import MbTradesTab from "@/components/mb/MbTradesTab";
import type { MbSearchHistoryItem, MbCompareHistoryItem, MbCompareBookmarkItem } from "@/lib/storage";

const TABS = [
  { key: "apartments", label: "미분양 단지" },
  { key: "unsold", label: "미분양만" },
  { key: "regions", label: "지역 통계" },
  { key: "trades", label: "실거래" },
  { key: "favorites", label: "즐겨찾기" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function MibunyangPage() {
  return (
    <Suspense fallback={<SkeletonPage />}>
      <MibunyangContent />
    </Suspense>
  );
}

function MibunyangContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const compare = useMbCompare();
  const { favorites, toggle: toggleFavorite } = useMbFavorites();
  const { history: mbHistory, add: addMbHistory, remove: removeMbHistory, clear: clearMbHistory } = useMbSearchHistory();
  const { history: compareHistory, remove: removeCompareHistory, clear: clearCompareHistory } = useMbCompareHistory();
  const { bookmarks: compareBookmarks, remove: removeCompareBookmark, clear: clearCompareBookmarks } = useMbCompareBookmarks();

  const handleCompareSelect = useCallback(
    (item: MbCompareHistoryItem | MbCompareBookmarkItem) => {
      router.push(`/mibunyang/compare?ids=${item.ids.join(",")}`);
    },
    [router],
  );

  const region = searchParams.get("region") ?? "";
  const gu = searchParams.get("gu") ?? "";
  const tab = (searchParams.get("tab") as TabKey) || "apartments";
  const page = Number(searchParams.get("page")) || 1;
  const sortBy = searchParams.get("sort_by") ?? "";
  const keyword = searchParams.get("q") ?? "";

  useEffect(() => {
    document.title = region
      ? `미분양 현황 - ${region} | 아파트·오피스텔`
      : "미분양 현황 | 아파트·오피스텔";
  }, [region]);

  const updateParams = useCallback(
    (updates: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v) params.set(k, v);
        else params.delete(k);
      }
      router.replace(`/mibunyang?${params}`, { scroll: false });
    },
    [router, searchParams],
  );

  const handleSearch = useCallback(
    (r: string, g?: string, kw?: string) => {
      addMbHistory({ region: r, gu: g, keyword: kw });
      const params = new URLSearchParams();
      params.set("region", r);
      if (g) params.set("gu", g);
      params.set("tab", tab);
      params.set("page", "1");
      if (sortBy) params.set("sort_by", sortBy);
      if (kw) params.set("q", kw);
      router.replace(`/mibunyang?${params}`, { scroll: false });
    },
    [router, tab, sortBy, addMbHistory],
  );

  const handleMbHistorySelect = useCallback(
    (item: MbSearchHistoryItem) => {
      handleSearch(item.region, item.gu, item.keyword);
    },
    [handleSearch],
  );

  const handleTabChange = useCallback(
    (t: TabKey) => {
      const updates: Record<string, string | undefined> = { tab: t, page: "1" };
      if (t === "regions" || t === "trades") {
        updates.q = undefined;
      }
      updateParams(updates);
    },
    [updateParams],
  );

  const handleSortChange = useCallback(
    (newSort: string) => updateParams({ sort_by: newSort || undefined, page: "1" }),
    [updateParams],
  );

  const handlePageChange = useCallback(
    (p: number) => updateParams({ page: String(p) }),
    [updateParams],
  );

  const hasRegion = region.length >= 2;

  const apartmentsQuery = useQuery({
    queryKey: queryKeys.mb.apartments(region, gu || undefined, page, sortBy || undefined, keyword || undefined),
    queryFn: () => getMbApartments(region, gu || undefined, page, PAGE_SIZE, sortBy || undefined, keyword || undefined),
    enabled: hasRegion && tab === "apartments",
    placeholderData: keepPreviousData,
  });

  const unsoldQuery = useQuery({
    queryKey: queryKeys.mb.unsold(region, gu || undefined, page, sortBy || undefined, keyword || undefined),
    queryFn: () => getMbUnsold(region, gu || undefined, page, PAGE_SIZE, sortBy || undefined, keyword || undefined),
    enabled: hasRegion && tab === "unsold",
    placeholderData: keepPreviousData,
  });

  const regionsQuery = useQuery({
    queryKey: queryKeys.mb.regions(region, gu || undefined),
    queryFn: () => getMbRegions(region, gu || undefined),
    enabled: hasRegion && tab === "regions",
    placeholderData: keepPreviousData,
  });

  const tradesQuery = useQuery({
    queryKey: queryKeys.mb.trades(region, gu || undefined, undefined, page, sortBy || undefined),
    queryFn: () => getMbTrades(region, gu || undefined, undefined, page, PAGE_SIZE, sortBy || undefined),
    enabled: hasRegion && tab === "trades",
    placeholderData: keepPreviousData,
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">미분양 현황</h1>

      <div className="bg-white rounded-lg shadow-sm border p-4 mb-6">
        <MbRegionSelector onSearch={handleSearch} defaultRegion={region} defaultGu={gu} defaultKeyword={keyword} />
        <MbSearchHistory
          history={mbHistory}
          onSelect={handleMbHistorySelect}
          onRemove={removeMbHistory}
          onClear={clearMbHistory}
        />
        <MbCompareHistory
          history={compareHistory}
          bookmarks={compareBookmarks}
          onSelectHistory={handleCompareSelect}
          onRemoveHistory={removeCompareHistory}
          onClearHistory={clearCompareHistory}
          onSelectBookmark={handleCompareSelect}
          onRemoveBookmark={removeCompareBookmark}
          onClearBookmarks={clearCompareBookmarks}
        />
      </div>

      {/* 탭바 — 항상 표시 (즐겨찾기 탭은 지역 불필요) */}
      <div className="flex gap-1 mb-4 overflow-x-auto" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => handleTabChange(t.key)}
            className={`px-4 py-2 text-sm font-medium rounded-t-md whitespace-nowrap transition-colors ${
              tab === t.key
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {t.label}
            {t.key === "favorites" && favorites.length > 0 && (
              <span className="ml-1 text-xs">({favorites.length})</span>
            )}
          </button>
        ))}
      </div>

      {/* 즐겨찾기 탭 — 지역 선택 불필요 */}
      {tab === "favorites" ? (
        <MbFavoritesTab favorites={favorites} onRemove={toggleFavorite} />
      ) : !hasRegion ? (
        <div className="text-center py-16">
          <p className="text-lg text-gray-500 mb-1">지역을 선택해주세요</p>
          <p className="text-sm text-gray-400 mb-6">아래에서 바로 선택하거나, 상단의 시/도 드롭다운을 이용하세요</p>
          <div className="flex flex-wrap justify-center gap-2 max-w-md mx-auto">
            {["서울", "경기", "부산", "인천", "대구", "대전"].map((sido) => (
              <button
                key={sido}
                onClick={() => handleSearch(sido)}
                className="px-4 py-2 border border-blue-200 text-blue-600 rounded-md bg-blue-50 hover:bg-blue-100 text-sm font-medium transition-colors"
              >
                {sido}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* 탭 콘텐츠 */}
          {tab === "apartments" && (
            <MbApartmentsTab
              query={apartmentsQuery}
              page={page}
              sort={sortBy}
              onSortChange={handleSortChange}
              onPageChange={handlePageChange}
              isInCompare={compare.isInCompare}
              onCompareToggle={(id, name) => compare.toggle({ id, name })}
              compareFull={compare.isFull}
            />
          )}

          {tab === "unsold" && (
            <MbUnsoldTab
              query={unsoldQuery}
              page={page}
              sort={sortBy}
              onSortChange={handleSortChange}
              onPageChange={handlePageChange}
              isInCompare={compare.isInCompare}
              onCompareToggle={(id, name) => compare.toggle({ id, name })}
              compareFull={compare.isFull}
            />
          )}

          {tab === "regions" && <MbRegionsTab query={regionsQuery} />}

          {tab === "trades" && (
            <MbTradesTab
              query={tradesQuery}
              page={page}
              sort={sortBy}
              onSortChange={handleSortChange}
              onPageChange={handlePageChange}
            />
          )}
        </>
      )}

      <MbCompareFloatingBar list={compare.list} onRemove={compare.remove} onClear={compare.clear} />
      {compare.list.length > 0 && <div className="pb-16" />}
    </div>
  );
}

