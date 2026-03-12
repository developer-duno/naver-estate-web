"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getComplex, getArticles, getPyeongDetails, exportArticles, triggerComplexCrawl } from "@/lib/api";
import { createClient } from "@/lib/supabase";
import type { Complex, Article, PyeongDetail, ArticleFilters } from "@/types";
import ComplexInfo from "@/components/ComplexInfo";
import FilterBar from "@/components/FilterBar";
import ArticleTable from "@/components/ArticleTable";
import ArticleDetail from "@/components/ArticleDetail";

const PAGE_SIZE = 50;

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
  const currentFiltersRef = useRef<ArticleFilters>({});

  // SEO: 동적 타이틀
  useEffect(() => {
    if (complex) {
      document.title = `${complex.complex_name} - 아파트 매물`;
    }
  }, [complex]);

  // 초기 데이터 로드
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [cpx, artRes, pyeong] = await Promise.all([
          getComplex(complexNo),
          getArticles(complexNo, { page: 1, page_size: PAGE_SIZE }),
          getPyeongDetails(complexNo),
        ]);
        setComplex(cpx);
        setArticles(artRes.articles);
        setTotalCount(artRes.total);
        setPyeongDetails(pyeong.pyeong_details);
      } catch {
        setError("단지 정보를 불러올 수 없습니다.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [complexNo]);

  // 매물 로드 (필터 + 페이지)
  const loadArticles = useCallback(
    async (filters: ArticleFilters, page: number) => {
      setTableLoading(true);
      setFilterError("");
      try {
        const res = await getArticles(complexNo, { ...filters, page, page_size: PAGE_SIZE });
        setArticles(res.articles);
        setTotalCount(res.total);
        setCurrentPage(page);
      } catch {
        setFilterError("매물 조회에 실패했습니다. 다시 시도해주세요.");
      } finally {
        setTableLoading(false);
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
    setExporting(true);
    try {
      await exportArticles(complexNo, currentFiltersRef.current);
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
      setCrawlMessage("데이터 갱신이 시작되었습니다. 잠시 후 새로고침 해주세요.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("409")) {
        setCrawlMessage("이미 크롤링이 진행 중입니다. 잠시 후 다시 시도해주세요.");
      } else {
        setCrawlMessage("데이터 갱신에 실패했습니다.");
      }
    } finally {
      setCrawling(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (error || !complex) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <p className="text-red-500 text-lg mb-4">{error || "단지를 찾을 수 없습니다."}</p>
        <Link href="/" className="text-blue-600 hover:underline">홈으로 돌아가기</Link>
      </div>
    );
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">
      {/* 헤더 */}
      <div className="flex items-center gap-4">
        <button onClick={() => window.history.length > 1 ? router.back() : router.push("/")} aria-label="이전 페이지" className="text-gray-400 hover:text-gray-600 text-xl">
          ←
        </button>
        <h1 className="text-2xl font-bold">{complex.complex_name}</h1>
        {complex.last_crawled_at && (
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
            마지막 크롤링: {formatTimeAgo(complex.last_crawled_at)}
          </span>
        )}
      </div>

      {/* 단지 정보 */}
      <ComplexInfo complex={complex} pyeongDetails={pyeongDetails} />

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
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
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
          crawlMessage.includes("실패") || crawlMessage.includes("로그인")
            ? "bg-red-50 text-red-600"
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
          {start > 2 && <span className="px-1 text-gray-400">...</span>}
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
          {end < totalPages - 1 && <span className="px-1 text-gray-400">...</span>}
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
