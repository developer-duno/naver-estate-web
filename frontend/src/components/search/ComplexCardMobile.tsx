"use client";

import { Fragment, memo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Complex, ArticleFilters } from "@/types";
import { ESTATE_TYPE_COLORS, ESTATE_TYPE_DEFAULT_COLOR } from "@/lib/constants";
import { buildFilterURL } from "@/hooks/useFilterParams";
import { type CompareItem } from "@/hooks/useCompare";
import { useComplexPrefetch } from "@/hooks/useComplexPrefetch";
import { tradeTypeSummary } from "./tradeTypeSummary";

/**
 * 검색 결과 단지 카드(모바일 · 세션 525 B40 PR 2a 새 틀) — 1줄 이름 + 유형 배지 + 비교 단추 · 2줄 「주소 · 세대수 · 준공」
 * (없는 조각은 뺀다 — 빈 「-」 칸을 그리지 않는다) · 매물 수가 자료에 있을 때만(로그인) 3줄 「매물 N건 · 매매 n 전세 n」.
 * index 는 옛 번호 칸 자리 — 지금은 쓰지 않는다(지도 위 고른 단지 카드와 호환).
 */
export const ComplexCardMobile = memo(function ComplexCardMobile({ complex, urlFilters, isCompared, compareFull, onToggleCompare }: { complex: Complex; index?: number; urlFilters?: ArticleFilters; isCompared?: boolean; compareFull?: boolean; onToggleCompare?: (item: CompareItem) => void }) {
  const router = useRouter();
  const year = complex.use_approve_ymd?.slice(0, 4);
  const tradeSummary = tradeTypeSummary(complex.trade_type_counts).split("·").join(" ");
  const colorClass = complex.real_estate_type_name ? (ESTATE_TYPE_COLORS[complex.real_estate_type_name] ?? ESTATE_TYPE_DEFAULT_COLOR) : "";
  const filterURL = buildFilterURL(`/complex/${complex.complex_no}`, undefined, urlFilters);
  const href = filterURL || `/complex/${complex.complex_no}`;
  const prefetch = useComplexPrefetch(complex.complex_no);
  const facts = [
    complex.cortar_address,
    complex.total_household_count ? `${complex.total_household_count.toLocaleString()}세대` : "",
    year ? `${year}년` : "",
  ].filter(Boolean);

  return (
    <div
      data-testid="complex-card"
      className="rounded-2xl border border-brand-line-soft bg-white px-4 py-3 cursor-pointer transition-colors hover:bg-brand-bg active:bg-brand-bg"
      onClick={() => router.push(href)}
      onMouseEnter={prefetch.onMouseEnter}
      onMouseLeave={prefetch.onMouseLeave}
    >
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {/* 이름 글자만 진짜 링크 · 카드 클릭과 두 번 이동하지 않게 전파 멈춤(세션 483 PR 3b) */}
          <Link href={href} prefetch={false} className="truncate text-[15px] font-bold text-brand-navy hover:underline" onClick={(e) => e.stopPropagation()}>{complex.complex_name}</Link>
          {complex.real_estate_type_name && (
            <span className={`shrink-0 rounded border px-1.5 py-0.5 text-xs ${colorClass}`}>{complex.real_estate_type_name}</span>
          )}
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleCompare?.({ complex_no: complex.complex_no, complex_name: complex.complex_name }); }}
          disabled={!isCompared && compareFull}
          className={`shrink-0 text-sm px-3 py-2 min-h-11 min-w-11 rounded-lg border transition-colors ${
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
      </div>
      {facts.length > 0 && (
        <p className="mt-0.5 truncate text-sm text-brand-muted">
          {facts.map((f, i) => (
            <Fragment key={i}>
              {i > 0 && " · "}
              <span>{f}</span>
            </Fragment>
          ))}
        </p>
      )}
      {/* 비로그인은 BE 가 매물 수를 걷어낸다(세션 481) — 줄째 그리지 않는다 */}
      {complex.article_count !== undefined && (
        <p className="mt-1 text-xs text-brand-muted">
          <span className="font-bold text-brand-orange-text">{`매물 ${complex.article_count}건`}</span>
          {tradeSummary && ` · ${tradeSummary}`}
        </p>
      )}
    </div>
  );
});
