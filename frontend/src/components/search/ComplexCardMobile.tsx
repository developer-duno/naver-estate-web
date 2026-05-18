"use client";

import { memo } from "react";
import { useRouter } from "next/navigation";
import type { Complex, ArticleFilters } from "@/types";
import { ESTATE_TYPE_COLORS, ESTATE_TYPE_DEFAULT_COLOR } from "@/lib/constants";
import { buildFilterURL } from "@/hooks/useFilterParams";
import { type CompareItem } from "@/hooks/useCompare";
import { useComplexPrefetch } from "@/hooks/useComplexPrefetch";
import { tradeTypeSummary } from "./tradeTypeSummary";

/** 검색 결과 단지 카드 (모바일) */
export const ComplexCardMobile = memo(function ComplexCardMobile({ complex, index, urlFilters, isCompared, compareFull, onToggleCompare }: { complex: Complex; index: number; urlFilters?: ArticleFilters; isCompared?: boolean; compareFull?: boolean; onToggleCompare?: (item: CompareItem) => void }) {
  const router = useRouter();
  const year = complex.use_approve_ymd?.slice(0, 4);
  const articleCount = complex.article_count ?? 0;
  const tradeSummary = tradeTypeSummary(complex.trade_type_counts);
  const colorClass = complex.real_estate_type_name ? (ESTATE_TYPE_COLORS[complex.real_estate_type_name] ?? ESTATE_TYPE_DEFAULT_COLOR) : "";
  const filterURL = buildFilterURL(`/complex/${complex.complex_no}`, undefined, urlFilters);
  const prefetch = useComplexPrefetch(complex.complex_no);

  return (
    <div
      className="bg-white rounded-lg shadow-sm border p-4 cursor-pointer hover:bg-blue-50 transition-colors active:bg-blue-100"
      onClick={() => router.push(filterURL || `/complex/${complex.complex_no}`)}
      onMouseEnter={prefetch.onMouseEnter}
      onMouseLeave={prefetch.onMouseLeave}
    >
      <div className="flex justify-between items-start">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400 shrink-0">{index}</span>
            <span className="font-medium text-gray-900 truncate">{complex.complex_name}</span>
            {complex.real_estate_type_name && (
              <span className={`text-sm px-2 py-1 rounded border shrink-0 ${colorClass}`}>{complex.real_estate_type_name}</span>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-1 truncate">{complex.cortar_address || "-"}</p>
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleCompare?.({ complex_no: complex.complex_no, complex_name: complex.complex_name }); }}
          disabled={!isCompared && compareFull}
          className={`ml-2 shrink-0 text-sm px-3 py-2 rounded border transition-colors ${
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
      </div>
      <div className="grid grid-cols-3 gap-2 mt-2.5 text-sm text-gray-600">
        <span>{complex.total_household_count ? `${complex.total_household_count.toLocaleString()}세대` : "-"}</span>
        <span>{year ? `${year}년` : "-"}</span>
        <span className={`font-medium ${articleCount > 0 ? "text-blue-600" : "text-gray-400"}`}>{articleCount}건</span>
      </div>
      {tradeSummary && <p className="text-xs text-gray-400 mt-1">{tradeSummary}</p>}
    </div>
  );
});
