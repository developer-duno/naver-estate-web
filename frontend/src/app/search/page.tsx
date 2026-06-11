"use client";

import { useState, useEffect, useMemo, useCallback, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
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
import { useSmartBack } from "@/hooks/useSmartBack";
import { useFilterParams } from "@/hooks/useFilterParams";
import { useCompare } from "@/hooks/useCompare";
import { useSearchHistory } from "@/hooks/useSearchHistory";
import { useArticleFavorites } from "@/hooks/useArticleFavorites";
import { sortComplexes } from "@/lib/sortComplexes";
import type { SearchHistoryItem } from "@/lib/storage";
import CompareFloatingBar from "@/components/CompareFloatingBar";
import { ComplexRow } from "@/components/search/ComplexRow";
import { ComplexCardMobile } from "@/components/search/ComplexCardMobile";

const VALID_COMPLEX_SORT = new Set<string>(COMPLEX_SORT_OPTIONS.map((o) => o.v));

function SearchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const goBack = useSmartBack();
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
    typesParam ? typesParam.split(",").filter((c) => allCodes.includes(c)) : [...allCodes]
  );

  const { filters: urlFilters, setFilters: setUrlFilters, filterKey } = useFilterParams();
  const { list: compareList, toggle: toggleCompare, remove: removeCompare, clear: clearCompare, isInCompare, isFull: compareFull } = useCompare();
  const { history } = useSearchHistory();
  const { favorites: articleFavorites } = useArticleFavorites();
  const recentItems = history.slice(0, 5);
  const hasSearchParams = !!(keyword || (sido && sigungu));

  // 필터 활성 판정 (urlFilters 의 sort_by 외 키 + 매물유형 탭 좁힘)
  const filtersActive = Object.keys(urlFilters).some((k) => k !== "sort_by");
  const typesNarrowed = selectedTypes.length < allCodes.length;
  const hasActiveFilters = filtersActive || typesNarrowed;

  // 단지 정렬 (URL ?complex_sort 동기화, whitelist 검증)
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
    router.replace(qs ? `/search?${qs}` : "/search", { scroll: false });
  }, [searchParams, router]);

  // 필터 + 매물유형 탭 + ?types= URL 키를 한 번에 초기화
  const resetFilters = useCallback(() => {
    setUrlFilters({});
    setSelectedTypes([...allCodes]);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("types");
    const qs = params.toString();
    router.replace(qs ? `/search?${qs}` : "/search", { scroll: false });
  }, [setUrlFilters, allCodes, searchParams, router]);

  // 최근 검색어 칩 클릭 → 같은 검색 재실행
  const goToRecent = useCallback((item: SearchHistoryItem) => {
    if (item.type === "keyword" && item.keyword) {
      router.push(`/search?q=${encodeURIComponent(item.keyword)}`);
    } else if (item.type === "region" && item.sido && item.sigungu) {
      let path = `/search?sido=${encodeURIComponent(item.sido)}&sigungu=${encodeURIComponent(item.sigungu)}`;
      if (item.dong) path += `&dong=${encodeURIComponent(item.dong)}`;
      router.push(path);
    }
  }, [router]);

  const title = keyword
    ? `"${keyword}" 검색 결과`
    : sido && sigungu
    ? `${sido} ${sigungu}${dong ? ` ${dong}` : ""} 단지 목록`
    : "검색";

  const typesStr = selectedTypes.length < allCodes.length ? selectedTypes.join(",") : undefined;

  // React Query로 검색 데이터 페칭
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

  // 매물유형 클라이언트 필터 (complexes/selectedTypes 변경 시만 재계산)
  const filteredComplexes = useMemo(
    () => complexes.filter(
      (c) => !c.real_estate_type_code || selectedTypes.includes(c.real_estate_type_code)
    ),
    [complexes, selectedTypes],
  );

  // 정렬 적용 (필터 통과한 목록을 sortBy 기준 재정렬)
  const sortedFilteredComplexes = useMemo(
    () => sortComplexes(filteredComplexes, complexSort),
    [filteredComplexes, complexSort],
  );

  // 로그인 + 승인 상태 확인 (Header.tsx fetchProfile 답습 — AbortController 로 언마운트 시 fetch 취소)
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

  // SEO: 동적 타이틀
  useEffect(() => {
    document.title = hasSearchParams
      ? `${title} - 아파트·오피스텔`
      : "검색 - 아파트·오피스텔";
  }, [title, hasSearchParams]);

  const buildTypesParam = (types: string[]) =>
    types.length < allCodes.length ? `&types=${types.join(",")}` : "";

  const handleTabChange = (types: string[]) => {
    setSelectedTypes(types);
    // URL 업데이트 (현재 검색 파라미터 유지)
    const params = new URLSearchParams(searchParams.toString());
    if (types.length < allCodes.length) {
      params.set("types", types.join(","));
    } else {
      params.delete("types");
    }
    router.push(`/search?${params.toString()}`);
  };

  const handleInlineKeywordSearch = () => {
    const q = inlineKeyword.trim();
    if (!q) return;
    router.push(`/search?q=${encodeURIComponent(q)}${buildTypesParam(selectedTypes)}`);
  };

  const handleInlineRegionSearch = (s: string, sg: string, d?: string) => {
    let path = `/search?sido=${encodeURIComponent(s)}&sigungu=${encodeURIComponent(sg)}`;
    if (d) path += `&dong=${encodeURIComponent(d)}`;
    router.push(path + buildTypesParam(selectedTypes));
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* 헤더 — flex-wrap: 좁은 화면에서 즐겨찾기 링크가 다음 줄로 (PR #152 답습) */}
      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <button onClick={goBack} aria-label="이전 페이지" className="text-gray-400 hover:text-gray-600 text-xl rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
          ←
        </button>
        <h1 className="text-2xl font-bold">{title}</h1>
        {hasSearchParams && !loading && (
          <span className="text-gray-500 text-sm">({filteredComplexes.length}개 단지)</span>
        )}
        {/* 즐겨찾기 매물 모아보기 진입점 — 별을 찍는 동선(/search)에서 직접 진입 (홈 칩과 동일 패턴) */}
        <Link
          href="/search/favorites"
          className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline whitespace-nowrap"
        >
          <span className="text-yellow-500">&#9733;</span>
          즐겨찾기 매물{articleFavorites.length > 0 ? ` (${articleFavorites.length})` : ""} &#8594;
        </Link>
      </div>

      {/* 매물유형 탭 */}
      <div className="mb-3">
        <EstateTypeTabs selected={selectedTypes} onChange={handleTabChange} />
      </div>

      {/* 매물 필터 + 단지 정렬 — 모바일/데스크탑 분기 (PR 4 단계 5) */}
      <div className="mb-5">
        {/* 모바일 (< md): FilterBarMobileSheet 시트 + ComplexSortDropdown 별도 (PR 3b 답습) */}
        <div className="md:hidden flex flex-wrap items-center gap-2">
          <FilterBarMobileSheet key={`mobile-${filterKey}`} onChange={setUrlFilters} initialFilters={urlFilters} />
          <ComplexSortDropdown value={complexSort} onChange={setComplexSort} />
        </div>
        {/* 데스크탑 (md+): 기존 FilterBar + ComplexSortDropdown 유지 (시각 변화 0 약속) */}
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
            <h2 className="text-lg font-semibold mb-3">키워드 검색</h2>
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
        </div>
      )}

      {/* 로딩 */}
      {loading && <SkeletonPage message="검색 중입니다. 잠시만 기다려주세요." />}

      {/* DB 폴백 안내 — 네이버 쿨다운 중 저장된 데이터로 표시됨 */}
      {fallbackNotice && !loading && (
        <div
          role="status"
          className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800"
        >
          <span aria-hidden="true">⚠ </span>
          {fallbackNotice}
        </div>
      )}

      {/* 에러 */}
      {error && (
        <div className="text-center py-8 space-y-3">
          <p className="text-red-500">{error}</p>
          <div className="flex justify-center gap-2 flex-wrap">
            <button
              onClick={() => retrySearch()}
              className="text-sm text-blue-600 hover:underline px-3 py-1.5"
            >
              다시 시도
            </button>
            {sido && sigungu && dong && (
              <button
                onClick={() => router.push(`/search?sido=${encodeURIComponent(sido)}&sigungu=${encodeURIComponent(sigungu)}${buildTypesParam(selectedTypes)}`)}
                className="text-sm text-blue-600 hover:underline px-3 py-1.5"
              >
                {sigungu} 단위로 검색
              </button>
            )}
            {hasActiveFilters && (
              <button
                onClick={resetFilters}
                className="text-sm text-gray-600 hover:underline px-3 py-1.5"
              >
                필터 초기화
              </button>
            )}
          </div>
        </div>
      )}

      {/* 결과 없음 (서버 응답 0건) */}
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
              <button
                onClick={handleInlineKeywordSearch}
                className="bg-blue-600 text-white px-6 py-2.5 rounded-md text-sm font-medium hover:bg-blue-700"
              >
                검색
              </button>
            </div>
          </div>
          {recentItems.length > 0 && (
            <div className="max-w-md mx-auto pt-2">
              <p className="text-xs text-gray-500 mb-2">최근 검색</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {recentItems.map((item) => (
                  <button
                    key={item.timestamp}
                    onClick={() => goToRecent(item)}
                    className="text-xs px-2.5 py-1 rounded-full border border-gray-300 bg-white hover:bg-blue-50 hover:border-blue-300 text-gray-700"
                  >
                    {item.type === "keyword"
                      ? item.keyword
                      : `${item.sido} ${item.sigungu}${item.dong ? ` ${item.dong}` : ""}`}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 비회원 안내 */}
      {isLoggedIn === false && hasSearchParams && !loading && complexes.length > 0 && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
          단지 매물 조회는 <a href="/login" className="text-blue-600 underline font-medium">로그인</a> 후 이용 가능합니다.
          가입 후 관리자 승인이 필요합니다.
        </div>
      )}

      {/* 승인 대기 중 안내 */}
      {isLoggedIn === true && userStatus === "pending" && hasSearchParams && !loading && complexes.length > 0 && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
          회원가입이 완료되었습니다! 관리자 승인 대기 중입니다. 승인 후 단지 매물 조회가 가능합니다.
        </div>
      )}

      {/* 필터 통과 0건 (서버는 결과 있으나 클라이언트 필터·매물유형 탭으로 좁혀서 0) */}
      {!loading && !error && complexes.length > 0 && sortedFilteredComplexes.length === 0 && (
        <div className="text-center py-12 space-y-3">
          <p className="text-gray-700 font-medium">필터 조건에 맞는 단지가 없습니다.</p>
          <p className="text-gray-500 text-sm">
            전체 {complexes.length}개 단지 중 0개가 통과했습니다. 필터를 완화하거나 초기화해보세요.
          </p>
          <button
            onClick={resetFilters}
            className="text-sm text-blue-600 hover:underline px-3 py-1.5"
          >
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

      {/* 비교 플로팅 바 */}
      <CompareFloatingBar list={compareList} onRemove={removeCompare} onClear={clearCompare} />
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<SkeletonPage />}>
      <SearchContent />
    </Suspense>
  );
}
