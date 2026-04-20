"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import {
  getComplex,
  getArticles,
  getPyeongDetails,
} from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { createClient } from "@/lib/supabase";
import { PAGE_SIZE, ESTATE_TYPE_COLORS, ESTATE_TYPE_DEFAULT_COLOR } from "@/lib/constants";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useSmartBack } from "@/hooks/useSmartBack";
import { useExport } from "@/hooks/useExport";
import { useFilterParams } from "@/hooks/useFilterParams";
import { useFavoriteStatus } from "@/hooks/useFavorites";
import { useCrawlAction } from "@/hooks/useCrawlAction";
import type { Article, ArticleFilters, FilterOptions } from "@/types";
import ComplexInfo from "@/components/ComplexInfo";
import FilterBar from "@/components/FilterBar";
import ArticleTable from "@/components/ArticleTable";
import ArticleCardMobile from "@/components/ArticleCardMobile";
import ArticleDetail from "@/components/ArticleDetail";
import Pagination from "@/components/Pagination";
import HintIcon from "@/components/HintIcon";
import CrawlProgressBanner from "@/components/CrawlProgressBanner";

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return "방금 전";
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

export default function ComplexDetailPage() {
  const params = useParams();
  const goBack = useSmartBack();
  const rawNo = params.no;
  const complexNo = Array.isArray(rawNo) ? rawNo[0] : rawNo ?? "";

  // 필터/정렬/페이지 — URL을 단일 소스로 사용
  const { filters, page: currentPage, sortBy: activeSortBy, setFilters, setPage, setSortBy } = useFilterParams();
  const { starred, toggle: toggleFavorite } = useFavoriteStatus(complexNo);
  const [selectedArticleNos, setSelectedArticleNos] = useState<Set<string>>(new Set());
  const [filterOpen, setFilterOpen] = useState(true);
  const [selectedArticle, setSelectedArticle] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [filterError, setFilterError] = useState("");
  const [sessionToken, setSessionToken] = useState<string | undefined>(undefined);
  const [tokenError, setTokenError] = useState(false);
  const [filterOptions, setFilterOptions] = useState<FilterOptions | undefined>(undefined);

  // 브라우저 뒤로/앞으로 시에만 FilterBar 리마운트 (사용자 필터 변경 시에는 유지)
  const [navKey, setNavKey] = useState(0);
  useEffect(() => {
    const handler = () => setNavKey(k => k + 1);
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  const { exporting, exportError, clearExportError, handleExport: doExport } = useExport();

  // ── useQuery: 단지 정보 ──
  const complexQuery = useQuery({
    queryKey: queryKeys.complex(complexNo),
    queryFn: () => getComplex(complexNo),
    enabled: !!complexNo && /^\d+$/.test(complexNo),
    staleTime: 60_000,
  });

  // filter_options 추출
  useEffect(() => {
    if (complexQuery.data?.filter_options) {
      setFilterOptions(complexQuery.data.filter_options); // eslint-disable-line react-hooks/set-state-in-effect -- 쿼리 데이터 동기화
    }
  }, [complexQuery.data]);

  // ── useQuery: 매물 목록 (필터/페이지/정렬 포함, 폴링 지원) ──
  const articlesQueryKey = queryKeys.articles(complexNo, {
    ...filters,
    page: currentPage,
    page_size: PAGE_SIZE,
  });

  const articlesQuery = useQuery({
    queryKey: articlesQueryKey,
    queryFn: () => getArticles(complexNo, {
      ...filters,
      page: currentPage,
      page_size: PAGE_SIZE,
    }),
    enabled: !!complexNo && /^\d+$/.test(complexNo),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  // ── useQuery: 면적별 상세 ──
  const pyeongQuery = useQuery({
    queryKey: queryKeys.pyeongDetails(complexNo),
    queryFn: () => getPyeongDetails(complexNo),
    enabled: !!complexNo && /^\d+$/.test(complexNo),
    staleTime: 60_000,
  });

  const complex = complexQuery.data ?? null;
  const articles = articlesQuery.data?.articles ?? [];
  const totalCount = articlesQuery.data?.total ?? 0;
  const pyeongDetails = pyeongQuery.data?.pyeong_details ?? [];
  // 분할 로딩: complex 정보만 있으면 페이지 표시 (articles/pyeong은 이후 로드)
  const loading = complexQuery.isLoading;
  const tableLoading = articlesQuery.isFetching && !articlesQuery.isLoading;

  // SEO: dynamic title
  useEffect(() => {
    if (complex) {
      document.title = `${complex.complex_name} - 아파트·오피스텔`;
    }
  }, [complex]);

  // 에러 처리
  useEffect(() => {
    if (complexQuery.isError) {
      setError("단지 정보를 불러올 수 없습니다."); // eslint-disable-line react-hooks/set-state-in-effect -- 에러 상태 동기화
    }
  }, [complexQuery.isError]);

  // sessionToken 추출 — ComplexInfo 의 "실거래가 수집" 버튼이 accessToken 필요.
  // 자동 크롤 로직은 useCrawlAction(auto) 로 이전됐고, 토큰은 별도로 뽑아둔다.
  useEffect(() => {
    (async () => {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) setSessionToken(session.access_token);
      } catch (err) {
        console.error("Failed to extract sessionToken:", err);
        setTokenError(true);
      }
    })();
  }, []);

  // 자동 크롤 통합 — 초기 3쿼리 성공 시 1회 자동 실행. 이후 폴링·문구·에러
  // 처리는 수동 버튼과 동일 경로 (useCrawlAction 내부).
  const {
    crawling,
    message: crawlMessage,
    messageType: crawlMessageType,
    progress: crawlProgress,
    clearMessage: clearCrawlMessage,
    handleCrawl,
  } = useCrawlAction(complexNo, {
    auto: true,
    autoEnabled:
      complexQuery.isSuccess && articlesQuery.isSuccess && pyeongQuery.isSuccess,
  });

  // 핸들러: 정렬 변경 → URL 업데이트 (page 리셋)
  const handleSortChange = useCallback(
    (newSortBy: string) => {
      setSortBy(newSortBy);
      setSelectedArticleNos(new Set());
    },
    [setSortBy]
  );

  // 핸들러: 필터 변경 → URL 업데이트 (page 리셋)
  const handleFilterChange = useCallback(
    (newFilters: ArticleFilters) => {
      setFilters(newFilters);
      setSelectedArticleNos(new Set());
      setFilterError("");
    },
    [setFilters]
  );

  const hasActiveFilters = Object.keys(filters).some(k => k !== "sort_by");
  const resetFilters = useCallback(() => {
    setFilters({});
    setSelectedArticleNos(new Set());
    setFilterError("");
  }, [setFilters]);

  // 핸들러: 페이지 변경 → URL 업데이트
  const handlePageChange = useCallback(
    (newPage: number) => {
      setPage(newPage);
    },
    [setPage]
  );

  const handleSelectionChange = (articleNo: string, checked: boolean) => {
    setSelectedArticleNos(prev => {
      const next = new Set(prev);
      if (checked) next.add(articleNo);
      else next.delete(articleNo);
      return next;
    });
  };

  const handleSelectAll = (checked: boolean, visibleArticles?: Article[]) => {
    if (checked) {
      const targets = visibleArticles ?? articles;
      setSelectedArticleNos(prev => {
        const next = new Set(prev);
        targets.forEach(a => next.add(a.article_no));
        return next;
      });
    } else {
      setSelectedArticleNos(new Set());
    }
  };

  const handleExport = () => doExport(complexNo, selectedArticleNos, filters);

  if (!complexNo || !/^\d+$/.test(complexNo)) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <p className="text-red-500 text-lg mb-4">유효하지 않은 단지 번호입니다.</p>
        <Link href="/" className="text-blue-600 hover:underline">홈으로 돌아가기</Link>
      </div>
    );
  }

  if (loading) {
    return <LoadingSpinner />;
  }

  if (error || !complex) {
    const is404 = error?.includes("404") || error?.includes("찾을 수 없");
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <h2 className="text-xl font-bold mb-2">{is404 ? "단지를 찾을 수 없습니다" : "오류가 발생했습니다"}</h2>
        <p className="text-gray-500 text-sm mb-6">{is404 ? "단지번호가 올바른지 확인해주세요." : error}</p>
        <div className="flex justify-center gap-4">
          {!is404 && (
            <button
              onClick={() => window.location.reload()}
              className="text-sm border border-gray-300 rounded-md px-4 py-2 text-gray-600 hover:bg-gray-50"
            >
              다시 시도
            </button>
          )}
          <Link href="/" className="text-sm bg-blue-600 text-white rounded-md px-4 py-2 hover:bg-blue-700">홈으로 돌아가기</Link>
          <Link href="/search" className="text-sm border border-blue-300 text-blue-600 rounded-md px-4 py-2 hover:bg-blue-50">단지 검색</Link>
        </div>
      </div>
    );
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">
      {/* 헤더 */}
      <div className="flex items-center gap-2 md:gap-4 flex-wrap">
        <button onClick={goBack} aria-label="이전 페이지" className="text-gray-500 hover:text-gray-600 text-xl">
          ←
        </button>
        <h1 className="text-lg md:text-2xl font-bold truncate">{complex.complex_name}</h1>
        <button
          onClick={() => toggleFavorite(complex.complex_name, complex.cortar_address)}
          className={`text-xl transition-colors ${starred ? "text-yellow-500" : "text-gray-300 hover:text-yellow-400"}`}
          aria-label={starred ? "즐겨찾기 해제" : "즐겨찾기 추가"}
          title={starred ? "즐겨찾기 해제" : "즐겨찾기 추가"}
        >
          {starred ? "\u2605" : "\u2606"}
        </button>
        {complex.real_estate_type_name && (
          <span className={`text-xs px-1.5 py-0.5 rounded border ${ESTATE_TYPE_COLORS[complex.real_estate_type_name] ?? ESTATE_TYPE_DEFAULT_COLOR}`}>
            {complex.real_estate_type_name}
          </span>
        )}
        {complex.last_crawled_at && (
          <span className="hidden sm:inline-flex text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
            마지막 크롤링: {formatTimeAgo(complex.last_crawled_at)}
          </span>
        )}
      </div>

      {/* 단지 정보 */}
      <ComplexInfo complex={complex} pyeongDetails={pyeongDetails} complexNo={complexNo} onFilterChange={handleFilterChange} accessToken={sessionToken} />

      {/* 로그인 세션 경고 */}
      {tokenError && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-md px-3 py-2 flex justify-between items-center gap-2">
          <span>로그인 세션을 확인할 수 없어 일부 기능(실거래가 수집)이 제한됩니다. 새로고침하거나 다시 로그인해 주세요.</span>
          <button
            onClick={() => setTokenError(false)}
            aria-label="닫기"
            className="text-amber-600 hover:text-amber-900 flex-shrink-0"
          >×</button>
        </div>
      )}

      {/* 필터 바 */}
      <div>
        <button
          onClick={() => setFilterOpen(v => !v)}
          className="text-sm text-blue-600 hover:text-blue-800 mb-1 flex items-center gap-1 md:hidden"
        >
          {filterOpen ? "▲ 필터 접기" : "▼ 필터 펼치기"}
        </button>
        <div className={filterOpen ? "" : "hidden md:block"}>
          <FilterBar key={navKey} onChange={handleFilterChange} filterOptions={filterOptions} sortBy={activeSortBy} onSortChange={handleSortChange} initialFilters={filters} />
        </div>
      </div>

      {/* 필터 에러 배너 */}
      {filterError && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-md px-4 py-2 flex justify-between items-center">
          <span>{filterError}</span>
          <button onClick={() => setFilterError("")} className="text-red-400 hover:text-red-600">×</button>
        </div>
      )}

      {/* 엑셀 내보내기 에러 배너 */}
      {exportError && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-md px-4 py-2 flex justify-between items-center">
          <span>{exportError}</span>
          <button onClick={() => clearExportError()} className="text-red-400 hover:text-red-600">×</button>
        </div>
      )}

      {/* 매물 수 + 엑셀 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 md:gap-3">
          <span className="text-base md:text-lg font-semibold">매물 {totalCount}건</span>
          {tableLoading && (
            <div className="flex items-center gap-1.5" role="status" aria-label="매물 갱신 중">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
              <span className="text-xs text-blue-600">갱신 중</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 md:gap-2">
          <button
            onClick={handleCrawl}
            disabled={crawling}
            className="text-xs md:text-sm border border-blue-300 text-blue-600 rounded-md px-2.5 md:px-3 py-1.5 hover:bg-blue-50 transition-colors disabled:opacity-50"
          >
            {crawling ? "갱신 중..." : "데이터 갱신"}
          </button>
          <HintIcon text="네이버에서 최신 매물을 다시 가져옵니다 (30초~2분)" />
          <button
            onClick={handleExport}
            disabled={exporting}
            className="text-xs md:text-sm border border-gray-300 rounded-md px-2.5 md:px-3 py-1.5 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {exporting
              ? "내보내는 중..."
              : selectedArticleNos.size > 0
                ? `선택 ${selectedArticleNos.size}건 내보내기`
                : "엑셀 내보내기"}
          </button>
        </div>
      </div>

      {/* 크롤 메시지: 진행 중(info+crawling)이면 상세 배너, 완료/에러/쿨다운은 기존 1줄 */}
      {crawling && crawlMessageType === "info" ? (
        <CrawlProgressBanner
          progress={crawlProgress}
          crawling={crawling}
          fallbackMessage={crawlMessage || undefined}
        />
      ) : (
        crawlMessage && (
          <div className={`text-sm rounded-md px-4 py-2 flex justify-between items-center gap-3 ${
            crawlMessageType === "error"
              ? "bg-red-50 text-red-600"
              : crawlMessageType === "info"
                ? "bg-blue-50 text-blue-600"
                : "bg-green-50 text-green-600"
          }`}>
            <span>{crawlMessage}</span>
            {crawlMessageType === "error" && (
              <button
                type="button"
                onClick={clearCrawlMessage}
                aria-label="닫기"
                className="text-red-400 hover:text-red-600 flex-shrink-0"
              >
                ×
              </button>
            )}
          </div>
        )
      )}

      {/* 매물 API 실패 배너 */}
      {articlesQuery.isError && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-md px-4 py-2 flex justify-between items-center gap-3">
          <span>매물 목록을 불러올 수 없습니다.</span>
          <button
            onClick={() => articlesQuery.refetch()}
            className="text-xs border border-red-300 rounded px-2 py-1 hover:bg-red-100 flex-shrink-0"
          >다시 시도</button>
        </div>
      )}

      {/* 매물 테이블 (데스크톱) / 카드뷰 (모바일) — isFetching 중엔 반투명 처리 */}
      {!articlesQuery.isLoading && !articlesQuery.isError && (
        <div className={`transition-opacity duration-200 ${tableLoading ? "opacity-50" : "opacity-100"}`}>
          <div className="hidden md:block">
            <ArticleTable articles={articles} onRowClick={setSelectedArticle} onSortChange={handleSortChange} selectedArticleNos={selectedArticleNos} onSelectionChange={handleSelectionChange} onSelectAll={handleSelectAll} hasActiveFilters={hasActiveFilters} onResetFilters={resetFilters} />
          </div>
          <div className="md:hidden">
            <ArticleCardMobile articles={articles} onRowClick={setSelectedArticle} selectedArticleNos={selectedArticleNos} onSelectionChange={handleSelectionChange} onSelectAll={handleSelectAll} hasActiveFilters={hasActiveFilters} onResetFilters={resetFilters} />
          </div>
        </div>
      )}

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={handlePageChange}
        />
      )}

      {/* 매물 상세 모달 */}
      {selectedArticle && (
        <ArticleDetail articleNo={selectedArticle} onClose={() => setSelectedArticle(null)} complex={complexQuery.data} />
      )}
    </div>
  );
}
