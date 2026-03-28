"use client";

import { useState, useEffect, useMemo, useCallback, memo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { searchComplexes, getComplexesByRegion, getComplex, getArticles } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { createClient } from "@/lib/supabase";
import RegionSelector from "@/components/RegionSelector";
import FilterBar from "@/components/FilterBar";
import type { Complex } from "@/types";
import { ESTATE_TYPE_COLORS, ESTATE_TYPE_DEFAULT_COLOR, ESTATE_TYPE_TABS, PAGE_SIZE } from "@/lib/constants";
import EstateTypeTabs from "@/components/EstateTypeTabs";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useSmartBack } from "@/hooks/useSmartBack";
import { useFilterParams } from "@/hooks/useFilterParams";
import { useCompare } from "@/hooks/useCompare";
import CompareFloatingBar from "@/components/CompareFloatingBar";

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

  const { filters: urlFilters, setFilters: setUrlFilters, buildURL, filterKey } = useFilterParams();
  const { list: compareList, toggle: toggleCompare, remove: removeCompare, clear: clearCompare, isInCompare, isFull: compareFull } = useCompare();
  const hasSearchParams = !!(keyword || (sido && sigungu));

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
      ? searchComplexes(keyword, 50, signal, typesStr)
      : getComplexesByRegion(sido, sigungu, dong || undefined, signal, typesStr),
    enabled: hasSearchParams,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  const complexes = searchData?.complexes ?? [];
  const error = isError ? "검색에 실패했습니다. 다시 시도해주세요." : "";

  // 매물유형 클라이언트 필터 (complexes/selectedTypes 변경 시만 재계산)
  const filteredComplexes = useMemo(
    () => complexes.filter(
      (c) => !c.real_estate_type_code || selectedTypes.includes(c.real_estate_type_code)
    ),
    [complexes, selectedTypes],
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

      {/* 매물 필터 */}
      <div className="mb-5">
        <FilterBar key={filterKey} onChange={setUrlFilters} initialFilters={urlFilters} />
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
      {loading && <LoadingSpinner message="검색 중입니다. 잠시만 기다려주세요." />}

      {/* 에러 */}
      {error && (
        <div className="text-center py-8">
          <p className="text-red-500 mb-3">{error}</p>
          <button
            onClick={() => retrySearch()}
            className="text-sm text-blue-600 hover:underline"
          >
            다시 시도
          </button>
        </div>
      )}

      {/* 결과 없음 */}
      {hasSearchParams && !loading && !error && complexes.length === 0 && (
        <div className="text-center py-16 space-y-6">
          <p className="text-gray-500">검색 결과가 없습니다.</p>
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

      {/* 단지 테이블 */}
      {!loading && complexes.length > 0 && (
        <div className="overflow-x-auto bg-white rounded-lg shadow-sm border">
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
                <th className="px-2 py-2.5 text-xs font-semibold text-gray-700 whitespace-nowrap w-[40px] text-center">비교</th>
              </tr>
            </thead>
            <tbody>
              {filteredComplexes.map((cpx, idx) => (
                <ComplexRow key={cpx.complex_no} complex={cpx} index={idx + 1} filterURL={buildURL(`/complex/${cpx.complex_no}`, undefined, urlFilters)} isCompared={isInCompare(cpx.complex_no)} compareFull={compareFull} onToggleCompare={() => toggleCompare({ complex_no: cpx.complex_no, complex_name: cpx.complex_name })} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 비교 플로팅 바 */}
      <CompareFloatingBar list={compareList} onRemove={removeCompare} onClear={clearCompare} />
    </div>
  );
}

const ComplexRow = memo(function ComplexRow({ complex, index, filterURL, isCompared, compareFull, onToggleCompare }: { complex: Complex; index: number; filterURL?: string; isCompared?: boolean; compareFull?: boolean; onToggleCompare?: () => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const year = complex.use_approve_ymd?.slice(0, 4);
  const articleCount = complex.article_count ?? 0;
  const isEven = index % 2 === 0;

  /** hover 시 complex + articles 프리페치 → 클릭 시 즉시 표시 */
  const handlePrefetch = useCallback(() => {
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
  }, [complex.complex_no, queryClient]);

  return (
    <tr
      className={`hover:bg-blue-50 cursor-pointer transition-colors border-b border-gray-200 ${isEven ? "bg-gray-50/60" : "bg-white"}`}
      onClick={() => router.push(filterURL || `/complex/${complex.complex_no}`)}
      onMouseEnter={handlePrefetch}
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
      </td>
      <td className="px-2 py-2 text-center whitespace-nowrap">
        <button
          onClick={(e) => { e.stopPropagation(); onToggleCompare?.(); }}
          disabled={!isCompared && compareFull}
          className={`text-xs px-2 py-0.5 rounded border transition-colors ${
            isCompared
              ? "bg-blue-600 text-white border-blue-600"
              : compareFull
                ? "bg-gray-100 text-gray-300 border-gray-200 cursor-not-allowed"
                : "bg-white text-gray-500 border-gray-300 hover:bg-blue-50 hover:text-blue-600"
          }`}
          title={isCompared ? "비교 해제" : compareFull ? "최대 4개" : "비교 추가"}
        >
          {isCompared ? "V" : "+"}
        </button>
      </td>
    </tr>
  );
});

export default function SearchPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <SearchContent />
    </Suspense>
  );
}
