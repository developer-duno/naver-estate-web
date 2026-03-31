"use client";

import { useState, useCallback, useEffect, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { getMbApartments, getMbUnsold, getMbRegions, getMbTrades } from "@/lib/api";
import MbRegionSelector from "@/components/mb/MbRegionSelector";
import MbApartmentTable from "@/components/mb/MbApartmentTable";
import MbRegionStatsTable from "@/components/mb/MbRegionStatsTable";
import MbTradeTable from "@/components/mb/MbTradeTable";
import Pagination from "@/components/Pagination";
import LoadingSpinner from "@/components/LoadingSpinner";
import { PAGE_SIZE } from "@/lib/constants";
import { exportMbApartmentsToXlsx, exportMbRegionsToXlsx, exportMbTradesToXlsx } from "@/lib/mb-export";
import { useMbCompare } from "@/hooks/useMbCompare";
import { useMbFavorites } from "@/hooks/useMbFavorites";
import { useMbSearchHistory } from "@/hooks/useMbSearchHistory";
import { useMbCompareHistory } from "@/hooks/useMbCompareHistory";
import { useMbCompareBookmarks } from "@/hooks/useMbCompareBookmarks";
import MbCompareFloatingBar from "@/components/mb/MbCompareFloatingBar";
import MbSearchHistory from "@/components/mb/MbSearchHistory";
import MbCompareHistory from "@/components/mb/MbCompareHistory";
import type { MbSearchHistoryItem, MbCompareHistoryItem, MbCompareBookmarkItem } from "@/lib/storage";

const TABS = [
  { key: "apartments", label: "미분양 단지" },
  { key: "unsold", label: "미분양만" },
  { key: "regions", label: "지역 통계" },
  { key: "trades", label: "실거래" },
  { key: "favorites", label: "즐겨찾기" },
] as const;

type TabKey = (typeof TABS)[number]["key"];
type FavSortBy = "added_at" | "name" | "region";

export default function MibunyangPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
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
    queryKey: queryKeys.mb.unsold(region, gu || undefined, sortBy || undefined, keyword || undefined),
    queryFn: () => getMbUnsold(region, gu || undefined, sortBy || undefined, keyword || undefined),
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
        <FavoritesContent favorites={favorites} onRemove={toggleFavorite} />
      ) : !hasRegion ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-lg mb-2">지역을 선택해주세요</p>
          <p className="text-sm">시/도를 선택한 후 검색 버튼을 클릭하면 데이터를 조회합니다.</p>
        </div>
      ) : (
        <>
          {/* 탭 콘텐츠 */}
          {tab === "apartments" && (
            <TabContent
              loading={apartmentsQuery.isLoading}
              error={apartmentsQuery.error}
              refetch={apartmentsQuery.refetch}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-gray-500">
                  총 {apartmentsQuery.data?.total?.toLocaleString() ?? 0}개
                </span>
                <ExportButton
                  disabled={!apartmentsQuery.data?.apartments?.length}
                  onClick={() => exportMbApartmentsToXlsx(apartmentsQuery.data?.apartments ?? [])}
                />
              </div>
              <MbApartmentTable
                apartments={apartmentsQuery.data?.apartments ?? []}
                startIndex={(page - 1) * PAGE_SIZE}
                sort={sortBy}
                onSortChange={handleSortChange}
                isInCompare={compare.isInCompare}
                onCompareToggle={(id, name) => compare.toggle({ id, name })}
                compareFull={compare.isFull}
              />
              {apartmentsQuery.data && apartmentsQuery.data.total > PAGE_SIZE && (
                <div className="mt-4">
                  <Pagination
                    currentPage={page}
                    totalPages={Math.ceil(apartmentsQuery.data.total / PAGE_SIZE)}
                    onPageChange={handlePageChange}
                  />
                </div>
              )}
            </TabContent>
          )}

          {tab === "unsold" && (
            <TabContent
              loading={unsoldQuery.isLoading}
              error={unsoldQuery.error}
              refetch={unsoldQuery.refetch}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-gray-500">
                  미분양 {unsoldQuery.data?.total?.toLocaleString() ?? 0}개
                </span>
                <ExportButton
                  disabled={!unsoldQuery.data?.unsold?.length}
                  onClick={() => exportMbApartmentsToXlsx(unsoldQuery.data?.unsold ?? [])}
                />
              </div>
              <MbApartmentTable
                apartments={unsoldQuery.data?.unsold ?? []}
                sort={sortBy}
                onSortChange={handleSortChange}
                isInCompare={compare.isInCompare}
                onCompareToggle={(id, name) => compare.toggle({ id, name })}
                compareFull={compare.isFull}
              />
            </TabContent>
          )}

          {tab === "regions" && (
            <TabContent
              loading={regionsQuery.isLoading}
              error={regionsQuery.error}
              refetch={regionsQuery.refetch}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-gray-500">
                  {regionsQuery.data?.regions?.length ?? 0}개 지역
                </span>
                <ExportButton
                  disabled={!regionsQuery.data?.regions?.length}
                  onClick={() => exportMbRegionsToXlsx(regionsQuery.data?.regions ?? [])}
                />
              </div>
              <MbRegionStatsTable regions={regionsQuery.data?.regions ?? []} />
            </TabContent>
          )}

          {tab === "trades" && (
            <TabContent
              loading={tradesQuery.isLoading}
              error={tradesQuery.error}
              refetch={tradesQuery.refetch}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-gray-500">
                  총 {tradesQuery.data?.total?.toLocaleString() ?? 0}건
                </span>
                <ExportButton
                  disabled={!tradesQuery.data?.trades?.length}
                  onClick={() => exportMbTradesToXlsx(tradesQuery.data?.trades ?? [])}
                />
              </div>
              <MbTradeTable
                trades={tradesQuery.data?.trades ?? []}
                startIndex={(page - 1) * PAGE_SIZE}
                sort={sortBy}
                onSortChange={handleSortChange}
              />
              {tradesQuery.data && tradesQuery.data.total > PAGE_SIZE && (
                <div className="mt-4">
                  <Pagination
                    currentPage={page}
                    totalPages={Math.ceil(tradesQuery.data.total / PAGE_SIZE)}
                    onPageChange={handlePageChange}
                  />
                </div>
              )}
            </TabContent>
          )}
        </>
      )}

      <MbCompareFloatingBar list={compare.list} onRemove={compare.remove} onClear={compare.clear} />
      {compare.list.length > 0 && <div className="pb-16" />}
    </div>
  );
}

function TabContent({
  loading,
  error,
  refetch,
  children,
}: {
  loading: boolean;
  error: Error | null;
  refetch: () => void;
  children: React.ReactNode;
}) {
  if (loading) return <LoadingSpinner message="데이터를 불러오는 중..." />;
  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-3">데이터를 불러오지 못했습니다.</p>
        <button
          onClick={refetch}
          className="text-sm text-blue-600 hover:underline"
        >
          다시 시도
        </button>
      </div>
    );
  }
  return <>{children}</>;
}

const MAX_BATCH_COMPARE = 4;

function FavoritesContent({
  favorites,
  onRemove,
}: {
  favorites: { id: string; name: string; region?: string; added_at: number }[];
  onRemove: (item: { id: string; name: string; region?: string }) => void;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<FavSortBy>("added_at");

  const sortedFavorites = useMemo(() => {
    const sorted = [...favorites];
    switch (sortBy) {
      case "name":
        sorted.sort((a, b) => a.name.localeCompare(b.name, "ko"));
        break;
      case "region":
        sorted.sort((a, b) => (a.region ?? "").localeCompare(b.region ?? "", "ko"));
        break;
      case "added_at":
      default:
        sorted.sort((a, b) => b.added_at - a.added_at);
        break;
    }
    return sorted;
  }, [favorites, sortBy]);

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < MAX_BATCH_COMPARE) {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      if (prev.size === Math.min(sortedFavorites.length, MAX_BATCH_COMPARE)) return new Set();
      return new Set(sortedFavorites.slice(0, MAX_BATCH_COMPARE).map((f) => f.id));
    });
  }, [sortedFavorites]);

  const handleBatchCompare = () => {
    if (selected.size < 2) return;
    const ids = Array.from(selected).join(",");
    router.push(`/mibunyang/compare?ids=${ids}`);
  };

  if (favorites.length === 0) {
    return (
      <div className="text-center py-20 text-gray-400">
        <p className="text-lg mb-2">즐겨찾기한 단지가 없습니다</p>
        <p className="text-sm">단지 목록에서 ★를 눌러 추가해보세요.</p>
      </div>
    );
  }

  const allChecked = selected.size === Math.min(favorites.length, MAX_BATCH_COMPARE);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">{favorites.length}개 단지</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as FavSortBy)}
            className="border border-gray-300 rounded-md px-2 py-1 text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            aria-label="정렬 기준"
          >
            <option value="added_at">추가일순</option>
            <option value="name">단지명순</option>
            <option value="region">지역순</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <span className="text-xs text-gray-500">{selected.size}/{MAX_BATCH_COMPARE}개 선택</span>
          )}
          <button
            type="button"
            onClick={handleBatchCompare}
            disabled={selected.size < 2}
            className="px-3 py-1 text-xs rounded border bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            선택 비교
          </button>
        </div>
      </div>
      <div className="overflow-x-auto bg-white rounded-lg shadow-sm border">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-center w-10">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={toggleAll}
                  aria-label="전체 선택"
                  className="accent-blue-600"
                />
              </th>
              <th className="px-3 py-2 text-left text-gray-600 w-12">#</th>
              <th className="px-3 py-2 text-left text-gray-600">단지명</th>
              <th className="px-3 py-2 text-left text-gray-600">지역</th>
              <th className="px-3 py-2 text-center text-gray-600">추가일</th>
              <th className="px-3 py-2 text-center text-gray-600 w-16">삭제</th>
            </tr>
          </thead>
          <tbody>
            {sortedFavorites.map((fav, i) => (
              <tr
                key={fav.id}
                className={`border-b border-gray-100 hover:bg-blue-50/40 cursor-pointer ${
                  selected.has(fav.id) ? "bg-blue-50/60" : ""
                }`}
                onClick={() => router.push(`/mibunyang/${fav.id}`)}
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter") router.push(`/mibunyang/${fav.id}`); }}
              >
                <td className="px-3 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={selected.has(fav.id)}
                    disabled={!selected.has(fav.id) && selected.size >= MAX_BATCH_COMPARE}
                    onChange={() => toggleSelect(fav.id)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`${fav.name} 선택`}
                    className="accent-blue-600"
                  />
                </td>
                <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                <td className="px-3 py-2 font-medium text-gray-900">{fav.name}</td>
                <td className="px-3 py-2 text-gray-500">{fav.region ?? "-"}</td>
                <td className="px-3 py-2 text-center text-gray-400 text-xs">
                  {new Date(fav.added_at).toLocaleDateString("ko-KR")}
                </td>
                <td className="px-3 py-2 text-center">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onRemove({ id: fav.id, name: fav.name, region: fav.region }); }}
                    className="text-gray-300 hover:text-red-500 text-lg leading-none"
                    aria-label={`${fav.name} 즐겨찾기 해제`}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ExportButton({ disabled, onClick }: { disabled: boolean; onClick: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const handle = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await onClick();
    } catch {
      setFailed(true);
      setTimeout(() => setFailed(false), 3000);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      disabled={disabled || busy}
      onClick={handle}
      className={`text-xs px-3 py-1 rounded border text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed ${
        failed ? "border-red-400 text-red-500" : "border-gray-300"
      }`}
    >
      {busy ? "다운로드 중..." : failed ? "실패" : "엑셀"}
    </button>
  );
}
