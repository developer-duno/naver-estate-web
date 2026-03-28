"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  useQuery,
  useMutation,
  keepPreviousData,
} from "@tanstack/react-query";
import {
  getComplex,
  getArticles,
  getPyeongDetails,
  triggerComplexCrawl,
  startLiveCrawl,
  ApiError,
} from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { createClient } from "@/lib/supabase";
import { PAGE_SIZE, ESTATE_TYPE_COLORS, ESTATE_TYPE_DEFAULT_COLOR } from "@/lib/constants";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useSmartBack } from "@/hooks/useSmartBack";
import { useCrawlProgress } from "@/hooks/useCrawlProgress";
import { useExport } from "@/hooks/useExport";
import { useFilterParams } from "@/hooks/useFilterParams";
import { useFavoriteStatus } from "@/hooks/useFavorites";
import type { Article, ArticleFilters, FilterOptions, CrawlProgress } from "@/types";
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

type StepState = "done" | "active" | "pending";
interface CrawlStep { label: string; state: StepState }

function calcCrawlProgress(p: CrawlProgress): { percent: number; steps: CrawlStep[] } {
  const phase = p.phase ?? (p.detail_phase === "running" ? "details" : "articles");
  const articleLabel = `매물 목록 수집${(p.article_count ?? 0) > 0 ? ` (${p.article_count}건)` : ""}`;
  const detailTotal = p.detail_total ?? 0;
  const detailDone = p.detail_crawled_count ?? 0;
  const detailLabel = detailTotal > 0 ? `매물 상세 수집 (${detailDone}/${detailTotal}건)` : "매물 상세 수집";

  if (phase === "articles") {
    const pct = p.has_more !== false ? Math.min((p.current_page ?? 0) * 10, 30) : 33;
    return {
      percent: pct,
      steps: [
        { label: articleLabel, state: "active" },
        { label: "단지정보 보강", state: "pending" },
        { label: detailLabel, state: "pending" },
      ],
    };
  }
  if (phase === "enriching") {
    return {
      percent: 40,
      steps: [
        { label: articleLabel, state: "done" },
        { label: "단지정보 보강 중...", state: "active" },
        { label: detailLabel, state: "pending" },
      ],
    };
  }
  // details
  const detailPct = detailTotal > 0 ? 50 + Math.round((detailDone / detailTotal) * 50) : 50;
  return {
    percent: detailPct,
    steps: [
      { label: articleLabel, state: "done" },
      { label: "단지정보 보강", state: "done" },
      { label: detailLabel, state: "active" },
    ],
  };
}

export default function ComplexDetailPage() {
  const params = useParams();
  const router = useRouter();
  const goBack = useSmartBack();
  const rawNo = params.no;
  const complexNo = Array.isArray(rawNo) ? rawNo[0] : rawNo ?? "";

  // 필터/정렬/페이지 — URL을 단일 소스로 사용
  const { filters, page: currentPage, sortBy: activeSortBy, setFilters, setPage, setSortBy, filterKey } = useFilterParams();
  const { starred, toggle: toggleFavorite } = useFavoriteStatus(complexNo);
  const [selectedArticleNos, setSelectedArticleNos] = useState<Set<string>>(new Set());
  const [filterOpen, setFilterOpen] = useState(true);
  const [selectedArticle, setSelectedArticle] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [filterError, setFilterError] = useState("");
  const [sessionToken, setSessionToken] = useState<string | undefined>(undefined);
  const [filterOptions, setFilterOptions] = useState<FilterOptions | undefined>(undefined);

  // 브라우저 뒤로/앞으로 시에만 FilterBar 리마운트 (사용자 필터 변경 시에는 유지)
  const [navKey, setNavKey] = useState(0);
  useEffect(() => {
    const handler = () => setNavKey(k => k + 1);
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  const { exporting, exportError, clearExportError, handleExport: doExport } = useExport();

  const {
    crawling, crawlMessage, crawlProgress,
    setCrawling, setCrawlMessage,
    startCrawl, clearAllPolling,
  } = useCrawlProgress();
  const [crawlMessageType, setCrawlMessageType] = useState<"info" | "error" | "success">("info");

  // setCrawlMessage + type을 함께 설정하는 헬퍼
  const setCrawlMsg = useCallback((text: string, type: "info" | "error" | "success" = "info") => {
    setCrawlMessage(text);
    setCrawlMessageType(type);
  }, [setCrawlMessage]);

  // useCrawlProgress 훅 내부에서 직접 setCrawlMessage를 호출하는 경우 타입 동기화
  useEffect(() => {
    if (!crawlMessage) return;
    if (crawlMessage.startsWith("크롤링 오류")) setCrawlMessageType("error");
    else if (crawlMessage === "") setCrawlMessageType("info");
  }, [crawlMessage]);

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
      setFilterOptions(complexQuery.data.filter_options);
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
      setError("단지 정보를 불러올 수 없습니다.");
    }
  }, [complexQuery.isError]);

  // Phase 2: 자동 크롤링 (초기 로드 성공 후)
  const autoCrawlTriggeredRef = useRef(false);
  useEffect(() => {
    if (autoCrawlTriggeredRef.current) return;
    if (!complexQuery.isSuccess || !articlesQuery.isSuccess || !pyeongQuery.isSuccess) return;
    autoCrawlTriggeredRef.current = true;

    (async () => {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          setSessionToken(session.access_token);
          const crawlResult = await startLiveCrawl(complexNo, session.access_token);
          if (crawlResult.status === "started") {
            startCrawl(complexNo);
          }
        }
      } catch (err) {
        if (err instanceof ApiError && err.statusCode === 403) {
          setCrawlMsg(err.message || "관리자 승인이 필요합니다", "error");
        }
      }
    })();
  }, [complexNo, complexQuery.isSuccess, articlesQuery.isSuccess, pyeongQuery.isSuccess, startCrawl, setCrawlMessage]);

  // 언마운트 시 폴링 정리
  useEffect(() => {
    return () => { clearAllPolling(); };
  }, [clearAllPolling]);

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

  // 수동 크롤링 (데이터 갱신 버튼) — useMutation
  const crawlMutation = useMutation({
    mutationFn: async () => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new ApiError("로그인이 필요합니다", 401);
      }
      await triggerComplexCrawl(complexNo, session.access_token);
      const crawlResult = await startLiveCrawl(complexNo, session.access_token);
      return crawlResult;
    },
    onMutate: () => {
      setCrawling(true);
      setCrawlMsg("");
    },
    onSuccess: (crawlResult: { status: string }) => {
      setCrawlMsg("데이터 갱신 중...", "info");
      if (
        crawlResult.status === "started" ||
        crawlResult.status === "running" ||
        crawlResult.status === "already_running"
      ) {
        startCrawl(complexNo);
      }
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError) {
        if (err.statusCode === 401) {
          router.push(`/login?redirect=${encodeURIComponent(`/complex/${complexNo}`)}`);
          setCrawling(false);
          return;
        }
        if (err.statusCode === 409) {
          setCrawlMsg("이미 크롤링이 진행 중입니다.", "info");
        } else if (err.statusCode === 403) {
          setCrawlMsg("크롤링 권한이 없습니다.", "error");
        } else if (err.statusCode === 429) {
          setCrawlMsg("일일 크롤링 한도를 초과했습니다.", "error");
        } else {
          setCrawlMsg("데이터 갱신에 실패했습니다.", "error");
        }
      } else {
        setCrawlMsg("데이터 갱신에 실패했습니다.", "error");
      }
      setCrawling(false);
    },
  });

  const handleCrawl = () => {
    crawlMutation.mutate();
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
      <div className="flex items-center gap-4">
        <button onClick={goBack} aria-label="이전 페이지" className="text-gray-500 hover:text-gray-600 text-xl">
          ←
        </button>
        <h1 className="text-2xl font-bold">{complex.complex_name}</h1>
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
          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
            마지막 크롤링: {formatTimeAgo(complex.last_crawled_at)}
          </span>
        )}
      </div>

      {/* 단지 정보 */}
      <ComplexInfo complex={complex} pyeongDetails={pyeongDetails} complexNo={complexNo} articleCount={totalCount} onFilterChange={handleFilterChange} accessToken={sessionToken} />

      {/* 크롤링 진행률 배너 */}
      {crawling && crawlProgress && (
        crawlProgress.status === "started" ||
        crawlProgress.status === "running" ||
        crawlProgress.status === "already_running"
      ) && (() => {
        const { percent, steps } = calcCrawlProgress(crawlProgress);
        return (
          <div className="bg-blue-50 border border-blue-200 text-blue-700 text-sm rounded-md px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium">데이터 수집 중</span>
              <span className="text-xs text-blue-500">{percent}%</span>
            </div>
            <div className="w-full bg-blue-100 rounded-full h-2 mb-3">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                style={{ width: `${percent}%` }}
              />
            </div>
            <div className="space-y-1">
              {steps.map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="w-4 text-center shrink-0">
                    {s.state === "done" ? "✅" : s.state === "active" ? "🔄" : "⏳"}
                  </span>
                  <span className={s.state === "active" ? "font-medium" : s.state === "pending" ? "text-blue-400" : "text-blue-500"}>
                    {s.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

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
          crawlMessageType === "error"
            ? "bg-red-50 text-red-600"
            : crawlMessageType === "info"
              ? "bg-blue-50 text-blue-600"
              : "bg-green-50 text-green-600"
        }`}>
          {crawlMessage}
        </div>
      )}

      {/* 크롤링 중 + 이전 데이터 안내 */}
      {crawling && totalCount > 0 && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 text-xs rounded-md px-3 py-2">
          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-amber-500 shrink-0" />
          <span>이전 데이터를 표시 중입니다. 갱신이 완료되면 자동으로 업데이트됩니다.</span>
        </div>
      )}

      {/* 크롤링 중이고 매물이 아직 없을 때 안내 메세지 */}
      {crawling && totalCount === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-500">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
          <p className="text-sm">매물 데이터를 수집하고 있습니다. 잠시만 기다려 주세요.</p>
        </div>
      )}

      {/* 매물 테이블 — 크롤링 중에도 기존 데이터 항상 표시 */}
      {totalCount > 0 && (
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
