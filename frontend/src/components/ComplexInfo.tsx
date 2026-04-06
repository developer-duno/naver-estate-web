"use client";

import React, { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import type { Complex, PyeongDetail, PriceStats, ArticleFilters } from "@/types";
import ComplexBasicInfo from "@/components/ComplexBasicInfo";
import { PyeongDetailsList } from "@/components/ComplexPyeongCard";
import ComplexPriceFloorTab from "@/components/ComplexPriceFloorTab";
import { getPriceStats, getPriceHistory } from "@/lib/api";
import { usePriceCollect } from "@/hooks/usePriceCollect";

const LazyCharts = dynamic(() => import("./PriceChartInner"), { ssr: false });
const LazyPriceHistory = dynamic(() => import("./PriceHistoryChart"), { ssr: false });

type TabType = "info" | "area" | "price-area" | "price-floor" | "price-history";

interface Props {
  complex: Complex;
  pyeongDetails: PyeongDetail[];
  complexNo: string;

  onFilterChange?: (filters: ArticleFilters) => void;
  /** 인증 토큰 (실거래가 수집용) */
  accessToken?: string;
}

const TABS: { key: TabType; label: string }[] = [
  { key: "info", label: "단지정보" },
  { key: "area", label: "면적별 정보" },
  { key: "price-area", label: "면적별 가격" },
  { key: "price-floor", label: "층수별 가격" },
  { key: "price-history", label: "실거래가 추이" },
];

export default function ComplexInfo({ complex: cpx, pyeongDetails, complexNo, onFilterChange, accessToken }: Props) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabType>("info");
  const [historyAreaNo, setHistoryAreaNo] = useState<string>("");
  const { collecting, message: collectMessage, startCollect, clearPolling } = usePriceCollect();

  // ── useQuery: 가격 통계 (staleTime 30초) ──
  const priceStatsQuery = useQuery({
    queryKey: queryKeys.priceStats(complexNo),
    queryFn: () => getPriceStats(complexNo),
    staleTime: 30_000,
  });

  // ── useQuery: 가격 추이 (실거래가 추이 탭 활성 시에만) ──
  const priceHistoryQuery = useQuery({
    queryKey: queryKeys.priceHistory(complexNo, undefined, historyAreaNo || undefined),
    queryFn: () => getPriceHistory(complexNo, undefined, historyAreaNo || undefined),
    enabled: tab === "price-history",
  });

  const priceStats = priceStatsQuery.data ?? null;
  const statsLoading = priceStatsQuery.isLoading;
  const statsError = priceStatsQuery.isError;
  const historyItems = priceHistoryQuery.data?.items ?? [];
  const historyLoading = priceHistoryQuery.isLoading;
  const historyError = priceHistoryQuery.isError;

  // 컴포넌트 언마운트 시 수집 폴링 정리
  useEffect(() => clearPolling, [clearPolling]);

  // 실거래가 추이 탭 진입 시 자동 수집 (24시간 TTL — 서버에서 fresh 판단)
  const autoCollectRef = React.useRef<string>("");
  useEffect(() => {
    if (tab !== "price-history" || !accessToken || collecting) return;
    if (autoCollectRef.current === complexNo) return; // 이미 시도함
    autoCollectRef.current = complexNo;
    startCollect(complexNo, accessToken, () => {
      // 수집 완료 → priceHistory 쿼리 무효화 (자동 refetch)
      queryClient.invalidateQueries({ queryKey: queryKeys.priceHistoryAll(complexNo) });
    });
  }, [tab, complexNo, accessToken, collecting, startCollect, queryClient]);

  return (
    <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
      <div className="flex border-b overflow-x-auto" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap ${
              tab === t.key
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-4">
        {tab === "info" && <ComplexBasicInfo cpx={cpx} />}
        {tab === "area" && <PyeongDetailsList details={pyeongDetails} />}
        {tab === "price-area" && (
          <PriceAreaTab priceStats={priceStats} error={statsError} loading={statsLoading} onFilterChange={onFilterChange} />
        )}
        {tab === "price-floor" && (
          <ComplexPriceFloorTab priceStats={priceStats} error={statsError} loading={statsLoading} onFilterChange={onFilterChange} />
        )}
        {tab === "price-history" && (
          <div>
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              {pyeongDetails.length > 0 && (
                <select
                  value={historyAreaNo}
                  onChange={(e) => setHistoryAreaNo(e.target.value)}
                  className="text-sm border rounded px-2 py-1.5 text-gray-700"
                >
                  <option value="">전체 면적</option>
                  {pyeongDetails.map((pd) => (
                    <option key={pd.pyeong_no} value={String(pd.pyeong_no)}>
                      {pd.pyeong_name
                        ? `${pd.pyeong_name} (${pd.exclusive_area}㎡)`
                        : `${pd.exclusive_area}㎡`}
                    </option>
                  ))}
                </select>
              )}
              <button
                onClick={() => {
                  if (!accessToken) return;
                  startCollect(complexNo, accessToken, () => {
                    // 수집 완료 → priceHistory 쿼리 무효화
                    queryClient.invalidateQueries({ queryKey: queryKeys.priceHistoryAll(complexNo) });
                  });
                }}
                disabled={collecting || !accessToken}
                className={`text-sm px-3 py-1.5 rounded font-medium ${
                  collecting
                    ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                    : accessToken
                      ? "bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200"
                      : "bg-gray-100 text-gray-400 cursor-not-allowed"
                }`}
              >
                {collecting ? "수집 중..." : "실거래가 수집"}
              </button>
              {collectMessage && (
                <span className={`text-xs ${collectMessage.includes("오류") || collectMessage.includes("실패") || collectMessage.includes("초과") ? "text-red-500" : "text-green-600"}`}>
                  {collectMessage}
                </span>
              )}
            </div>
            {historyLoading ? <p className="text-gray-500 text-sm">로딩 중...</p>
            : historyError ? <p className="text-red-500 text-sm">가격 추이를 불러오지 못했습니다</p>
            : <LazyPriceHistory items={historyItems} />}
          </div>
        )}
      </div>
    </div>
  );
}

const AREA_FILTER_TOLERANCE_M2 = 4;

function PriceAreaTab({ priceStats, error, loading, onFilterChange }: { priceStats: PriceStats | null; error: boolean; loading: boolean; onFilterChange?: (filters: ArticleFilters) => void; }) {
  if (loading) return <div className="h-48 flex items-center justify-center text-gray-400 text-sm">로딩 중...</div>;
  if (error) return <p className="text-red-500 text-sm text-center">가격 통계를 불러오지 못했습니다</p>;
  if (!priceStats || priceStats.by_area.length === 0)
    return <p className="text-gray-500 text-sm text-center">면적별 가격 데이터가 부족합니다</p>;

  const handleAreaClick = (label: string) => {
    if (!onFilterChange) return;
    const match = label.match(/(\d+)/);
    if (!match) return;
    const area = parseInt(match[1], 10);
    onFilterChange({ min_area_m2: area - AREA_FILTER_TOLERANCE_M2, max_area_m2: area + AREA_FILTER_TOLERANCE_M2 });
  };

  return (
    <div>
      {onFilterChange && (
        <p className="text-xs text-gray-400 mb-1 text-right">막대를 클릭하면 해당 면적 매물만 표시됩니다</p>
      )}
      <LazyCharts type="area" data={priceStats.by_area} onAreaClick={onFilterChange ? handleAreaClick : undefined} />
    </div>
  );
}

