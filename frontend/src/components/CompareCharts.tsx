"use client";

import { useState, useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { getPriceHistory, getPriceStats, getPyeongDetails } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { formatChartPrice } from "@/lib/format";
import { getBestIndices } from "@/lib/compare-utils";
import { COMPARE_COLORS } from "@/lib/constants";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorBoundary from "@/components/ErrorBoundary";
import CompareRadarChart from "@/components/CompareRadarChart";
import ComparePriceTrendChart from "@/components/ComparePriceTrendChart";
import ComparePriceBarChart from "@/components/ComparePriceBarChart";
import CompareFloorChart from "@/components/CompareFloorChart";
import type { Complex, PriceStats, PriceHistoryResponse, PyeongDetail } from "@/types";

/* ── 아코디언 ── */

function ChartAccordion({
  title,
  badge,
  children,
  defaultOpen = false,
}: {
  title: string;
  badge?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex justify-between items-center px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <span className="font-semibold text-sm">{title}</span>
        <div className="flex items-center gap-2">
          {badge && (
            <span className="text-xs text-green-600 font-bold">{badge}</span>
          )}
          <span className="text-gray-400 text-xs">{open ? "▲" : "▼"}</span>
        </div>
      </button>
      {open && <div className="p-4 border-t">{children}</div>}
    </div>
  );
}

/* ── Props ── */

interface Props {
  complexes: { complex_no: string; complex_name: string }[];
  fullComplexes: Complex[];
}

/* ── 상세 테이블: 면적별 가격 ── */

function AreaPriceTable({ datasets }: { datasets: { name: string; stats: PriceStats }[] }) {
  // 모든 면적 라벨 수집
  const allLabels = useMemo(() => {
    const set = new Set<string>();
    for (const ds of datasets) {
      for (const a of ds.stats.by_area) set.add(a.label);
    }
    return Array.from(set).sort();
  }, [datasets]);

  if (allLabels.length === 0) return <p className="text-gray-500 text-sm">면적별 데이터 없음</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-2 py-1 text-left border">면적</th>
            {datasets.map((ds) => (
              <th key={ds.name} colSpan={2} className="px-2 py-1 text-center border">
                {ds.name}
              </th>
            ))}
          </tr>
          <tr>
            <th className="px-2 py-1 border" />
            {datasets.map((ds) => (
              <>
                <th key={`${ds.name}-m`} className="px-2 py-1 text-center border text-red-500">매매</th>
                <th key={`${ds.name}-j`} className="px-2 py-1 text-center border text-blue-500">전세</th>
              </>
            ))}
          </tr>
        </thead>
        <tbody>
          {allLabels.map((label) => {
            // 매매 우위
            const maemaeVals = datasets.map((ds) => {
              const a = ds.stats.by_area.find((x) => x.label === label);
              return a?.maemae ?? null;
            });
            const maeemaeBest = getBestIndices(maemaeVals, "higher");

            // 전세 우위 (낮을수록 좋음? 아니, 높을수록 자산가치)
            const jeonseVals = datasets.map((ds) => {
              const a = ds.stats.by_area.find((x) => x.label === label);
              return a?.jeonse ?? null;
            });
            const jeonseBest = getBestIndices(jeonseVals, "higher");

            return (
              <tr key={label}>
                <td className="px-2 py-1 border font-medium">{label}</td>
                {datasets.map((ds, di) => {
                  const a = ds.stats.by_area.find((x) => x.label === label);
                  const mVal = a?.maemae;
                  const jVal = a?.jeonse;
                  const mCnt = a?.maemae_count;
                  const jCnt = a?.jeonse_count;
                  return (
                    <>
                      <td
                        key={`${ds.name}-${label}-m`}
                        className={`px-2 py-1 border text-center ${maeemaeBest.includes(di) ? "bg-green-50 font-bold" : ""}`}
                      >
                        {mVal != null ? `${formatChartPrice(mVal)}${mCnt ? ` (${mCnt}건)` : ""}` : "-"}
                      </td>
                      <td
                        key={`${ds.name}-${label}-j`}
                        className={`px-2 py-1 border text-center ${jeonseBest.includes(di) ? "bg-green-50 font-bold" : ""}`}
                      >
                        {jVal != null ? `${formatChartPrice(jVal)}${jCnt ? ` (${jCnt}건)` : ""}` : "-"}
                      </td>
                    </>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── 상세 테이블: 관리비 ── */

function MaintenanceTable({
  datasets,
}: {
  datasets: { name: string; details: PyeongDetail[] }[];
}) {
  // 모든 평형 이름 수집
  const allPyeongs = useMemo(() => {
    const map = new Map<number, string>();
    for (const ds of datasets) {
      for (const d of ds.details) {
        if (!map.has(d.pyeong_no)) map.set(d.pyeong_no, d.pyeong_name || `${d.pyeong_no}평`);
      }
    }
    return Array.from(map.entries()).sort(([a], [b]) => a - b);
  }, [datasets]);

  if (allPyeongs.length === 0) return <p className="text-gray-500 text-sm">관리비 데이터 없음</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-2 py-1 text-left border">평형</th>
            {datasets.map((ds) => (
              <th key={ds.name} className="px-2 py-1 text-center border">{ds.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {allPyeongs.map(([pyeongNo, pyeongName]) => {
            const vals = datasets.map((ds) => {
              const d = ds.details.find((x) => x.pyeong_no === pyeongNo);
              return d?.avg_maintenance_cost ?? d?.latest_maintenance_cost ?? null;
            });
            const best = getBestIndices(vals, "lower"); // 낮을수록 우위

            return (
              <tr key={pyeongNo}>
                <td className="px-2 py-1 border font-medium">{pyeongName}</td>
                {datasets.map((ds, di) => {
                  const d = ds.details.find((x) => x.pyeong_no === pyeongNo);
                  const cost = d?.avg_maintenance_cost ?? d?.latest_maintenance_cost;
                  const summer = d?.summer_maintenance_cost;
                  const winter = d?.winter_maintenance_cost;
                  return (
                    <td
                      key={`${ds.name}-${pyeongNo}`}
                      className={`px-2 py-1 border text-center ${best.includes(di) ? "bg-green-50 font-bold" : ""}`}
                    >
                      {cost != null ? (
                        <>
                          {best.includes(di) && <span className="text-green-600 mr-1">★</span>}
                          {cost.toLocaleString()}만
                          {summer != null && winter != null && (
                            <span className="text-gray-400 text-[10px] block">
                              (여름 {summer.toLocaleString()} / 겨울 {winter.toLocaleString()})
                            </span>
                          )}
                        </>
                      ) : (
                        "-"
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── 상세 테이블: 세대 구성 ── */

function UnitCompositionTable({
  datasets,
}: {
  datasets: { name: string; details: PyeongDetail[] }[];
}) {
  const allPyeongs = useMemo(() => {
    const map = new Map<number, string>();
    for (const ds of datasets) {
      for (const d of ds.details) {
        if (!map.has(d.pyeong_no)) map.set(d.pyeong_no, d.pyeong_name || `${d.pyeong_no}평`);
      }
    }
    return Array.from(map.entries()).sort(([a], [b]) => a - b);
  }, [datasets]);

  if (allPyeongs.length === 0) return <p className="text-gray-500 text-sm">세대 구성 데이터 없음</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-2 py-1 text-left border">평형</th>
            {datasets.map((ds) => (
              <th key={ds.name} colSpan={2} className="px-2 py-1 text-center border">{ds.name}</th>
            ))}
          </tr>
          <tr>
            <th className="px-2 py-1 border" />
            {datasets.map((ds) => (
              <>
                <th key={`${ds.name}-rb`} className="px-2 py-1 text-center border">방/욕실</th>
                <th key={`${ds.name}-hh`} className="px-2 py-1 text-center border">세대수</th>
              </>
            ))}
          </tr>
        </thead>
        <tbody>
          {allPyeongs.map(([pyeongNo, pyeongName]) => (
            <tr key={pyeongNo}>
              <td className="px-2 py-1 border font-medium">{pyeongName}</td>
              {datasets.map((ds) => {
                const d = ds.details.find((x) => x.pyeong_no === pyeongNo);
                return (
                  <>
                    <td key={`${ds.name}-${pyeongNo}-rb`} className="px-2 py-1 border text-center">
                      {d?.room_count != null ? `${d.room_count}/${d.bathroom_count ?? "-"}` : "-"}
                    </td>
                    <td key={`${ds.name}-${pyeongNo}-hh`} className="px-2 py-1 border text-center">
                      {d?.household_count_by_pyeong ?? "-"}
                    </td>
                  </>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── 메인 컨테이너 ── */

export default function CompareCharts({ complexes, fullComplexes }: Props) {
  // 데이터 fetch
  const historyQueries = useQueries({
    queries: complexes.map((c) => ({
      queryKey: queryKeys.priceHistory(c.complex_no),
      queryFn: () => getPriceHistory(c.complex_no),
      staleTime: 60_000,
    })),
  });

  const statsQueries = useQueries({
    queries: complexes.map((c) => ({
      queryKey: queryKeys.priceStats(c.complex_no),
      queryFn: () => getPriceStats(c.complex_no),
      staleTime: 60_000,
    })),
  });

  const pyeongQueries = useQueries({
    queries: complexes.map((c) => ({
      queryKey: queryKeys.pyeongDetails(c.complex_no),
      queryFn: () => getPyeongDetails(c.complex_no),
      staleTime: 60_000,
    })),
  });

  const allLoading =
    historyQueries.some((q) => q.isLoading) ||
    statsQueries.some((q) => q.isLoading) ||
    pyeongQueries.some((q) => q.isLoading);

  // 데이터 조립
  const historyDatasets = complexes
    .map((c, i) => {
      const data = historyQueries[i]?.data as PriceHistoryResponse | undefined;
      if (!data?.items?.length) return null;
      return { complexNo: c.complex_no, complexName: c.complex_name, items: data.items };
    })
    .filter(Boolean) as { complexNo: string; complexName: string; items: any[] }[];

  const statsDatasets = complexes
    .map((c, i) => {
      const data = statsQueries[i]?.data as PriceStats | undefined;
      if (!data) return null;
      return { complexNo: c.complex_no, complexName: c.complex_name, priceStats: data };
    })
    .filter(Boolean) as { complexNo: string; complexName: string; priceStats: PriceStats }[];

  const pyeongDatasets = complexes
    .map((c, i) => {
      const data = pyeongQueries[i]?.data as { pyeong_details: PyeongDetail[] } | undefined;
      if (!data?.pyeong_details?.length) return null;
      return { name: c.complex_name, details: data.pyeong_details };
    })
    .filter(Boolean) as { name: string; details: PyeongDetail[] }[];

  if (allLoading) {
    return <LoadingSpinner message="차트 데이터를 불러오는 중..." />;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">가격 비교 차트</h2>

      {/* 1. 레이더 — 기본 펼침 */}
      <ChartAccordion title="종합 비교 (레이더)" defaultOpen>
        <ErrorBoundary>
          <CompareRadarChart complexes={fullComplexes} />
        </ErrorBoundary>
      </ChartAccordion>

      {/* 2. 가격 추이 */}
      <ChartAccordion
        title="가격 추이 비교"
        badge={historyDatasets.length > 0 ? undefined : undefined}
      >
        <ErrorBoundary>
          {historyDatasets.length > 0 ? (
            <ComparePriceTrendChart datasets={historyDatasets} />
          ) : (
            <p className="text-gray-500 text-sm py-4 text-center">가격 추이 데이터가 없습니다.</p>
          )}
        </ErrorBoundary>
      </ChartAccordion>

      {/* 3. 현재 평균가 */}
      <ChartAccordion title="현재 평균가 비교">
        <ErrorBoundary>
          {statsDatasets.length > 0 ? (
            <ComparePriceBarChart datasets={statsDatasets} />
          ) : (
            <p className="text-gray-500 text-sm py-4 text-center">가격 통계 데이터가 없습니다.</p>
          )}
        </ErrorBoundary>
      </ChartAccordion>

      {/* 4. 층별 가격 */}
      <ChartAccordion title="층별 가격 비교">
        <ErrorBoundary>
          {statsDatasets.length > 0 ? (
            <CompareFloorChart datasets={statsDatasets} />
          ) : (
            <p className="text-gray-500 text-sm py-4 text-center">층별 가격 데이터가 없습니다.</p>
          )}
        </ErrorBoundary>
      </ChartAccordion>

      {/* 5. 상세 데이터 */}
      <ChartAccordion title="상세 데이터 (면적별 가격 · 관리비 · 세대구성)">
        <ErrorBoundary>
          <div className="space-y-6">
            {/* 5-A: 면적별 가격표 */}
            <div>
              <h3 className="text-sm font-semibold mb-2">면적별 가격</h3>
              {statsDatasets.length > 0 ? (
                <AreaPriceTable
                  datasets={statsDatasets.map((ds) => ({
                    name: ds.complexName,
                    stats: ds.priceStats,
                  }))}
                />
              ) : (
                <p className="text-gray-500 text-sm">면적별 데이터 없음</p>
              )}
            </div>

            {/* 5-B: 관리비 비교 */}
            <div>
              <h3 className="text-sm font-semibold mb-2">관리비 비교</h3>
              {pyeongDatasets.length > 0 ? (
                <MaintenanceTable datasets={pyeongDatasets} />
              ) : (
                <p className="text-gray-500 text-sm">관리비 데이터 없음</p>
              )}
            </div>

            {/* 5-C: 세대 구성 */}
            <div>
              <h3 className="text-sm font-semibold mb-2">세대 구성</h3>
              {pyeongDatasets.length > 0 ? (
                <UnitCompositionTable datasets={pyeongDatasets} />
              ) : (
                <p className="text-gray-500 text-sm">세대 구성 데이터 없음</p>
              )}
            </div>
          </div>
        </ErrorBoundary>
      </ChartAccordion>
    </div>
  );
}
