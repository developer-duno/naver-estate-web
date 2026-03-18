"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  getComplex,
  getArticles,
  getPyeongDetails,
  triggerComplexCrawl,
  startLiveCrawl,
  ApiError,
} from "@/lib/api";
import { createClient } from "@/lib/supabase";
import { PAGE_SIZE } from "@/lib/constants";
import { useCrawlProgress } from "@/hooks/useCrawlProgress";
import { useExport } from "@/hooks/useExport";
import type { Complex, Article, PyeongDetail, ArticleFilters, FilterOptions, SortBy } from "@/types";
import ComplexInfo from "@/components/ComplexInfo";
import FilterBar from "@/components/FilterBar";
import ArticleTable from "@/components/ArticleTable";
import ArticleDetail from "@/components/ArticleDetail";
import Pagination from "@/components/Pagination";

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
  const router = useRouter();
  const rawNo = params.no;
  const complexNo = Array.isArray(rawNo) ? rawNo[0] : rawNo ?? "";

  const [complex, setComplex] = useState<Complex | null>(null);
  const [articles, setArticles] = useState<Article[]>([]);
  const [pyeongDetails, setPyeongDetails] = useState<PyeongDetail[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [selectedArticleNos, setSelectedArticleNos] = useState<Set<string>>(new Set());
  const [filterOpen, setFilterOpen] = useState(true);
  const [selectedArticle, setSelectedArticle] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [filterError, setFilterError] = useState("");
  const [filterOptions, setFilterOptions] = useState<FilterOptions | undefined>(undefined);
  const [activeSortBy, setActiveSortBy] = useState("rank");
  const currentFiltersRef = useRef<ArticleFilters>({});
  const requestIdRef = useRef(0);
  const cancelledRef = useRef(false);

  const { exporting, exportError, clearExportError, handleExport: doExport } = useExport();

  const {
    crawling, crawlMessage, crawlProgress,
    setCrawling, setCrawlMessage,
    startCrawl, clearAllPolling,
  } = useCrawlProgress();

  const crawlCallbacks = useCallback(() => ({
    setArticles,
    setTotalCount,
    setCurrentPage,
    setComplex: (c: Complex) => setComplex(c),
    setPyeongDetails,
  }), []);

  // SEO: dynamic title
  useEffect(() => {
    if (complex) {
      document.title = `${complex.complex_name} - 아파트·오피스텔`;
    }
  }, [complex]);

  // Initial data load - 2-phase approach
  useEffect(() => {
    cancelledRef.current = false;

    async function load() {
      setLoading(true);
      try {
        // Phase 1: Load DB data immediately
        const [cpxResult, artResult, pyeongResult] = await Promise.allSettled([
          getComplex(complexNo),
          getArticles(complexNo, { page: 1, page_size: PAGE_SIZE }),
          getPyeongDetails(complexNo),
        ]);

        if (cancelledRef.current) return;

        if (cpxResult.status === "fulfilled") {
          setComplex(cpxResult.value);
          // filter_options는 complex 응답에 포함
          const opts = cpxResult.value.filter_options;
          if (opts) setFilterOptions(opts);
        }
        if (artResult.status === "fulfilled") {
          setArticles(artResult.value.articles);
          setTotalCount(artResult.value.total);
        }
        if (pyeongResult.status === "fulfilled") {
          setPyeongDetails(pyeongResult.value.pyeong_details);
        }
      } catch {
        if (!cancelledRef.current) setError("단지 정보를 불러올 수 없습니다.");
      } finally {
        if (!cancelledRef.current) setLoading(false);
      }

      // Phase 2 제거: 자동 크롤링 비활성화
      // → DB 데이터만 즉시 표시, 크롤링은 "데이터 갱신" 버튼으로만 실행
    }

    load();
    return () => {
      cancelledRef.current = true;
      clearAllPolling();
    };
  }, [complexNo, clearAllPolling]);

  // 매물 로드 (필터 + 페이지)
  const loadArticles = useCallback(
    async (filters: ArticleFilters, page: number) => {
      const thisRequestId = ++requestIdRef.current;
      setTableLoading(true);
      setFilterError("");
      try {
        const res = await getArticles(complexNo, { ...filters, page, page_size: PAGE_SIZE });
        if (thisRequestId !== requestIdRef.current) return;
        setArticles(res.articles);
        setTotalCount(res.total);
        setCurrentPage(page);
      } catch {
        if (thisRequestId !== requestIdRef.current) return;
        setFilterError("매물 조회에 실패했습니다. 다시 시도해주세요.");
      } finally {
        if (thisRequestId === requestIdRef.current) setTableLoading(false);
      }
    },
    [complexNo]
  );

  const handleSortChange = useCallback(
    (sortBy: string) => {
      setActiveSortBy(sortBy);
      setCurrentPage(1);
      setSelectedArticleNos(new Set());
      const filters = { ...currentFiltersRef.current, sort_by: sortBy === "rank" ? undefined : sortBy as SortBy };
      currentFiltersRef.current = filters;
      loadArticles(filters, 1);
    },
    [loadArticles]
  );

  const handleFilterChange = useCallback(
    (filters: ArticleFilters) => {
      currentFiltersRef.current = filters;
      setCurrentPage(1);
      setSelectedArticleNos(new Set());
      loadArticles(filters, 1);
    },
    [loadArticles]
  );

  const handlePageChange = (page: number) => {
    loadArticles(currentFiltersRef.current, page);
  };

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

  const handleExport = () => doExport(complexNo, selectedArticleNos, currentFiltersRef.current);

  const handleCrawl = async () => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      router.push(`/login?redirect=${encodeURIComponent(`/complex/${complexNo}`)}`);
      return;
    }
    setCrawling(true);
    setCrawlMessage("");
    try {
      await triggerComplexCrawl(complexNo, session.access_token);
      setCrawlMessage("데이터 갱신 중...");
      const crawlResult = await startLiveCrawl(complexNo);
      if (
        crawlResult.status === "started" ||
        crawlResult.status === "running" ||
        crawlResult.status === "already_running"
      ) {
        startCrawl(complexNo, crawlCallbacks());
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.statusCode === 409) {
          setCrawlMessage("이미 크롤링이 진행 중입니다.");
        } else if (err.statusCode === 403) {
          setCrawlMessage("크롤링 권한이 없습니다.");
        } else if (err.statusCode === 429) {
          setCrawlMessage("일일 크롤링 한도를 초과했습니다.");
        } else {
          setCrawlMessage("데이터 갱신에 실패했습니다.");
        }
      } else {
        setCrawlMessage("데이터 갱신에 실패했습니다.");
      }
      setCrawling(false);
    }
  };

  if (!complexNo || !/^\d+$/.test(complexNo)) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <p className="text-red-500 text-lg mb-4">유효하지 않은 단지 번호입니다.</p>
        <Link href="/" className="text-blue-600 hover:underline">홈으로 돌아가기</Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" role="status" aria-label="로딩 중" />
      </div>
    );
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
      <div className="flex items-center gap-4">
        <button onClick={() => {
            try {
              const referrer = document.referrer;
              const isSameOrigin = referrer && new URL(referrer).origin === window.location.origin;
              if (isSameOrigin) { router.back(); } else { router.push("/"); }
            } catch { router.push("/"); }
          }} aria-label="이전 페이지" className="text-gray-500 hover:text-gray-600 text-xl">
          ←
        </button>
        <h1 className="text-2xl font-bold">{complex.complex_name}</h1>
        {complex.last_crawled_at && (
          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
            마지막 크롤링: {formatTimeAgo(complex.last_crawled_at)}
          </span>
        )}
      </div>

      {/* 단지 정보 */}
      <ComplexInfo complex={complex} pyeongDetails={pyeongDetails} complexNo={complexNo} articleCount={totalCount} onFilterChange={handleFilterChange} />

      {/* 크롤링 진행률 배너 */}
      {crawling && crawlProgress && (
        crawlProgress.status === "started" ||
        crawlProgress.status === "running" ||
        crawlProgress.status === "already_running"
      ) && (
        <div className="bg-blue-50 border border-blue-200 text-blue-700 text-sm rounded-md px-4 py-3 flex items-center gap-3">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 flex-shrink-0" />
          <span>
            {crawlProgress.detail_phase === "running" ? (
              <>상세 정보 수집 중... {crawlProgress.detail_crawled_count ?? 0}/{crawlProgress.detail_total ?? 0}건</>
            ) : (
              <>
                매물 목록 수집 중...
                {(crawlProgress.current_page ?? 0) > 0 && ` ${crawlProgress.current_page}페이지`}
                {(crawlProgress.article_count ?? 0) > 0 && `, ${crawlProgress.article_count}건`}
              </>
            )}
          </span>
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
          <FilterBar onChange={handleFilterChange} filterOptions={filterOptions} sortBy={activeSortBy} onSortChange={handleSortChange} />
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-lg font-semibold">매물 {totalCount}건</span>
          {tableLoading && (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" role="status" aria-label="로딩 중" />
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCrawl}
            disabled={crawling}
            className="text-sm border border-blue-300 text-blue-600 rounded-md px-3 py-1.5 hover:bg-blue-50 transition-colors disabled:opacity-50"
          >
            {crawling ? "갱신 중..." : "데이터 갱신"}
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="text-sm border border-gray-300 rounded-md px-3 py-1.5 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {exporting
              ? "내보내는 중..."
              : selectedArticleNos.size > 0
                ? `선택 ${selectedArticleNos.size}건 내보내기`
                : "엑셀 내보내기"}
          </button>
        </div>
      </div>

      {/* 크롤 메시지 */}
      {crawlMessage && (
        <div className={`text-sm rounded-md px-4 py-2 ${
          crawlMessage.includes("실패") || crawlMessage.includes("로그인") || crawlMessage.includes("권한") || crawlMessage.includes("한도") || crawlMessage.includes("오류")
            ? "bg-red-50 text-red-600"
            : crawlMessage.includes("갱신 중")
              ? "bg-blue-50 text-blue-600"
              : "bg-green-50 text-green-600"
        }`}>
          {crawlMessage}
        </div>
      )}

      {/* 크롤링 중이고 매물이 아직 없을 때 안내 메세지 */}
      {crawling && totalCount === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-500">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
          <p className="text-sm">매물 데이터를 수집하고 있습니다. 잠시만 기다려 주세요.</p>
        </div>
      )}

      {/* 매물 테이블 */}
      {(!crawling || totalCount > 0) && (
        <ArticleTable articles={articles} onRowClick={setSelectedArticle} onSortChange={handleSortChange} activeSortBy={activeSortBy} selectedArticleNos={selectedArticleNos} onSelectionChange={handleSelectionChange} onSelectAll={handleSelectAll} />
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
        <ArticleDetail articleNo={selectedArticle} onClose={() => setSelectedArticle(null)} />
      )}
    </div>
  );
}


