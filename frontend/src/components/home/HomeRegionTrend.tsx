"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { getRegionHubTrend } from "@/lib/api";
import { ApiError } from "@/lib/api/core";
import { queryKeys } from "@/lib/query-keys";
import { REGION_CODES } from "@/lib/seo/region-codes";
import { regionIndexGroups, regionName } from "@/lib/seo/region-page";

const HomeTrendChart = dynamic(() => import("./HomeTrendChart"), {
  ssr: false,
  // 그림 부품을 받는 동안에도 빈 남색 칸이 아니라 같은 로딩 글자(세션 508 보완)
  loading: () => (
    <div className="flex h-[180px] items-center justify-center text-sm text-brand-on-navy-muted">불러오는 중...</div>
  ),
});

const GROUPS = regionIndexGroups(REGION_CODES);
const DEFAULT_SIDO = "서울";
const DEFAULT_CODE = "11680"; // 서울 강남구

/** 응답의 최근 24개월 중 중위 매매가가 있는 달만 */
export function trendPoints(items: { period: string; sale_price_median: number | null }[]): { period: string; value: number }[] {
  return items
    .slice(-24)
    .filter((it): it is { period: string; sale_price_median: number } => it.sale_price_median != null)
    .map((it) => ({ period: it.period, value: it.sale_price_median }));
}

const selectCls =
  "h-11 min-w-0 flex-1 rounded-[10px] border-0 bg-white px-3 text-sm text-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-orange";

/**
 * 홈 「지역 시세 흐름」(세션 508 · 승인 항목 11) — 시·도 → 시·군·구를 고르면 부동산원 중위 매매가 24개월 꺾은선.
 * 로딩·오류(다시 시도)·빈 자료 세 상태. 지역 이름표는 /region 과 같은 정적 상수(백엔드 호출 0).
 */
export default function HomeRegionTrend() {
  const [sido, setSido] = useState(DEFAULT_SIDO);
  const [code, setCode] = useState(DEFAULT_CODE);
  const items = GROUPS.find((g) => g.sido === sido)?.items ?? [];
  const label = items.find((it) => it.code === code)?.name ?? "";

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: queryKeys.regionHubTrend(code),
    queryFn: () => getRegionHubTrend(code),
    staleTime: 60 * 60_000,
  });

  // 404 = 그 시군구 허브가 없다는 확정 답(단지 0곳) — 빈 자료로 보인다. 그 밖 실패는 오류 + 다시 시도.
  const notFound = isError && error instanceof ApiError && error.statusCode === 404;
  const points = data ? trendPoints(data.items ?? []) : [];

  const onSido = (next: string) => {
    setSido(next);
    const first = GROUPS.find((g) => g.sido === next)?.items[0];
    if (first) setCode(first.code);
  };

  return (
    <section aria-labelledby="home-trend" className="rounded-2xl bg-brand-navy p-5 text-white sm:p-7">
      <h2 id="home-trend" className="text-[19px] font-black sm:text-xl">지역 시세 흐름</h2>
      <p className="mt-1 text-[13px] text-brand-on-navy-muted">한국부동산원 주택가격동향 · 최근 24개월 · 중위 매매가</p>

      <div className="mt-4 flex gap-2">
        <label htmlFor="home-trend-sido" className="sr-only">시·도</label>
        <select id="home-trend-sido" value={sido} onChange={(e) => onSido(e.target.value)} className={selectCls}>
          {GROUPS.map((g) => (
            <option key={g.sido} value={g.sido}>{g.sido}</option>
          ))}
        </select>
        <label htmlFor="home-trend-sigungu" className="sr-only">시·군·구</label>
        <select id="home-trend-sigungu" value={code} onChange={(e) => setCode(e.target.value)} className={selectCls}>
          {items.map((it) => (
            <option key={it.code} value={it.code}>{it.name}</option>
          ))}
        </select>
      </div>

      <div className="mt-4 min-h-[180px]" aria-live="polite">
        {isLoading ? (
          <div className="flex h-[180px] items-center justify-center text-sm text-brand-on-navy-muted" data-testid="trend-loading">
            불러오는 중...
          </div>
        ) : isError && !notFound ? (
          <div className="flex h-[180px] flex-col items-center justify-center gap-3 text-sm" data-testid="trend-error">
            <p className="text-brand-on-navy-muted">시세 흐름을 불러오지 못했습니다.</p>
            <button
              type="button"
              onClick={() => refetch()}
              className="rounded-[10px] bg-brand-orange px-4 py-2 font-bold text-brand-navy"
            >
              다시 시도
            </button>
          </div>
        ) : points.length === 0 ? (
          <div className="flex h-[180px] items-center justify-center text-sm text-brand-on-navy-muted" data-testid="trend-empty">
            이 지역은 한국부동산원 시세 자료가 없습니다.
          </div>
        ) : (
          <div role="img" aria-label={`${regionName(sido, label)} 중위 매매가 최근 ${points.length}개월 흐름`}>
            <HomeTrendChart points={points} />
          </div>
        )}
      </div>
      <p className="mt-2 text-xs text-brand-on-navy-muted">출처: 한국부동산원 주택가격동향</p>
    </section>
  );
}
