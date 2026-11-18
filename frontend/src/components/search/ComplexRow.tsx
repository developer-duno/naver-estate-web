"use client";

import { memo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Complex, ArticleFilters } from "@/types";
import { ESTATE_TYPE_COLORS, ESTATE_TYPE_DEFAULT_COLOR } from "@/lib/constants";
import { buildFilterURL } from "@/hooks/useFilterParams";
import { type CompareItem } from "@/hooks/useCompare";
import { useComplexPrefetch } from "@/hooks/useComplexPrefetch";
import { tradeTypeSummary } from "./tradeTypeSummary";

const tdCls = "px-3 py-2 text-brand-navy whitespace-nowrap border-r border-brand-line-soft";

/**
 * 검색 결과 단지 테이블 행(데스크톱 · 세션 525 B40 PR 2a 새 색) — 빈 값은 빈칸(「-」 안 씀).
 * showArticleCount = 표에 매물수 칸이 있는가(자료에 매물 수가 하나라도 있을 때만 — SearchResults 가 정한다).
 */
export const ComplexRow = memo(function ComplexRow({ complex, index, urlFilters, showArticleCount = true, isCompared, compareFull, onToggleCompare }: { complex: Complex; index: number; urlFilters?: ArticleFilters; showArticleCount?: boolean; isCompared?: boolean; compareFull?: boolean; onToggleCompare?: (item: CompareItem) => void }) {
  const router = useRouter();
  const filterURL = buildFilterURL(`/complex/${complex.complex_no}`, undefined, urlFilters);
  const href = filterURL || `/complex/${complex.complex_no}`;
  const year = complex.use_approve_ymd?.slice(0, 4);
  const articleCount = complex.article_count ?? 0;
  const tradeSummary = tradeTypeSummary(complex.trade_type_counts);
  const isEven = index % 2 === 0;
  const prefetch = useComplexPrefetch(complex.complex_no);

  return (
    <tr
      className={`hover:bg-brand-orange-soft cursor-pointer transition-colors border-b border-brand-line-soft ${isEven ? "bg-brand-bg/60" : "bg-white"}`}
      onClick={() => router.push(href)}
      onMouseEnter={prefetch.onMouseEnter}
      onMouseLeave={prefetch.onMouseLeave}
    >
      <td className="px-3 py-2 text-brand-muted text-center text-xs border-r border-brand-line-soft">{index}</td>
      <td className={`${tdCls} font-bold`}>
        {/* 이름 글자만 진짜 링크(행 전체를 감싸지 않는다 — hydration) · 행 클릭과 두 번 이동하지 않게 전파 멈춤(세션 483 PR 3b) */}
        <Link href={href} prefetch={false} className="hover:underline" onClick={(e) => e.stopPropagation()}>{complex.complex_name}</Link>
      </td>
      <td className="px-3 py-2 text-brand-muted max-w-75 truncate border-r border-brand-line-soft" title={complex.cortar_address || ""}>{complex.cortar_address ?? ""}</td>
      <td className={`${tdCls} text-right`}>{complex.total_household_count ? complex.total_household_count.toLocaleString() : ""}</td>
      <td className={`${tdCls} text-right`}>{complex.total_dong_count || ""}</td>
      <td className={`${tdCls} text-right`}>{complex.high_floor ? `${complex.high_floor}층` : ""}</td>
      <td className={`${tdCls} text-center`}>{year ?? ""}</td>
      <td className="px-3 py-2 text-center whitespace-nowrap border-r border-brand-line-soft">
        {complex.real_estate_type_name && (
          <span className={`text-xs px-1.5 py-0.5 rounded border ${ESTATE_TYPE_COLORS[complex.real_estate_type_name] ?? ESTATE_TYPE_DEFAULT_COLOR}`}>{complex.real_estate_type_name}</span>
        )}
      </td>
      {showArticleCount && (
        <td className="px-3 py-2 text-right whitespace-nowrap">
          {/* 비로그인은 BE 가 매물 수를 걷어낸다(세션 481) — 칸은 남아도 「0건」·「-」 대신 빈칸 */}
          {complex.article_count !== undefined && (
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${articleCount > 0 ? "bg-brand-orange-soft text-brand-orange-text" : "bg-brand-bg text-brand-muted"}`}>{articleCount}건</span>
          )}
          {tradeSummary && <div className="text-[11px] text-brand-muted mt-0.5">{tradeSummary}</div>}
        </td>
      )}
      <td className="px-2 py-2 text-center whitespace-nowrap">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleCompare?.({ complex_no: complex.complex_no, complex_name: complex.complex_name }); }}
          disabled={!isCompared && compareFull}
          className={`text-xs px-2.5 py-1 min-h-11 min-w-11 rounded-lg border transition-colors ${
            isCompared
              ? "bg-brand-navy text-white border-brand-navy"
              : compareFull
                ? "bg-gray-100 text-gray-300 border-gray-200 cursor-not-allowed"
                : "bg-white text-brand-muted border-brand-line hover:bg-brand-bg hover:text-brand-navy"
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
