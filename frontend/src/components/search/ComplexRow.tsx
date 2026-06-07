"use client";

import { memo } from "react";
import { useRouter } from "next/navigation";
import type { Complex, ArticleFilters } from "@/types";
import { ESTATE_TYPE_COLORS, ESTATE_TYPE_DEFAULT_COLOR } from "@/lib/constants";
import { buildFilterURL } from "@/hooks/useFilterParams";
import { type CompareItem } from "@/hooks/useCompare";
import { useComplexPrefetch } from "@/hooks/useComplexPrefetch";
import { tradeTypeSummary } from "./tradeTypeSummary";

/** 검색 결과 단지 테이블 행 (데스크톱) */
export const ComplexRow = memo(function ComplexRow({ complex, index, urlFilters, isCompared, compareFull, onToggleCompare }: { complex: Complex; index: number; urlFilters?: ArticleFilters; isCompared?: boolean; compareFull?: boolean; onToggleCompare?: (item: CompareItem) => void }) {
  const router = useRouter();
  const filterURL = buildFilterURL(`/complex/${complex.complex_no}`, undefined, urlFilters);
  const year = complex.use_approve_ymd?.slice(0, 4);
  const articleCount = complex.article_count ?? 0;
  const tradeSummary = tradeTypeSummary(complex.trade_type_counts);
  const isEven = index % 2 === 0;
  const prefetch = useComplexPrefetch(complex.complex_no);

  return (
    <tr
      className={`hover:bg-blue-50 cursor-pointer transition-colors border-b border-gray-200 ${isEven ? "bg-gray-50/60" : "bg-white"}`}
      onClick={() => router.push(filterURL || `/complex/${complex.complex_no}`)}
      onMouseEnter={prefetch.onMouseEnter}
      onMouseLeave={prefetch.onMouseLeave}
    >
      <td className="px-3 py-2 text-gray-400 text-center text-xs border-r border-gray-100">{index}</td>
      <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap border-r border-gray-100">{complex.complex_name}</td>
      <td className="px-3 py-2 text-gray-600 max-w-[300px] truncate border-r border-gray-100" title={complex.cortar_address || ""}>{complex.cortar_address || "-"}</td>
      <td className="px-3 py-2 text-right text-gray-700 whitespace-nowrap border-r border-gray-100">{complex.total_household_count ? complex.total_household_count.toLocaleString() : "-"}</td>
      <td className="px-3 py-2 text-right text-gray-700 whitespace-nowrap border-r border-gray-100">{complex.total_dong_count || "-"}</td>
      <td className="px-3 py-2 text-right text-gray-700 whitespace-nowrap border-r border-gray-100">{complex.high_floor ? `${complex.high_floor}층` : "-"}</td>
      <td className="px-3 py-2 text-center text-gray-700 whitespace-nowrap border-r border-gray-100">{year || "-"}</td>
      <td className="px-3 py-2 text-center whitespace-nowrap border-r border-gray-100">
        {complex.real_estate_type_name ? (
          <span className={`text-xs px-1.5 py-0.5 rounded border ${ESTATE_TYPE_COLORS[complex.real_estate_type_name!] ?? ESTATE_TYPE_DEFAULT_COLOR}`}>{complex.real_estate_type_name}</span>
        ) : "-"}
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap">
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${articleCount > 0 ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"}`}>{articleCount}건</span>
        {tradeSummary && <div className="text-[11px] text-gray-400 mt-0.5">{tradeSummary}</div>}
      </td>
      <td className="px-2 py-2 text-center whitespace-nowrap">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleCompare?.({ complex_no: complex.complex_no, complex_name: complex.complex_name }); }}
          disabled={!isCompared && compareFull}
          className={`text-xs px-2.5 py-1 rounded border transition-colors ${
            isCompared
              ? "bg-blue-600 text-white border-blue-600"
              : compareFull
                ? "bg-gray-100 text-gray-300 border-gray-200 cursor-not-allowed"
                : "bg-white text-gray-500 border-gray-300 hover:bg-blue-50 hover:text-blue-600"
          }`}
          aria-label={isCompared ? `${complex.complex_name} 비교 해제` : compareFull ? "비교 목록 가득 참 — 기존 단지를 먼저 빼주세요" : `${complex.complex_name} 비교 추가`}
          title={isCompared ? "비교 해제" : compareFull ? "비교 목록 가득 참 (4/4)" : "비교 추가"}
        >
          {isCompared ? "V" : "+"}
        </button>
      </td>
    </tr>
  );
});
