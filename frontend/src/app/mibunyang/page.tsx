"use client";

import { useCallback, useEffect, Suspense } from "react";
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

const TABS = [
  { key: "apartments", label: "미분양 단지" },
  { key: "unsold", label: "미분양만" },
  { key: "regions", label: "지역 통계" },
  { key: "trades", label: "실거래" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

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
      const params = new URLSearchParams();
      params.set("region", r);
      if (g) params.set("gu", g);
      params.set("tab", tab);
      params.set("page", "1");
      if (sortBy) params.set("sort_by", sortBy);
      if (kw) params.set("q", kw);
      router.replace(`/mibunyang?${params}`, { scroll: false });
    },
    [router, tab, sortBy],
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
      </div>

      {!hasRegion ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-lg mb-2">지역을 선택해주세요</p>
          <p className="text-sm">시/도를 선택한 후 검색 버튼을 클릭하면 데이터를 조회합니다.</p>
        </div>
      ) : (
        <>
          {/* 탭 */}
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
              </button>
            ))}
          </div>

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
              </div>
              <MbApartmentTable
                apartments={apartmentsQuery.data?.apartments ?? []}
                startIndex={(page - 1) * PAGE_SIZE}
                sort={sortBy}
                onSortChange={handleSortChange}
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
              </div>
              <MbApartmentTable apartments={unsoldQuery.data?.unsold ?? []} sort={sortBy} onSortChange={handleSortChange} />
            </TabContent>
          )}

          {tab === "regions" && (
            <TabContent
              loading={regionsQuery.isLoading}
              error={regionsQuery.error}
              refetch={regionsQuery.refetch}
            >
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
