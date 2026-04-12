"use client";

import { Fragment, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQueries } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { getComplex, getPriceStats } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { M2_TO_PYEONG } from "@/lib/constants";
import { useSmartBack } from "@/hooks/useSmartBack";
import { getAdvantageForRow, getBestIndices, calcAvgPricePerPyeong } from "@/lib/compare-utils";
import LoadingSpinner from "@/components/LoadingSpinner";
import type { Complex, PriceStats } from "@/types";

const LazyCompareCharts = dynamic(
  () => import("@/components/CompareCharts"),
  { ssr: false },
);

/* ── 포맷 유틸 ── */

function formatArea(m2?: number): string {
  if (!m2) return "-";
  return `${m2.toFixed(0)}m² (${(m2 / M2_TO_PYEONG).toFixed(0)}평)`;
}

function formatCount(n?: number): string {
  return n ? n.toLocaleString() : "-";
}

function formatYear(ymd?: string): string {
  if (!ymd) return "-";
  const y = ymd.slice(0, 4);
  const m = ymd.slice(4, 6);
  return m ? `${y}.${m}` : y;
}

function formatPrice(price?: number): string {
  if (!price) return "-";
  if (price >= 10000) return `${(price / 10000).toFixed(1)}억`;
  return `${price.toLocaleString()}만`;
}

/* ── 비교 테이블 행 정의 (기본 23행, 평당가는 동적 삽입) ── */

const BASE_ROWS: { label: string; render: (c: Complex) => string }[] = [
  { label: "주소", render: (c) => c.cortar_address || "-" },
  { label: "도로명주소", render: (c) => c.road_address || "-" },
  { label: "유형", render: (c) => c.real_estate_type_name || "-" },
  { label: "세대수", render: (c) => formatCount(c.total_household_count) },
  { label: "동수", render: (c) => formatCount(c.total_dong_count) },
  { label: "최저층", render: (c) => c.low_floor ? `${c.low_floor}층` : "-" },
  { label: "최고층", render: (c) => c.high_floor ? `${c.high_floor}층` : "-" },
  { label: "준공일", render: (c) => formatYear(c.use_approve_ymd) },
  { label: "최소 면적", render: (c) => formatArea(c.min_supply_area_m2) },
  { label: "최대 면적", render: (c) => formatArea(c.max_supply_area_m2) },
  { label: "총 주차", render: (c) => formatCount(c.total_parking_count) },
  { label: "세대당 주차", render: (c) => c.parking_count_by_household ? `${c.parking_count_by_household}대` : "-" },
  { label: "난방", render: (c) => c.heat_method_type || "-" },
  { label: "난방 연료", render: (c) => c.heat_fuel_type || "-" },
  { label: "시공사", render: (c) => c.construction_company || "-" },
  { label: "용적률", render: (c) => c.floor_area_ratio ? `${c.floor_area_ratio}%` : "-" },
  { label: "건폐율", render: (c) => c.building_coverage_ratio ? `${c.building_coverage_ratio}%` : "-" },
  // 평당가는 여기에 동적 삽입 (인덱스 17)
  { label: "매물수", render: (c) => formatCount(c.article_count) },
  { label: "주변 중위가", render: (c) => formatPrice(c.nearby_median_price) },
  { label: "전세가율", render: (c) => c.jeonse_rate ? `${(c.jeonse_rate * 100).toFixed(0)}%` : "-" },
  { label: "최근 6개월 거래", render: (c) => formatCount(c.recent_trades_6m) },
  { label: "수영장", render: (c) => c.has_pool ? "있음" : "없음" },
  { label: "관리사무소", render: (c) => c.management_office_tel || "-" },
];

/* ── 메인 컴포넌트 ── */

function CompareContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const goBack = useSmartBack();
  const idsStr = searchParams.get("ids") || "";
  const ids = idsStr.split(",").filter(Boolean).slice(0, 4);

  const queries = useQueries({
    queries: ids.map((id) => ({
      queryKey: queryKeys.complex(id),
      queryFn: () => getComplex(id),
      enabled: !!id,
    })),
  });

  const loading = queries.some((q) => q.isLoading);
  // React Query는 데이터 변경 없으면 동일 참조 반환 → 안정적 키로 memo
  const complexIds = queries.map((q) => q.data?.complex_no).filter(Boolean).join(",");
  const complexes = useMemo(
    () => queries.map((q) => q.data).filter(Boolean) as Complex[],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [complexIds],
  );

  /* 가격 통계 (React Query 캐시 공유 — CompareCharts와 동일 queryKey) */
  const statsQueries = useQueries({
    queries: ids.map((id) => ({
      queryKey: queryKeys.priceStats(id),
      queryFn: () => getPriceStats(id),
      staleTime: 60_000,
    })),
  });
  const statsLoading = statsQueries.some((q) => q.isLoading);

  /* 평당가 맵: { [complex_no]: 만원/평 } */
  const pricePerPyeong: Record<string, number> = useMemo(() => {
    const map: Record<string, number> = {};
    for (let i = 0; i < ids.length; i++) {
      const data = statsQueries[i]?.data as PriceStats | undefined;
      if (!data) continue;
      const pp = calcAvgPricePerPyeong(data);
      if (pp != null) map[ids[i]] = pp;
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join(","), statsQueries.map((q) => q.dataUpdatedAt).join(",")]);

  /* 비교 행: 기본 23행 + 평당가 동적 삽입 */
  const compareRows = useMemo(() => {
    const ppRow = {
      label: "평당가",
      render: (c: Complex) => {
        const pp = pricePerPyeong[c.complex_no];
        if (pp != null) return formatPrice(pp);
        return statsLoading ? "불러오는 중..." : "-";
      },
    };
    // 건폐율(인덱스 16) 다음, 매물수(인덱스 17) 앞에 삽입
    const rows = [...BASE_ROWS];
    rows.splice(17, 0, ppRow);
    return rows;
  }, [pricePerPyeong, statsLoading]);

  /* 우위 인덱스 캐싱 (label → bestIndices) */
  const advantageMap = useMemo(() => {
    const map = new Map<string, number[]>();
    if (complexes.length < 2) return map;
    for (const row of compareRows) {
      map.set(row.label, getAdvantageForRow(row.label, complexes));
    }
    // 평당가 우위: 낮을수록 좋음
    const ppValues = complexes.map((c) => pricePerPyeong[c.complex_no] ?? null);
    map.set("평당가", getBestIndices(ppValues, "lower"));
    return map;
  }, [complexes, compareRows, pricePerPyeong]);

  /* ── 인쇄/엑셀 ── */
  const [expandAll, setExpandAll] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handlePrint = useCallback(() => {
    setExpandAll(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.print();
      });
    });
  }, []);

  // afterprint 복원 + 3초 백업
  useEffect(() => {
    const restore = () => setExpandAll(false);
    window.addEventListener("afterprint", restore);
    return () => window.removeEventListener("afterprint", restore);
  }, []);

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      const { exportCompareToXlsx } = await import("@/lib/compare-export");
      await exportCompareToXlsx(complexes, compareRows);
    } catch (err) {
      alert(err instanceof Error ? err.message : "엑셀 다운로드에 실패했습니다");
    } finally {
      setIsExporting(false);
    }
  }, [complexes, compareRows]);

  if (ids.length < 2) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <p className="text-gray-500 mb-4">비교할 단지를 2개 이상 선택해주세요.</p>
        <button onClick={goBack} className="text-sm text-blue-600 hover:underline">돌아가기</button>
      </div>
    );
  }

  if (loading) return <LoadingSpinner message="단지 정보를 불러오는 중..." />;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex flex-wrap items-center gap-2 md:gap-4 mb-6">
        <button onClick={goBack} aria-label="이전 페이지" className="text-gray-400 hover:text-gray-600 text-xl no-print">
          &#8592;
        </button>
        <h1 className="text-xl md:text-2xl font-bold">단지 비교</h1>
        <span className="text-gray-500 text-sm">({complexes.length}개 단지)</span>
        <div className="ml-auto flex gap-2 no-print">
          <button
            onClick={handlePrint}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
          >
            인쇄
          </button>
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            {isExporting ? "생성 중..." : "엑셀"}
          </button>
        </div>
      </div>

      {/* 범례 */}
      <p className="text-xs text-gray-400 mb-2">
        <span className="inline-block w-3 h-3 bg-green-50 border-l-2 border-green-400 mr-1 align-middle" />
        <span className="text-green-700 font-bold mr-1">★</span>
        = 우위 항목 (↑ 클수록 / ↓ 낮을수록 / 🆕 최신)
      </p>

      {/* 비교 테이블 (데스크톱) */}
      <div className="hidden md:block overflow-x-auto bg-white rounded-lg shadow-sm border">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-gray-100 border-b-2 border-gray-300">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 w-28 sticky left-0 bg-gray-100 z-10">항목</th>
              {complexes.map((c) => (
                <th key={c.complex_no} className="px-4 py-3 text-center min-w-[180px]">
                  <button
                    onClick={() => router.push(`/complex/${c.complex_no}`)}
                    className="text-blue-600 hover:underline font-semibold text-sm"
                  >
                    {c.complex_name}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {compareRows.map((row, i) => {
              const best = advantageMap.get(row.label) ?? [];
              return (
                <tr key={row.label} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/60"}>
                  <td className="px-4 py-2 text-xs font-semibold text-gray-600 whitespace-nowrap border-r border-gray-200 sticky left-0 bg-inherit z-10">
                    {row.label}
                  </td>
                  {complexes.map((c, ci) => {
                    const isBest = best.includes(ci);
                    return (
                      <td
                        key={c.complex_no}
                        className={`px-4 py-2 text-center border-r border-gray-100 last:border-r-0 ${
                          isBest
                            ? "bg-green-50 border-l-2 border-green-400 font-bold text-gray-900"
                            : "text-gray-700"
                        }`}
                      >
                        {isBest && <span className="text-green-600 mr-1" aria-hidden="true">★</span>}
                        {isBest && <span className="sr-only">우위</span>}
                        {row.render(c)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 비교 카드 (모바일) */}
      <div className="md:hidden space-y-4">
        {complexes.map((c, ci) => (
          <div key={c.complex_no} className="bg-white rounded-lg shadow-sm border p-4">
            <button
              onClick={() => router.push(`/complex/${c.complex_no}`)}
              className="text-blue-600 hover:underline font-semibold text-base mb-3 block"
            >
              {c.complex_name}
            </button>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              {compareRows.map((row) => {
                const best = advantageMap.get(row.label) ?? [];
                const isBest = best.includes(ci);
                return (
                  <Fragment key={row.label}>
                    <dt className={`text-gray-500 text-xs ${isBest ? "font-bold" : ""}`}>{row.label}</dt>
                    <dd className={isBest ? "text-green-700 font-bold" : "text-gray-800"}>
                      {isBest && <span className="text-green-600 mr-0.5">★</span>}
                      {row.render(c)}
                    </dd>
                  </Fragment>
                );
              })}
            </dl>
          </div>
        ))}
      </div>

      {/* 차트 섹션 */}
      {complexes.length >= 2 && (
        <div className="mt-8">
          <LazyCompareCharts
            complexes={complexes.map((c) => ({
              complex_no: c.complex_no,
              complex_name: c.complex_name,
            }))}
            fullComplexes={complexes}
            pricePerPyeong={pricePerPyeong}
            expandAll={expandAll}
          />
        </div>
      )}
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <CompareContent />
    </Suspense>
  );
}
