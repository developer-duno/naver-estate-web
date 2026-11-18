"use client";

import { useState, useEffect, useMemo, useCallback, type ReactNode } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { searchComplexes, getComplexesByRegion } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { createClient } from "@/lib/supabase";
import RegionSelector from "@/components/RegionSelector";
import FilterBar from "@/components/FilterBar";
import FilterBarMobileSheet from "@/components/FilterBarMobileSheet";
import { COMPLEX_SORT_OPTIONS, ESTATE_TYPE_TABS, DEFAULT_ESTATE_TYPES } from "@/lib/constants";
import EstateTypeTabs from "@/components/EstateTypeTabs";
import HiddenTypesHint from "@/components/search/HiddenTypesHint";
import ComplexSortDropdown from "@/components/ComplexSortDropdown";
import { SkeletonPage } from "@/components/Skeleton";
import { useFilterParams, buildFilterURL } from "@/hooks/useFilterParams";
import { useCompare } from "@/hooks/useCompare";
import { useSearchHistory } from "@/hooks/useSearchHistory";
import { useArticleFavorites } from "@/hooks/useArticleFavorites";
import { useSearchViewMode } from "@/hooks/useSearchViewMode";
import { useGeolocation } from "@/hooks/useGeolocation";
import { sortComplexes } from "@/lib/sortComplexes";
import type { SearchHistoryItem } from "@/lib/storage";
import CompareFloatingBar from "@/components/CompareFloatingBar";
import { ComplexCardMobile } from "@/components/search/ComplexCardMobile";
import SearchBand from "@/components/search/SearchBand";
import SearchResults from "@/components/search/SearchResults";
import RecentSearchChips from "@/components/search/RecentSearchChips";
import ActiveFilterChips from "@/components/search/ActiveFilterChips";
import MbViewToggle from "@/components/mb/MbViewToggle";
import type { ArticleFilters, Complex } from "@/types";

// 완전 지연 로드(계획 §핵심결정4) — 이 dynamic import 문 자체는 모듈 로드 시 평가되지만
// 실제 청크 네트워크 요청은 컴포넌트가 처음 렌더(= 지도 토글 진입)될 때까지 발생하지 않는다.
// 클러스터링 벤더 코드는 목록 뷰만 쓰는 사용자에게 전혀 로드되지 않음.
const SearchClusterMap = dynamic(() => import("@/components/search/SearchClusterMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-96 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center">
      <p className="text-sm text-gray-500">지도를 불러오는 중...</p>
    </div>
  ),
});

const VALID_COMPLEX_SORT = new Set<string>(COMPLEX_SORT_OPTIONS.map((o) => o.v));

/** 매물유형 선택이 기본값(아파트만)과 같은지 — 순서 무관 집합 비교. */
function isDefaultTypes(sel: string[]): boolean {
  const defaults = DEFAULT_ESTATE_TYPES as readonly string[];
  return sel.length === defaults.length && defaults.every((c) => sel.includes(c));
}

/** renderEmpty 에 넘기는 기존 검색 손잡이(세션 508 홈 개편) — 검색 실행은 아래 handleInline* 그대로 */
export interface EmptySearchApi {
  keyword: string; setKeyword: (v: string) => void; submitKeyword: () => void;
  searchRegion: (sido: string, sigungu: string, dong?: string) => void; recentChips: ReactNode;
}

interface Props {
  /** 있으면 검색어 없는 빈 화면 전체를 이것으로 그린다(매물유형 탭·필터·검색 카드 대신 — 홈 전용, 세션 508) */
  renderEmpty?: (api: EmptySearchApi) => ReactNode;
  /** 빈 화면이 아닐 때(결과·로딩·오류) 바깥 상자 클래스 */
  className?: string;
}

/**
 * 검색 경험 공용 컴포넌트 — 입력(매물유형/필터/검색창/지역) + 결과(단지 목록/비교/정렬).
 * URL(useSearchParams)이 진실의 원천이라 홈(/)·검색(/search) 어디서 렌더해도 동일 동작.
 * 검색 시 현재 pathname(usePathname) 기준으로 URL 갱신 → 홈에선 /?q=, 검색에선 /search?q=.
 * (세션 314 — search/page.tsx SearchContent 본문 이식, 동작 보존)
 */
export default function SearchExperience({ renderEmpty, className }: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname() || "/";
  const [inlineKeyword, setInlineKeyword] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [userStatus, setUserStatus] = useState<string | null>(null);
  const { viewMode, setViewMode } = useSearchViewMode();
  const [selectedMapComplex, setSelectedMapComplex] = useState<Complex | null>(null);

  const keyword = searchParams.get("q") || "";
  const sido = searchParams.get("sido") || "";
  const sigungu = searchParams.get("sigungu") || "";
  const dong = searchParams.get("dong") || "";
  const allCodes = ESTATE_TYPE_TABS.map((t) => t.code) as string[];
  const typesParam = searchParams.get("types");
  // 기본 = 아파트만(DEFAULT_ESTATE_TYPES). URL types 는 허용 코드만 받고, 남는 게 없으면 기본값.
  const [selectedTypes, setSelectedTypes] = useState<string[]>(() => {
    const parsed = [...new Set((typesParam ?? "").split(",").filter((c) => allCodes.includes(c)))];
    return parsed.length > 0 ? parsed : [...DEFAULT_ESTATE_TYPES];
  });
  // 기본값과 다를 때만 URL 에 types 를 쓴다(6개 전부여도 씀 — 공유 주소가 같은 화면이 되도록).
  const typesForUrl = isDefaultTypes(selectedTypes) ? undefined : selectedTypes.join(",");

  const { filters: urlFilters, setFilters: setUrlFilters, filterKey } = useFilterParams();
  const { list: compareList, toggle: toggleCompare, remove: removeCompare, clear: clearCompare, isInCompare, isFull: compareFull } = useCompare();
  const { history, add: addHistory } = useSearchHistory();
  const { favorites: articleFavorites } = useArticleFavorites();
  const recentItems = history.slice(0, 5);
  const hasSearchParams = !!(keyword || (sido && sigungu));
  // 지역(시/도+시군구)을 명시적으로 고른 검색인지 — true 면 지도 카메라는 그 지역 결과에
  // fitBounds(명시 선택 우선, GPS 무시). MbClusterMap.tsx 의 regionSelected 개념 답습.
  const regionSelected = !!(sido && sigungu);
  // 지도 뷰 + 지역 미선택일 때만 현재 위치 요청 — 목록 뷰·지역 검색 사용자에겐 불필요한
  // 위치 권한 팝업을 안 띄운다. MbPresaleTab.tsx:73 과 동일 패턴.
  const { coords: userLocation } = useGeolocation(viewMode === "map" && !regionSelected);

  const filtersActive = Object.keys(urlFilters).some((k) => k !== "sort_by");
  // 기본값(아파트만)과 다르면 활성 칩·필터 초기화 대상
  const typesNarrowed = !isDefaultTypes(selectedTypes);
  const hasActiveFilters = filtersActive || typesNarrowed;

  const rawComplexSort = searchParams.get("complex_sort") ?? "default";
  // 비로그인으로 확정되면 매물 수 정렬은 쓰지 않는다 — 주소 글자는 그대로 두고(로그인하면 살아남) 기본순으로 본다(세션 491)
  const publicView = isLoggedIn === false;
  const complexSort =
    VALID_COMPLEX_SORT.has(rawComplexSort) && !(publicView && rawComplexSort === "article_desc")
      ? rawComplexSort
      : "default";
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
    setSelectedTypes([...DEFAULT_ESTATE_TYPES]);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("types");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [setUrlFilters, setSelectedTypes, searchParams, router, pathname]);

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
    if (typesForUrl) extra.types = typesForUrl;
    router.push(buildFilterURL(pathname, extra, urlFilters));
  }, [router, typesForUrl, urlFilters, pathname]);

  const title = keyword
    ? `"${keyword}" 검색 결과`
    : sido && sigungu
    ? `${sido} ${sigungu}${dong ? ` ${dong}` : ""} 단지 목록`
    : "검색";

  // 서버 전달 types — 기본값(아파트만)이면 보내지 않는다: 전부 받아 화면에서 거르고(숨긴 유형 개수를
  // 세야 함) 크롤 범위도 바꾸지 않는다. 기본값과 다르면 옛 규칙(6개 전부면 미전달, 아니면 그 유형만).
  const typesStr =
    isDefaultTypes(selectedTypes) || selectedTypes.length >= allCodes.length
      ? undefined
      : selectedTypes.join(",");

  const { data: searchData, isLoading: loading, isError, isPlaceholderData, refetch: retrySearch } = useQuery({
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

  // 검색 화면에서만 제목을 바꾸고 떠날 때 원래 제목으로 돌린다 — 빈 화면은 layout 제목 그대로(세션 508: 옛 홈 h1 글자로 덮던 것)
  useEffect(() => {
    if (!hasSearchParams) return;
    const prev = document.title;
    const mine = `${title} - 아파트·오피스텔`;
    document.title = mine;
    // 다른 장으로 옮겨 그 장이 제목을 이미 바꿨으면 덮지 않는다 — 내가 쓴 제목일 때만 되돌림
    return () => { if (document.title === mine) document.title = prev; };
  }, [title, hasSearchParams]);

  const handleTabChange = (types: string[]) => {
    setSelectedTypes(types);
    const params = new URLSearchParams(searchParams.toString());
    if (!isDefaultTypes(types)) {
      params.set("types", types.join(","));
    } else {
      params.delete("types");
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleInlineKeywordSearch = () => submitKeyword(inlineKeyword);
  function submitKeyword(raw: string) {
    const q = raw.trim();
    if (!q) return;
    addHistory({ type: "keyword", keyword: q });
    const extra: Record<string, string> = { q };
    if (typesForUrl) extra.types = typesForUrl;
    router.push(buildFilterURL(pathname, extra, urlFilters));
  }

  const handleInlineRegionSearch = (s: string, sg: string, d?: string) => {
    addHistory({ type: "region", sido: s, sigungu: sg, dong: d });
    const extra: Record<string, string> = { sido: s, sigungu: sg };
    if (d) extra.dong = d;
    if (typesForUrl) extra.types = typesForUrl;
    router.push(buildFilterURL(pathname, extra, urlFilters));
  };

  // ── F3: 적용 조건 칩 + 필터 접이식 ──
  // 매물 필터는 로그인 확정 손님이 「조건 수정」을 눌렀을 때만 연다(모든 상태 · 👤 11-18 결정 3) — 유형·정렬은 띠 칩(누구나).
  const [filtersOpen, setFiltersOpen] = useState(false);
  const showResults = hasSearchParams && !loading && sortedFilteredComplexes.length > 0;
  const canEditFilters = hasSearchParams && isLoggedIn === true;
  // 검색 결과 h1(세션 525 T1·T2) — 옛 결과를 잠깐 보여 주는 동안(isPlaceholderData)은 옛 단지 수 대신 「검색 중」
  const headName = keyword ? `「${keyword}」` : `${sido} ${sigungu}${dong ? ` ${dong}` : ""}`;
  const heading = loading || isPlaceholderData
    ? `${headName} 검색 중`
    : isError ? `${headName} 검색 결과` : `${headName} 단지 ${filteredComplexes.length}곳`;
  // 「더 보기」 펼친 수를 기억하는 목록 이름 — 검색어·지역·유형·정렬
  const listKey = [keyword, sido, sigungu, dong, typesForUrl ?? "", complexSort].join("|");

  const estateTypeLabels = typesNarrowed
    ? ESTATE_TYPE_TABS.filter((t) => selectedTypes.includes(t.code)).map((t) => t.label)
    : [];

  const removeFilter = (key: keyof ArticleFilters) => {
    setUrlFilters({ ...urlFilters, [key]: undefined });
  };
  const resetEstateTypes = () => {
    setSelectedTypes([...DEFAULT_ESTATE_TYPES]);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("types");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  if (renderEmpty && !hasSearchParams) {
    return (
      <>
        {renderEmpty({
          keyword: inlineKeyword, setKeyword: setInlineKeyword, submitKeyword: handleInlineKeywordSearch,
          searchRegion: handleInlineRegionSearch, recentChips: <RecentSearchChips items={recentItems} onSelect={goToRecent} />,
        })}
        <CompareFloatingBar list={compareList} onRemove={removeCompare} onClear={clearCompare} />
      </>
    );
  }

  return (
    <>
    {/* 검색 결과 = 얇은 남색 띠(세션 525 · 홈 큰 띠는 HomeSections 안이라 결과 화면엔 없다) */}
    {hasSearchParams && (
      <SearchBand
        query={keyword}
        onSubmitKeyword={submitKeyword}
        onSearchRegion={handleInlineRegionSearch}
        selectedTypes={selectedTypes}
        onTypesChange={handleTabChange}
        sort={complexSort}
        onSortChange={setComplexSort}
        publicView={publicView}
      />
    )}
    <div className={className}>
      {/* 제목 줄 — h1 + (비로그인) 안내 한 줄 · 오른쪽 (로그인) 즐겨찾기 매물 · 목록/지도 */}
      {hasSearchParams && (
        <div className="mb-4 flex flex-wrap items-start gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1">
            <h1 className="text-[22px] font-black leading-tight tracking-tight text-brand-navy sm:text-[28px]">{heading}</h1>
            {isLoggedIn === false && !loading && complexes.length > 0 && (
              <p className="mt-1.5 text-sm text-brand-muted">
                단지 정보는 누구나 볼 수 있어요. 네이버 매물·호가는 <a href="/login" className="font-bold text-brand-navy underline">로그인</a> 뒤에 보입니다.
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {/* 매물은 로그인 뒤 기능 — 로그인 확정일 때만 그린다(비로그인·세션 확인 전엔 숨김, 세션 493) */}
            {isLoggedIn === true && (
              <Link
                href="/search/favorites"
                className="inline-flex items-center gap-1 text-xs font-bold text-brand-navy hover:underline whitespace-nowrap"
              >
                <span className="text-brand-orange">&#9733;</span>
                즐겨찾기 매물{articleFavorites.length > 0 ? ` (${articleFavorites.length})` : ""} &#8594;
              </Link>
            )}
            {showResults && <MbViewToggle viewMode={viewMode} onChange={setViewMode} />}
          </div>
        </div>
      )}

      {/* F3: 로그인 확정이면 「조건 수정」 토글 + 적용 조건 칩 요약(모든 상태) */}
      {canEditFilters && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            className="inline-flex items-center gap-1 text-xs font-bold text-brand-navy border border-brand-line bg-white rounded-full px-3 py-1.5 hover:bg-brand-bg"
            aria-expanded={filtersOpen ? "true" : "false"}
          >
            {filtersOpen ? "조건 접기 ▲" : "조건 수정 ▼"}
          </button>
          {!filtersOpen && (
            <div className="flex-1 min-w-0">
              <ActiveFilterChips
                filters={urlFilters}
                estateTypeLabels={estateTypeLabels}
                onRemoveFilter={removeFilter}
                onResetEstateTypes={resetEstateTypes}
              />
            </div>
          )}
        </div>
      )}

      {/* 매물 필터 — 검색 결과는 「조건 수정」을 눌렀을 때만(유형·정렬은 띠 칩) · 검색어 없는 갈래(renderEmpty 없을 때)는 옛 그대로 탭·정렬과 함께 펼침 */}
      {(!hasSearchParams || (canEditFilters && filtersOpen)) && (
        <>
          {!hasSearchParams && (
            <div className="mb-3">
              <EstateTypeTabs selected={selectedTypes} onChange={handleTabChange} />
            </div>
          )}

          <div className="mb-5" data-testid="search-filters">
            <div className="md:hidden flex flex-wrap items-center gap-2">
              <FilterBarMobileSheet key={`mobile-${filterKey}`} onChange={setUrlFilters} initialFilters={urlFilters} />
              {!hasSearchParams && <ComplexSortDropdown value={complexSort} onChange={setComplexSort} publicView={publicView} />}
            </div>
            <div className="hidden md:flex flex-wrap items-start gap-2">
              <div className="flex-1 min-w-0">
                <FilterBar key={filterKey} onChange={setUrlFilters} initialFilters={urlFilters} />
              </div>
              {!hasSearchParams && <ComplexSortDropdown value={complexSort} onChange={setComplexSort} publicView={publicView} />}
            </div>
          </div>
        </>
      )}

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

          <RecentSearchChips items={recentItems} onSelect={goToRecent} />
        </div>
      )}

      {/* 로딩 */}
      {loading && <SkeletonPage message="검색 중입니다. 잠시만 기다려주세요." />}

      {/* DB 폴백 안내 */}
      {fallbackNotice && !loading && (
        <div role="status" className="mb-4 p-3 bg-brand-orange-soft border border-brand-orange/40 rounded-xl text-sm text-brand-orange-text">
          <span aria-hidden="true">⚠ </span>
          {fallbackNotice}
        </div>
      )}

      {/* 에러 */}
      {error && (
        <div className="text-center py-8 space-y-3">
          <p className="text-red-500">{error}</p>
          <div className="flex justify-center gap-2 flex-wrap">
            <button onClick={() => retrySearch()} className="text-sm font-bold text-brand-navy hover:underline px-3 py-1.5">
              다시 시도
            </button>
            {sido && sigungu && dong && (
              <button
                onClick={() => {
                  const p = new URLSearchParams({ sido, sigungu });
                  if (typesForUrl) p.set("types", typesForUrl);
                  router.push(`${pathname}?${p.toString()}`);
                }}
                className="text-sm font-bold text-brand-navy hover:underline px-3 py-1.5"
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
                className="flex-1 min-w-0 border border-brand-line rounded-xl bg-white px-4 py-2.5 text-sm text-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-orange"
              />
              <button onClick={handleInlineKeywordSearch} className="bg-brand-orange text-brand-navy px-6 py-2.5 rounded-xl text-sm font-bold hover:brightness-95">
                검색
              </button>
            </div>
          </div>
          <RecentSearchChips items={recentItems} onSelect={goToRecent} />
        </div>
      )}

      {/* 승인 대기 안내 (비회원 안내는 제목 줄 아래 한 줄로 옮김 — 세션 525) */}
      {isLoggedIn === true && userStatus === "pending" && hasSearchParams && !loading && complexes.length > 0 && (
        <div className="mb-4 p-3 bg-white border border-brand-line-soft rounded-xl text-sm text-brand-navy">
          회원가입이 완료되었습니다! 네이버 매물·호가를 볼 수 있어요. 공인중개사 인증을 받으면 새로 받기·실거래가 수집·엑셀까지 쓸 수 있어요.
        </div>
      )}

      {/* 필터 통과 0건 */}
      {!loading && !error && complexes.length > 0 && sortedFilteredComplexes.length === 0 && (
        <div className="text-center py-12 space-y-3">
          <p className="text-gray-700 font-medium">필터 조건에 맞는 단지가 없습니다.</p>
          <p className="text-gray-500 text-sm">
            전체 {complexes.length}개 단지 중 0개가 통과했습니다. 필터를 완화하거나 초기화해보세요.
          </p>
          <div className="max-w-xl mx-auto text-left">
            <HiddenTypesHint
              complexes={complexes}
              selectedTypes={selectedTypes}
              visibleCount={0}
              onShowAll={() => handleTabChange([...allCodes])}
            />
          </div>
          <button onClick={resetFilters} className="text-sm font-bold text-brand-navy hover:underline px-3 py-1.5">
            필터 초기화
          </button>
        </div>
      )}

      {/* 결과가 적을 때 매물유형 탭에 가려진 단지 안내 (기본 선택 = 아파트만, 세션 459) */}
      {!loading && !error && sortedFilteredComplexes.length > 0 && (
        <HiddenTypesHint
          complexes={complexes}
          selectedTypes={selectedTypes}
          visibleCount={sortedFilteredComplexes.length}
          onShowAll={() => handleTabChange([...allCodes])}
        />
      )}

      {/* 지도 뷰 — SearchClusterMap 은 next/dynamic(ssr:false) 완전 지연 로드(계획 §핵심결정4).
          비로그인/승인대기 사용자도 목록과 동일하게 진입 가능(목록도 이미 노출되는 데이터라 별도
          가드 불필요 — 계획 §핵심결정8). loading 중엔 이 블록 자체가 안 그려져(SkeletonPage 가
          대신 렌더) 빈 지도 깜빡임 없음 — placeholderData 유지 구간(필터 변경 중 isFetching)은
          loading=false 라 이전 마커가 자연스럽게 유지된다. */}
      {!loading && sortedFilteredComplexes.length > 0 && viewMode === "map" && (
        <div className="relative">
          <SearchClusterMap
            complexes={sortedFilteredComplexes}
            onSelect={setSelectedMapComplex}
            userLocation={userLocation}
            regionSelected={regionSelected}
            className="h-[70vh]"
          />
          {selectedMapComplex && (
            <div className="absolute left-2 right-2 bottom-2 sm:right-auto sm:max-w-md z-10">
              <ComplexCardMobile
                complex={selectedMapComplex}
                index={0}
                urlFilters={urlFilters}
                isCompared={isInCompare(selectedMapComplex.complex_no)}
                compareFull={compareFull}
                onToggleCompare={toggleCompare}
              />
            </div>
          )}
        </div>
      )}

      {/* 단지 테이블 (데스크톱)
          ⚠ viewMode 로 언마운트하지 않고 CSS(hidden=display:none)로만 숨긴다 — 목록 500행을
          React 가 해체하는 비용이 지도 탭 클릭 INP 의 진범이었다(세션 351 라이브 트레이스 실측:
          removeChild 자기시간 1,477ms + React 커밋 트리 순회 1,147ms). 마운트를 유지하면
          전환이 display 토글 한 번으로 끝난다. display:none 은 접근성 트리에서도 빠져
          스크린리더 중복 노출도 없다. */}
      {!loading && sortedFilteredComplexes.length > 0 && (
        <SearchResults
          complexes={sortedFilteredComplexes}
          listKey={listKey}
          hidden={viewMode === "map"}
          urlFilters={urlFilters}
          isInCompare={isInCompare}
          compareFull={compareFull}
          onToggleCompare={toggleCompare}
        />
      )}

      <CompareFloatingBar list={compareList} onRemove={removeCompare} onClear={clearCompare} />
    </div>
    </>
  );
}
