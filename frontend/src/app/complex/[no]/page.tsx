"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  getComplex,
  getArticles,
  liveArticles,
  getPyeongDetails,
  exportArticles,
  triggerComplexCrawl,
  startLiveCrawl,
  getCrawlStatus,
  ApiError,
} from "@/lib/api";
import { createClient } from "@/lib/supabase";
import type { Complex, Article, PyeongDetail, ArticleFilters, CrawlProgress } from "@/types";
import ComplexInfo from "@/components/ComplexInfo";
import FilterBar from "@/components/FilterBar";
import ArticleTable from "@/components/ArticleTable";
import ArticleDetail from "@/components/ArticleDetail";

const PAGE_SIZE = 50;
const CRAWL_STATUS_POLL_MS = 2_000;
const ARTICLES_POLL_MS = 3_000;

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
  const [exporting, setExporting] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [filterError, setFilterError] = useState("");
  const [crawling, setCrawling] = useState(false);
  const [crawlMessage, setCrawlMessage] = useState("");
  const [crawlProgress, setCrawlProgress] = useState<CrawlProgress | null>(null);
  const currentFiltersRef = useRef<ArticleFilters>({});
  const requestIdRef = useRef(0);
  const cancelledRef = useRef(false);
  const statusPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const articlesPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearAllPolling = useCallback(() => {
    if (statusPollRef.current) { clearInterval(statusPollRef.current); statusPollRef.current = null; }
    if (articlesPollRef.current) { clearInterval(articlesPollRef.current); articlesPollRef.current = null; }
  }, []);

  // SEO: dynamic title
  useEffect(() => {
    if (complex) {
      document.title = `${complex.complex_name} - 아파트 매물`;
    }
  }, [complex]);

  // Phase 2: start crawl progress polling
  const startCrawlPolling = useCallback(() => {
    clearAllPolling();

    // Status polling (2s)
    statusPollRef.current = setInterval(async () => {
      if (cancelledRef.current) return;
      try {
        const status = await getCrawlStatus(complexNo);
        if (cancelledRef.current) return;
        setCrawlProgress(status);

        if (status.status === "done" || status.status === "error") {
          clearAllPolling();
          setCrawling(false);
          if (status.status === "done") {
            setCrawlMessage("");
            try {
              const res = await getArticles(complexNo, { page: 1, page_size: PAGE_SIZE });
              if (!cancelledRef.current) {
                setArticles(res.articles);
                setTotalCount(res.total);
                setCurrentPage(1);
              }
            } catch { /* ignore */ }
            try {
              const pyeong = await getPyeongDetails(complexNo);
              if (!cancelledRef.current) setPyeongDetails(pyeong.pyeong_details);
            } catch { /* ignore */ }
            try {
              const cpx = await getComplex(complexNo);
              if (!cancelledRef.current) setComplex(cpx);
            } catch { /* ignore */ }
          } else if (status.error) {
            setCrawlMessage(`크롤링 오류: ${status.error}`);
          }
        }
      } catch { /* polling failure ignored */ }
    }, CRAWL_STATUS_POLL_MS);

    // Articles refresh polling (3s)
    articlesPollRef.current = setInterval(async () => {
      if (cancelledRef.current) return;
      try {
        const res = await getArticles(complexNo, { page: 1, page_size: PAGE_SIZE });
        if (cancelledRef.current) return;
        setArticles(res.articles);
        setTotalCount(res.total);
      } catch { /* ignore */ }
    }, ARTICLES_POLL_MS);
  }, [complexNo, clearAllPolling]);

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

      // Phase 2: Start background crawl (with fallback to sync liveArticles)
      if (cancelledRef.current) return;
      try {
        const crawlResult = await startLiveCrawl(complexNo);
        if (cancelledRef.current) return;
        setCrawlProgress(crawlResult);

        if (crawlResult.status === "cached") {
          // Cache hit - fetch latest via liveArticles once
          try {
            const live = await liveArticles(complexNo);
            if (cancelledRef.current) return;
            setArticles(live.articles);
            setTotalCount(live.total);
            if (live.complex) setComplex(live.complex);
            try {
              const pyeong = await getPyeongDetails(complexNo);
              if (!cancelledRef.current) setPyeongDetails(pyeong.pyeong_details);
            } catch { /* ignore */ }
          } catch { /* ignore, DB data already shown */ }
        } else if (
          crawlResult.status === "started" ||
          crawlResult.status === "running" ||
          crawlResult.status === "already_running"
        ) {
          setCrawling(true);
          startCrawlPolling();
        }
      } catch {
        // Fallback: start-crawl endpoint not available, use sync liveArticles
        if (cancelledRef.current) return;
        setCrawling(true);
        setCrawlMessage("매물 데이터 수집 중...");
        try {
          const live = await liveArticles(complexNo);
          if (cancelledRef.current) return;
          setArticles(live.articles);
          setTotalCount(live.total);
          if (live.complex) setComplex(live.complex);
          try {
            const pyeong = await getPyeongDetails(complexNo);
            if (!cancelledRef.current) setPyeongDetails(pyeong.pyeong_details);
          } catch { /* ignore */ }
        } catch { /* ignore */ }
        finally {
          if (!cancelledRef.current) {
            setCrawling(false);
            setCrawlMessage("");
          }
        }
      }
    }

    load();
    return () => {
      cancelledRef.current = true;
      clearAllPolling();
    };
  }, [complexNo, startCrawlPolling, clearAllPolling]);

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

  const handleFilterChange = useCallback(
    (filters: ArticleFilters) => {
      currentFiltersRef.current = filters;
      setCurrentPage(1);
      loadArticles(filters, 1);
    },
    [loadArticles]
  );

  const handlePageChange = (page: number) => {
    loadArticles(currentFiltersRef.current, page);
  };

  const handleExport = async () => {
    if (exporting) return;
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setCrawlMessage("엑셀 내보내기는 로그인이 필요합니다.");
      return;
    }
    setExporting(true);
    try {
      await exportArticles(complexNo, currentFiltersRef.current, session.access_token);
    } catch {
      alert("엑셀 내보내기에 실패했습니다.");
    } finally {
      setExporting(false);
    }
  };

  const handleCrawl = async () => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setCrawlMessage("로그인이 필요합니다.");
      return;
    }
    setCrawling(true);
    setCrawlMessage("");
    try {
      await triggerComplexCrawl(complexNo, session.access_token);
      setCrawlMessage("데이터 갱신 중...");
      const crawlResult = await startLiveCrawl(complexNo);
      setCrawlProgress(crawlResult);
      if (
        crawlResult.status === "started" ||
        crawlResult.status === "running" ||
        crawlResult.status === "already_running"
      ) {
        startCrawlPolling();
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
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <p className="text-red-500 text-lg mb-4">{error || "단지를 찾을 수 없습니다."}</p>
        <div className="flex justify-center gap-4">
          <button
            onClick={() => window.location.reload()}
            className="text-blue-600 hover:underline"
          >
            다시 시도
          </button>
          <Link href="/" className="text-blue-600 hover:underline">홈으로 돌아가기</Link>
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
      <ComplexInfo complex={complex} pyeongDetails={pyeongDetails} complexNo={complexNo} />

      {/* 크롤링 진행률 배너 */}
      {crawling && crawlProgress && (
        crawlProgress.status === "started" ||
        crawlProgress.status === "running" ||
        crawlProgress.status === "already_running"
      ) && (
        <div className="bg-blue-50 border border-blue-200 text-blue-700 text-sm rounded-md px-4 py-3 flex items-center gap-3">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 flex-shrink-0" />
          <span>
            크롤링 중...
            {(crawlProgress.current_page ?? 0) > 0 && ` ${crawlProgress.current_page}페이지`}
            {(crawlProgress.article_count ?? 0) > 0 && `, ${crawlProgress.article_count}건 수집`}
          </span>
        </div>
      )}

      {/* 필터 바 */}
      <FilterBar onChange={handleFilterChange} />

      {/* 필터 에러 배너 */}
      {filterError && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-md px-4 py-2 flex justify-between items-center">
          <span>{filterError}</span>
          <button onClick={() => setFilterError("")} className="text-red-400 hover:text-red-600">×</button>
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
            {exporting ? "내보내는 중..." : "엑셀 내보내기"}
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

      {/* 매물 테이블 */}
      <ArticleTable articles={articles} onRowClick={setSelectedArticle} />

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

function Pagination({
  currentPage,
  totalPages,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  const pages: number[] = [];
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, currentPage + 2);
  for (let i = start; i <= end; i++) pages.push(i);

  return (
    <div className="flex justify-center items-center gap-1">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
        className="px-3 py-1.5 text-sm rounded border border-gray-300 disabled:opacity-30 hover:bg-gray-50"
      >
        이전
      </button>
      {start > 1 && (
        <>
          <button onClick={() => onPageChange(1)} className="px-3 py-1.5 text-sm rounded border border-gray-300 hover:bg-gray-50">1</button>
          {start > 2 && <span className="px-1 text-gray-500">...</span>}
        </>
      )}
      {pages.map((p) => (
        <button
          key={p}
          onClick={() => onPageChange(p)}
          className={`px-3 py-1.5 text-sm rounded border ${
            p === currentPage
              ? "bg-blue-600 text-white border-blue-600"
              : "border-gray-300 hover:bg-gray-50"
          }`}
        >
          {p}
        </button>
      ))}
      {end < totalPages && (
        <>
          {end < totalPages - 1 && <span className="px-1 text-gray-500">...</span>}
          <button onClick={() => onPageChange(totalPages)} className="px-3 py-1.5 text-sm rounded border border-gray-300 hover:bg-gray-50">{totalPages}</button>
        </>
      )}
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
        className="px-3 py-1.5 text-sm rounded border border-gray-300 disabled:opacity-30 hover:bg-gray-50"
      >
        다음
      </button>
    </div>
  );
}
