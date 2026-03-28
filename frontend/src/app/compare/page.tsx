"use client";

import { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQueries } from "@tanstack/react-query";
import { getComplex } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { useSmartBack } from "@/hooks/useSmartBack";
import LoadingSpinner from "@/components/LoadingSpinner";
import type { Complex } from "@/types";

const M2_TO_PYEONG = 3.3058;

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

/** 비교 행 데이터 정의 */
const COMPARE_ROWS: { label: string; render: (c: Complex) => string }[] = [
  { label: "주소", render: (c) => c.cortar_address || "-" },
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
  { label: "시공사", render: (c) => c.construction_company || "-" },
  { label: "용적률", render: (c) => c.floor_area_ratio ? `${c.floor_area_ratio}%` : "-" },
  { label: "건폐율", render: (c) => c.building_coverage_ratio ? `${c.building_coverage_ratio}%` : "-" },
  { label: "매물수", render: (c) => formatCount(c.article_count) },
  { label: "주변 중위가", render: (c) => formatPrice(c.nearby_median_price) },
  { label: "전세가율", render: (c) => c.jeonse_rate ? `${(c.jeonse_rate * 100).toFixed(0)}%` : "-" },
  { label: "최근 6개월 거래", render: (c) => formatCount(c.recent_trades_6m) },
];

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
  const complexes = queries.map((q) => q.data).filter(Boolean) as Complex[];

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
      <div className="flex items-center gap-4 mb-6">
        <button onClick={goBack} aria-label="이전 페이지" className="text-gray-400 hover:text-gray-600 text-xl">
          &#8592;
        </button>
        <h1 className="text-2xl font-bold">단지 비교</h1>
        <span className="text-gray-500 text-sm">({complexes.length}개 단지)</span>
      </div>

      <div className="overflow-x-auto bg-white rounded-lg shadow-sm border">
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
            {COMPARE_ROWS.map((row, i) => (
              <tr key={row.label} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/60"}>
                <td className="px-4 py-2 text-xs font-semibold text-gray-600 whitespace-nowrap border-r border-gray-200 sticky left-0 bg-inherit z-10">{row.label}</td>
                {complexes.map((c) => (
                  <td key={c.complex_no} className="px-4 py-2 text-center text-gray-700 border-r border-gray-100 last:border-r-0">
                    {row.render(c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
