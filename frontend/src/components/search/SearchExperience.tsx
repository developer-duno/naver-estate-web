"use client";

import { useState, useEffect, useMemo, useCallback, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { searchComplexes, getComplexesByRegion } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { createClient } from "@/lib/supabase";
import RegionSelector from "@/components/RegionSelector";
import FilterBar from "@/components/FilterBar";
import FilterBarMobileSheet from "@/components/FilterBarMobileSheet";
import { COMPLEX_SORT_OPTIONS, ESTATE_TYPE_TABS } from "@/lib/constants";
import EstateTypeTabs from "@/components/EstateTypeTabs";
import ComplexSortDropdown from "@/components/ComplexSortDropdown";
import { SkeletonPage } from "@/components/Skeleton";
import { useFilterParams, buildFilterURL } from "@/hooks/useFilterParams";
import { useCompare } from "@/hooks/useCompare";
import { useSearchHistory } from "@/hooks/useSearchHistory";
import { useArticleFavorites } from "@/hooks/useArticleFavorites";
import { sortComplexes } from "@/lib/sortComplexes";
import type { SearchHistoryItem } from "@/lib/storage";
import CompareFloatingBar from "@/components/CompareFloatingBar";
import { ComplexRow } from "@/components/search/ComplexRow";
import { ComplexCardMobile } from "@/components/search/ComplexCardMobile";
import RecentSearchChips from "@/components/search/RecentSearchChips";

const VALID_COMPLEX_SORT = new Set<string>(COMPLEX_SORT_OPTIONS.map((o) => o.v));

interface Props {
  /** 입력 폼·결과 위에 끼울 부가 영역 (홈의 hero/통계/도구카드). 없으면 검색 전용 화면. */
  headerSlot?: ReactNode;
  /** 결과 영역 위에 끼울 부가 영역 (검색 결과 없을 때 홈의 도구카드 등). */
  emptyExtra?: ReactNode;
}

/**
 * 검색 경험 공용 컴포넌트 — 입력(매물유형/필터/검색창/지역) + 결과(단지 목록/비교/정렬).
 * URL(useSearchParams)이 진실의 원천이라 홈(/)·검색(/search) 어디서 렌더해도 동일 동작.
 * 검색 시 현재 pathname(usePathname) 기준으로 URL 갱신 → 홈에선 /?q=, 검색에선 /search?q=.
 * (세션 314 — search/page.tsx SearchContent 본문 이식, 동작 보존)
 */
export default function SearchExperience({ headerSlot, emptyExtra }: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname() || "/";
  const [inlineKeyword, setInlineKeyword] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [userStatus, setUserStatus] = useState<string | null>(null);

  const keyword = searchParams.get("q") || "";
  const sido = searchParams.get("sido") || "";
  const sigungu = searchParams.get("sigungu") || "";
  const dong = searchParams.get("dong") || "";
  const allCodes = ESTATE_TYPE_TABS.map((t) => t.code) as string[];
  const typesParam = searchParams.get("types");
  const [selectedTypes, setSelectedTypes] = useState<string[]>(
    typesParam ? typesParam.split(",").filter((c) => allCodes.includes(c)) : [...allCodes],
  );

  const { filters: urlFilters, setFilters: setUrlFilters, filterKey } = useFilterParams();
  const { list: compareList, toggle: toggleCompare, remove: removeCompare, clear: clearCompare, isInCompare, isFull: compareFull } = useCompare();
  const { history, add: addHistory } = useSearchHistory();
  const { favorites: articleFavorites } = useArticleFavorites();
  const recentItems = history.slice(0, 5);
  const hasSearchParams = !!(keyword || (sido && sigungu));

  const filtersActive = Object.keys(urlFilters).some((k) => k !== "sort_by");
  const typesNarrowed = selectedTypes.length < allCodes.length;
  const hasActiveFilters = filtersActive || typesNarrowed;

  const rawComplexSort = searchParams.get("complex_sort") ?? "default";
  const complexSort = VALID_COMPLEX_SORT.has(rawComplexSort) ? rawComplexSort : "default";
  const setComplexSort = useCallback((next: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "default" || !VALID_COMPLEX_SORT.has(next)) {
      params.delete("complex_sort");
    } else {
      params.set("complex_sort", next);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [searchParams, router, pathname]);

  const resetFilters = useCallback(() => {
    setUrlFilters({});
    setSelectedTypes([...allCodes]);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("types");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [setUrlFilters, setSelectedTypes, allCodes, searchParams, router, pathname]);

  const goToRecent = useCallback((item: SearchHistoryItem) => {
    const extra: Record<string, string> = {};
    if (item.type === "keyword" && item.keyword) {
      extra.q = item.keyword;
    } else if (item.type === "region" && item.sido && item.sigungu) {
      extra.sido = item.sido;
      extra.sigungu = item.sigungu;
      if (item.dong) extra.dong = item.dong;
    } else {
      return;
    }
    if (selectedTypes.length < allCodes.length) extra.types = selectedTypes.join(",");
    router.push(buildFilterURL(pathname, extra, urlFilters));
  }, [router, selectedTypes, allCodes, urlFilters, pathname]);

  const title = keyword
    ? `"${keyword}" 검색 결과`
    : sido && sigungu
    ? `${sido} ${sigungu}${dong ? ` ${dong}` : ""} 단지 목록`
    : "검색";

  const typesStr = selectedTypes.length < allCodes.length ? selectedTypes.join(",") : undefined;

  const { data: searchData, isLoading: loading, isError, refetch: retrySearch } = useQuery({
    queryKey: keyword
      ? queryKeys.search(keyword, typesStr)
      : queryKeys.regionSearch(sido, sigungu, dong || undefined, typesStr),
    queryFn: ({ signal }) => keyword
      ? searchComplexes(keyword, signal, typesStr)
      : getComplexesByRegion(sido, sigungu, dong || undefined, signal, typesStr),
    enabled: hasSearchParams,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  const complexes = useMemo(() => searchData?.complexes ?? [], [searchData?.complexes]);
  const fallbackNotice = (() => {
    const data = searchData as { source?: string; notice?: string } | undefined;
    if (data?.source === "db_fallback") {
      return data.notice ?? "네이버 실시간 검색이 일시적으로 지연되어 저장된 단지 데이터로 표시합니다.";
    }
    if (data?.source === "region_fallback") {
      return data.notice ?? `'${dong}'에 등록된 단지가 아직 없어 '${sigungu}' 단위로 결과를 표시합니다.`;
    }
    return "";
  })();
  const error = isError
    ? (sido && sigungu && dong
        ? `'${sido} ${sigungu} ${dong}' 검색 결과가 없습니다. 동을 빼고 시구 단위로 다시 시도하거나 단지명으로 검색해보세요.`
        : "검색에 실패했습니다. 다시 시도해주세요.")
    : "";

  const filteredComplexes = useMemo(
    () => complexes.filter(
      (c) => !c.real_estate_type_code || selectedTypes.includes(c.real_estate_type_code),
    ),
    [complexes, selectedTypes],
  );

  const sortedFilteredComplexes = useMemo(
    () => sortComplexes(filteredComplexes, complexSort),
    [filteredComplexes, complexSort],
  );

  useEffect(() => {
    const supabase = createClient();
    const controller = new AbortController();
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) { setIsLoggedIn(false); return; }
      setIsLoggedIn(true);
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ""}/api/users/me`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
          signal: controller.signal,
        });
        if (res.ok && !controller.signal.aborted) {
          const me = await res.json();
          if (!controller.signal.aborted) setUserStatus(me.status);
        }
      } catch { /* abort 또는 네트워크 오류 무시 */ }
    }).catch(() => setIsLoggedIn(false));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    document.title = hasSearchParams
      ? `${title} - 아파트·오피스텔`
      : "공인중개사를 위한 매물·시세 분석 도구";
  }, [title, hasSearchParams]);

  const handleTabChange = (types: string[]) => {
    setSelectedTypes(types);
    const params = new URLSearchParams(searchParams.toString());
    if (types.length < allCodes.length) {
      params.set("types", types.join(","));
    } else {
      params.delete("types");
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleInlineKeywordSearch = () => {
    const q = inlineKeyword.trim();
    if (!q) return;
    addHistory({ type: "keyword", keyword: q });
    const extra: Record<string, string> = { q };
    if (selectedTypes.length < allCodes.length) extra.types = selectedTypes.join(",");
    router.push(buildFilterURL(pathname, extra, urlFilters));
  };

  const handleInlineRegionSearch = (s: string, sg: string, d?: string) => {
    addHistory({ type: "region", sido: s, sigungu: sg, dong: d });
    const extra: Record<string, string> = { sido: s, sigungu: sg };
    if (d) extra.dong = d;
    if (selectedTypes.length < allCodes.length) extra.types = selectedTypes.join(",");
    router.push(buildFilterURL(pathname, extra, urlFilters));
  };

  return (
    <div>
      {headerSlot}

      {/* 검색 결과 헤더 — 결과가 있을 때만 제목/개수/즐겨찾기 링크 */}
      {hasSearchParams && (
        <div className="flex items-center gap-4 mb-6 flex-wrap">
          <h1 className="text-2xl font-bold">{title}</h1>
          {!loading && (
            <span className="text-gray-500 text-sm">({filteredComplexes.length}개 단지)</span>
          )}
          <Link
            href="/search/favorites"
            className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline whitespace-nowrap"
          >
            <span className="text-yellow-500">&#9733;</span>
            즐겨찾기 매물{articleFavorites.length > 0 ? ` (${articleFavorites.length})` : ""} &#8594;
          </Link>
        </div>
      )}

      {/* 매물유형 탭 */}
      <div className="mb-3">
        <EstateTypeTabs selected={selectedTypes} onChange={handleTabChange} />
      </div>

      {/* 매물 필터 + 단지 정렬 — 모바일/데스크탑 분기 */}
      <div className="mb-5">
        <div className="md:hidden flex flex-wrap items-center gap-2">
          <FilterBarMobileSheet key={`mobile-${filterKey}`} onChange={setUrlFilters} initialFilters={urlFilters} />
          <ComplexSortDropdown value={complexSort} onChange={setComplexSort} />
        </div>
        <div className="hidden md:flex flex-wrap items-start gap-2">
          <div className="flex-1 min-w-0">
            <FilterBar key={filterKey} onChange={setUrlFilters} initialFilters={urlFilters} />
          </div>
          <ComplexSortDropdown value={complexSort} onChange={setComplexSort} />
        </div>
      </div>

      {/* 검색 파라미터 없을 때: 인라인 검색 폼 */}
      {!hasSearchParams && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h2 className="text-lg font-semibold mb-3">단지명 검색</h2>
            <div className="flex gap-2">
              <input
                type="text"
                aria-label="단지명 검색"
                value={inlineKeyword}
                onChange={(e) => setInlineKeyword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleInlineKeywordSearch()}
                placeholder="단지명 검색 (예: 래미안, 힐스테이트, 강남...)"
                maxLength={100}
                className="flex-1 border border-gray-300 rounded-md px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                onClick={handleInlineKeywordSearch}
                className="bg-blue-600 text-white px-6 py-2.5 rounded-md text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                검색
              </button>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h2 className="text-lg font-semibold mb-3">지역 선택</h2>
            <RegionSelector onSearch={handleInlineRegionSearch} />
          </div>

          {emptyExtra}

          <RecentSearchChips items={recentItems} onSelect={goToRecent} />
        </div>
      )}

      {/* 로딩 */}
      {loading && <SkeletonPage message="검색 중입니다. 잠시만 기다려주세요." />}

      {/* DB 폴백 안내 */}
      {fallbackNotice && !loading && (
        <div role="status" className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800">
          <span aria-hidden="true">⚠ </span>
          {fallbackNotice}
        </div>
      )}

      {/* 에러 */}
      {error && (
        <div className="text-center py-8 space-y-3">
          <p className="text-red-500">{error}</p>
          <div className="flex justify-center gap-2 flex-wrap">
            <button onClick={() => retrySearch()} className="text-sm text-blue-600 hover:underline px-3 py-1.5">
              다시 시도
            </button>
            {sido && sigungu && dong && (
              <button
                onClick={() => {
                  const p = new URLSearchParams({ sido, sigungu });
                  if (typesStr) p.set("types", typesStr);
                  router.push(`${pathname}?${p.toString()}`);
                }}
                className="text-sm text-blue-600 hover:underline px-3 py-1.5"
              >
                {sigungu} 단위로 검색
              </button>
            )}
            {hasActiveFilters && (
              <button onClick={resetFilters} className="text-sm text-gray-600 hover:underline px-3 py-1.5">
                필터 초기화
              </button>
            )}
          </div>
        </div>
      )}

      {/* 결과 없음 */}
      {hasSearchParams && !loading && !error && complexes.length === 0 && (
        <div className="text-center py-12 space-y-6">
          <div className="space-y-1">
            <p className="text-gray-700 font-medium">
              {keyword ? `"${keyword}"에 대한 검색 결과가 없습니다.` : "이 지역에 등록된 단지가 없습니다."}
            </p>
            <p className="text-gray-500 text-sm">다른 키워드나 지역으로 다시 시도해보세요.</p>
          </div>
          <div className="max-w-md mx-auto">
            <div className="flex gap-2">
              <input
                type="text"
                aria-label="다시 검색"
                value={inlineKeyword}
                onChange={(e) => setInlineKeyword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleInlineKeywordSearch()}
                placeholder="다른 키워드로 검색해보세요"
                maxLength={100}
                className="flex-1 border border-gray-300 rounded-md px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button onClick={handleInlineKeywordSearch} className="bg-blue-600 text-white px-6 py-2.5 rounded-md text-sm font-medium hover:bg-blue-700">
                검색
              </button>
            </div>
          </div>
          <RecentSearchChips items={recentItems} onSelect={goToRecent} />
        </div>
      )}

      {/* 비회원 안내 */}
      {isLoggedIn === false && hasSearchParams && !loading && complexes.length > 0 && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
          단지 매물 조회는 <a href="/login" className="text-blue-600 underline font-medium">로그인</a> 후 이용 가능합니다.
          가입 후 관리자 승인이 필요합니다.
        </div>
      )}

      {/* 승인 대기 안내 */}
      {isLoggedIn === true && userStatus === "pending" && hasSearchParams && !loading && complexes.length > 0 && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
          회원가입이 완료되었습니다! 관리자 승인 대기 중입니다. 승인 후 단지 매물 조회가 가능합니다.
        </div>
      )}

      {/* 필터 통과 0건 */}
      {!loading && !error && complexes.length > 0 && sortedFilteredComplexes.length === 0 && (
        <div className="text-center py-12 space-y-3">
          <p className="text-gray-700 font-medium">필터 조건에 맞는 단지가 없습니다.</p>
          <p className="text-gray-500 text-sm">
            전체 {complexes.length}개 단지 중 0개가 통과했습니다. 필터를 완화하거나 초기화해보세요.
          </p>
          <button onClick={resetFilters} className="text-sm text-blue-600 hover:underline px-3 py-1.5">
            필터 초기화
          </button>
        </div>
      )}

      {/* 단지 테이블 (데스크톱) */}
      {!loading && sortedFilteredComplexes.length > 0 && (
        <div className="hidden md:block overflow-x-auto bg-white rounded-lg shadow-sm border">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-gray-100 border-b-2 border-gray-300 sticky top-0 z-10">
              <tr>
                <th className="px-3 py-2.5 text-xs font-semibold text-gray-700 whitespace-nowrap border-r border-gray-200 w-[45px] text-center">No</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-gray-700 whitespace-nowrap border-r border-gray-200 min-w-[140px] text-left">단지명</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-gray-700 whitespace-nowrap border-r border-gray-200 min-w-[200px] text-left">주소</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-gray-700 whitespace-nowrap border-r border-gray-200 w-[70px] text-right">세대수</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-gray-700 whitespace-nowrap border-r border-gray-200 w-[55px] text-right">동수</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-gray-700 whitespace-nowrap border-r border-gray-200 w-[60px] text-right">최고층</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-gray-700 whitespace-nowrap border-r border-gray-200 w-[60px] text-center">준공</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-gray-700 whitespace-nowrap border-r border-gray-200 w-[65px] text-center">유형</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-gray-700 whitespace-nowrap w-[65px] text-right">매물수</th>
                <th className="px-2 py-2.5 text-xs font-semibold text-gray-700 whitespace-nowrap w-[40px] text-center" title="최대 4개 단지를 비교할 수 있습니다">비교</th>
              </tr>
            </thead>
            <tbody>
              {sortedFilteredComplexes.map((cpx, idx) => (
                <ComplexRow key={cpx.complex_no} complex={cpx} index={idx + 1} urlFilters={urlFilters} isCompared={isInCompare(cpx.complex_no)} compareFull={compareFull} onToggleCompare={toggleCompare} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 단지 카드 (모바일) */}
      {!loading && sortedFilteredComplexes.length > 0 && (
        <div className="md:hidden space-y-3">
          {sortedFilteredComplexes.map((cpx, idx) => (
            <ComplexCardMobile key={cpx.complex_no} complex={cpx} index={idx + 1} urlFilters={urlFilters} isCompared={isInCompare(cpx.complex_no)} compareFull={compareFull} onToggleCompare={toggleCompare} />
          ))}
        </div>
      )}

      <CompareFloatingBar list={compareList} onRemove={removeCompare} onClear={clearCompare} />
    </div>
  );
}
