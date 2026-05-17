"use client";

import { useState, useEffect, useMemo, useCallback, useRef, memo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { searchComplexes, getComplexesByRegion, getComplex, getArticles } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { createClient } from "@/lib/supabase";
import RegionSelector from "@/components/RegionSelector";
import FilterBar from "@/components/FilterBar";
import type { Complex } from "@/types";
import { COMPLEX_SORT_OPTIONS, ESTATE_TYPE_COLORS, ESTATE_TYPE_DEFAULT_COLOR, ESTATE_TYPE_TABS, PAGE_SIZE } from "@/lib/constants";
import EstateTypeTabs from "@/components/EstateTypeTabs";
import ComplexSortDropdown from "@/components/ComplexSortDropdown";
import { SkeletonPage } from "@/components/Skeleton";
import { useSmartBack } from "@/hooks/useSmartBack";
import { useFilterParams, buildFilterURL } from "@/hooks/useFilterParams";
import { useCompare, type CompareItem } from "@/hooks/useCompare";
import { useSearchHistory } from "@/hooks/useSearchHistory";
import { sortComplexes } from "@/lib/sortComplexes";
import type { SearchHistoryItem } from "@/lib/storage";
import type { ArticleFilters } from "@/types";
import CompareFloatingBar from "@/components/CompareFloatingBar";

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

  // 로그인 + 승인 상태 확인
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) { setIsLoggedIn(false); return; }
      setIsLoggedIn(true);
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ""}/api/users/me`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          const me = await res.json();
          setUserStatus(me.status);
        }
      } catch { /* 무시 */ }
    }).catch(() => setIsLoggedIn(false));
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
      {/* 헤더 */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={goBack} aria-label="이전 페이지" className="text-gray-400 hover:text-gray-600 text-xl">
          ←
        </button>
        <h1 className="text-2xl font-bold">{title}</h1>
        {hasSearchParams && !loading && (
          <span className="text-gray-500 text-sm">({filteredComplexes.length}개 단지)</span>
        )}
      </div>

      {/* 매물유형 탭 */}
      <div className="mb-3">
        <EstateTypeTabs selected={selectedTypes} onChange={handleTabChange} />
      </div>

      {/* 매물 필터 + 단지 정렬 */}
      <div className="mb-5 flex flex-wrap items-start gap-2">
        <div className="flex-1 min-w-0">
          <FilterBar key={filterKey} onChange={setUrlFilters} initialFilters={urlFilters} />
        </div>
        <ComplexSortDropdown value={complexSort} onChange={setComplexSort} />
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

/** 거래유형별 매물 수 → "매매 12·전세 5" 보조 텍스트. 전부 0이면 빈 문자열 */
function tradeTypeSummary(tc: Complex["trade_type_counts"]): string {
  if (!tc) return "";
  return (["매매", "전세", "월세", "단기임대"] as const)
    .filter((t) => tc[t] > 0)
    .map((t) => `${t} ${tc[t]}`)
    .join("·");
}

const ComplexRow = memo(function ComplexRow({ complex, index, urlFilters, isCompared, compareFull, onToggleCompare }: { complex: Complex; index: number; urlFilters?: ArticleFilters; isCompared?: boolean; compareFull?: boolean; onToggleCompare?: (item: CompareItem) => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const filterURL = buildFilterURL(`/complex/${complex.complex_no}`, undefined, urlFilters);
  const year = complex.use_approve_ymd?.slice(0, 4);
  const articleCount = complex.article_count ?? 0;
  const tradeSummary = tradeTypeSummary(complex.trade_type_counts);
  const isEven = index % 2 === 0;

  /** hover 200ms 유지 시 complex + articles 프리페치 (빠른 스크롤 시 불필요한 요청 방지) */
  const prefetchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const handlePrefetchEnter = useCallback(() => {
    prefetchTimer.current = setTimeout(() => {
      const no = complex.complex_no;
      queryClient.prefetchQuery({
        queryKey: queryKeys.complex(no),
        queryFn: () => getComplex(no),
        staleTime: 60_000,
      });
      queryClient.prefetchQuery({
        queryKey: queryKeys.articles(no, { page: 1, page_size: PAGE_SIZE }),
        queryFn: () => getArticles(no, { page: 1, page_size: PAGE_SIZE }),
        staleTime: 60_000,
      });
    }, 200);
  }, [complex.complex_no, queryClient]);
  const handlePrefetchLeave = useCallback(() => {
    clearTimeout(prefetchTimer.current);
  }, []);

  return (
    <tr
      className={`hover:bg-blue-50 cursor-pointer transition-colors border-b border-gray-200 ${isEven ? "bg-gray-50/60" : "bg-white"}`}
      onClick={() => router.push(filterURL || `/complex/${complex.complex_no}`)}
      onMouseEnter={handlePrefetchEnter}
      onMouseLeave={handlePrefetchLeave}
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
          className={`text-xs px-2 py-0.5 rounded border transition-colors ${
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

const ComplexCardMobile = memo(function ComplexCardMobile({ complex, index, urlFilters, isCompared, compareFull, onToggleCompare }: { complex: Complex; index: number; urlFilters?: ArticleFilters; isCompared?: boolean; compareFull?: boolean; onToggleCompare?: (item: CompareItem) => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const year = complex.use_approve_ymd?.slice(0, 4);
  const articleCount = complex.article_count ?? 0;
  const tradeSummary = tradeTypeSummary(complex.trade_type_counts);
  const colorClass = complex.real_estate_type_name ? (ESTATE_TYPE_COLORS[complex.real_estate_type_name] ?? ESTATE_TYPE_DEFAULT_COLOR) : "";
  const filterURL = buildFilterURL(`/complex/${complex.complex_no}`, undefined, urlFilters);

  const prefetchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const handlePrefetchEnter = useCallback(() => {
    prefetchTimer.current = setTimeout(() => {
      const no = complex.complex_no;
      queryClient.prefetchQuery({ queryKey: queryKeys.complex(no), queryFn: () => getComplex(no), staleTime: 60_000 });
      queryClient.prefetchQuery({ queryKey: queryKeys.articles(no, { page: 1, page_size: PAGE_SIZE }), queryFn: () => getArticles(no, { page: 1, page_size: PAGE_SIZE }), staleTime: 60_000 });
    }, 200);
  }, [complex.complex_no, queryClient]);
  const handlePrefetchLeave = useCallback(() => { clearTimeout(prefetchTimer.current); }, []);

  return (
    <div
      className="bg-white rounded-lg shadow-sm border p-4 cursor-pointer hover:bg-blue-50 transition-colors active:bg-blue-100"
      onClick={() => router.push(filterURL || `/complex/${complex.complex_no}`)}
      onMouseEnter={handlePrefetchEnter}
      onMouseLeave={handlePrefetchLeave}
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

export default function SearchPage() {
  return (
    <Suspense fallback={<SkeletonPage />}>
      <SearchContent />
    </Suspense>
  );
}
