"use client";

/**
 * 단지 화면의 클라이언트 부분(세션 483 PR 3b — 옛 page.tsx 본문 그대로 옮김).
 * 서버 껍데기(page.tsx)가 빵부스러기·h1·'한눈에 보기'·같은 동 단지를 먼저 그리고, 이 컴포넌트가 그 아래
 * 로그인 분기(소비자 화면 / 승인 중개사 작업 화면)를 그린다. h1 은 서버 것 하나뿐 — 여기 머리는 일반 글자.
 */
import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import {
  getComplex,
  getArticles,
  getPyeongDetails,
} from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { useSmartBack } from "@/hooks/useSmartBack";
import { useExport } from "@/hooks/useExport";
import { useFilterParams } from "@/hooks/useFilterParams";
import { useFavoriteStatus } from "@/hooks/useFavorites";
import { useCompare } from "@/hooks/useCompare";
import { useCrawlAction } from "@/hooks/useCrawlAction";
import type { Article, ArticleFilters, FilterOptions } from "@/types";
import FilterBar from "@/components/FilterBar";
import FilterBarMobileSheet from "@/components/FilterBarMobileSheet";
import FilterChipsSummary from "@/components/filter/FilterChipsSummary";
import ArticleTable from "@/components/ArticleTable";
import ArticleCardMobile from "@/components/ArticleCardMobile";
import ArticleViewToggle from "@/components/ArticleViewToggle";
import ArticlePageSizeSelect from "@/components/ArticlePageSizeSelect";
import ArticleDetail from "@/components/ArticleDetail";
import type { ArticlePageSize } from "@/lib/storage";
import { useArticleViewPreferences } from "@/hooks/useArticleViewPreferences";
import { usePopstateRefresh } from "@/hooks/usePopstateRefresh";
import { useSessionToken } from "@/hooks/useSessionToken";
import { useApprovedBrokerStatus } from "@/hooks/useIsApprovedBroker";
import Pagination from "@/components/Pagination";
import HintIcon from "@/components/HintIcon";
import ComplexHeader from "@/components/complex/ComplexHeader";
import CompareFloatingBar from "@/components/CompareFloatingBar";
import ComplexLoadState from "@/components/complex/ComplexLoadState";
import CrawlMessage from "@/components/complex/CrawlMessage";
import ComplexDashboard from "@/components/complex/ComplexDashboard";
import ConsumerComplexView from "@/components/complex/consumer/ConsumerComplexView";
import PrintButton from "@/components/complex/PrintButton";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import LockedDataCard, { isAuthGateError, lockReasonOf } from "@/components/ui/locked-data-card";
import type { ClientSeed } from "@/types/public-summary";

interface Props {
  complexNo: string;
  /** 서버가 받은 공개 요약 중 화면에 쓰는 칸 — 소비자 화면의 한 줄 링크·initialData·기준월 재료(없으면 기존 동작) */
  seed?: ClientSeed | null;
  /** 서버가 그린 '한눈에 보기' — 소비자 화면 맨 위, 중개사 화면은 접힘(기본 닫힘) */
  glance?: ReactNode;
}

export default function ComplexClientView({ complexNo, seed = null, glance = null }: Props) {
  const goBack = useSmartBack();

  // 필터/정렬/페이지 — URL을 단일 소스로 사용
  const { filters, page: currentPage, sortBy: activeSortBy, setFilters, setPage, setSortBy } = useFilterParams();
  const { starred, toggle: toggleFavorite } = useFavoriteStatus(complexNo);
  const compare = useCompare();
  const [selectedArticleNos, setSelectedArticleNos] = useState<Set<string>>(new Set());
  const [filterOpen, setFilterOpen] = useState(true);
  const [selectedArticle, setSelectedArticle] = useState<string | null>(null);
  const [error, setError] = useState("");
  const { sessionToken, tokenError, tokenReady, dismissTokenError } = useSessionToken();
  // 자동 새로 받기(네이버 호출)는 승인 중개사만 — 비로그인·미승인은 화면을 봐도 자동 호출 0(세션 481)
  // 화면 고르기(세션 482 PR 1b): 승인 중개사 = 작업 화면 · 비로그인·일반 회원 = 소비자 화면. 판정이 끝날 때까지는 로딩
  const { approved: isApprovedBroker, pending: brokerPending } = useApprovedBrokerStatus(sessionToken);
  // 비로그인 확정(세션 해석 끝 + 토큰 없음) — 네이버 매물·평형·호가·추이는 요청하지 않고 잠금 카드만(세션 481 보완 F4)
  const loggedOut = tokenReady && !sessionToken;
  const [filterOptions, setFilterOptions] = useState<FilterOptions | undefined>(undefined);
  const { articleViewMode, pageSize, setPageSize, handleViewModeChange } = useArticleViewPreferences();

  // 인쇄 대상 ref — 페이지 본문 전체 (헤더 + 시세 + 매물 + 정보)
  const printRef = useRef<HTMLDivElement>(null);

  // 브라우저 뒤로/앞으로 시에만 FilterBar 리마운트
  const { navKey } = usePopstateRefresh();

  const { exporting, exportError, clearExportError, handleExport: doExport } = useExport();

  const complexQuery = useQuery({
    queryKey: queryKeys.complex(complexNo),
    queryFn: () => getComplex(complexNo),
    enabled: !!complexNo && /^\d+$/.test(complexNo),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (complexQuery.data?.filter_options) {
      setFilterOptions(complexQuery.data.filter_options); // eslint-disable-line react-hooks/set-state-in-effect -- 쿼리 데이터 동기화
    }
  }, [complexQuery.data]);

  const articlesQueryKey = queryKeys.articles(complexNo, {
    ...filters,
    page: currentPage,
    page_size: pageSize,
  });

  const articlesQuery = useQuery({
    queryKey: articlesQueryKey,
    queryFn: () => getArticles(complexNo, {
      ...filters,
      page: currentPage,
      page_size: pageSize,
    }, sessionToken),
    // tokenReady 가드: 토큰 해석 완료 후 실행 — 토큰 도착 전 undefined 로 먼저 쏴서
    // 403→queryKey 불변 refetch 안 됨(승인 중개사 잠금 오인) 차단 (B2 게이트)
    // 비로그인이면 아예 안 부른다(401 요청 0 — 세션 481 보완 F4)
    enabled: !!complexNo && /^\d+$/.test(complexNo) && tokenReady && !!sessionToken,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  // 평형 정보는 중개사 대시보드만 쓴다 — 일반 회원 소비자 화면에선 부르지 않는다(세션 482 PR 1b 보완 F3)
  const pyeongQuery = useQuery({
    queryKey: queryKeys.pyeongDetails(complexNo),
    queryFn: () => getPyeongDetails(complexNo, sessionToken),
    enabled: !!complexNo && /^\d+$/.test(complexNo) && tokenReady && !!sessionToken && isApprovedBroker,
    staleTime: 60_000,
  });

  const complex = complexQuery.data ?? null;
  const articles = articlesQuery.data?.articles ?? [];
  const totalCount = articlesQuery.data?.total ?? 0;
  const pyeongDetails = pyeongQuery.data?.pyeong_details ?? [];
  const loading = complexQuery.isLoading;
  const tableLoading = articlesQuery.isFetching && !articlesQuery.isLoading;

  // 제목은 서버 generateMetadata 가 정한다 — 브라우저에서 document.title 을 덮어쓰지 않는다(세션 483 PR 3b)

  useEffect(() => {
    if (complexQuery.isError) {
      setError("단지 정보를 불러올 수 없습니다."); // eslint-disable-line react-hooks/set-state-in-effect -- 에러 상태 동기화
    }
  }, [complexQuery.isError]);

  const {
    crawling,
    message: crawlMessage,
    messageType: crawlMessageType,
    progress: crawlProgress,
    staleLabel: crawlStaleLabel,
    pendingRefresh,
    applyPendingRefresh,
    clearMessage: clearCrawlMessage,
    handleCrawl,
  } = useCrawlAction(complexNo, {
    auto: isApprovedBroker,
    autoEnabled:
      isApprovedBroker && complexQuery.isSuccess && articlesQuery.isSuccess && pyeongQuery.isSuccess,
    // 새 자료 크롤이 끝나면 지금 표와 같은 조건으로 따로 받아 비교한다 (세션 447)
    table: {
      queryKey: articlesQueryKey,
      fetch: () => getArticles(complexNo, { ...filters, page: currentPage, page_size: pageSize }, sessionToken),
    },
  });
  // 낡은 자료를 받는 동안엔 표를 흐리게 (세션 447)
  const tableDimmed = tableLoading || (crawling && !!crawlStaleLabel);

  const handleSortChange = useCallback(
    (newSortBy: string) => {
      setSortBy(newSortBy);
      setSelectedArticleNos(new Set());
    },
    [setSortBy]
  );

  const handleFilterChange = useCallback(
    (newFilters: ArticleFilters) => {
      setFilters(newFilters);
      setSelectedArticleNos(new Set());
    },
    [setFilters]
  );

  const hasActiveFilters = Object.keys(filters).some(k => k !== "sort_by");
  const resetFilters = useCallback(() => {
    setFilters({});
    setSelectedArticleNos(new Set());
  }, [setFilters]);

  const handlePageChange = useCallback(
    (newPage: number) => {
      setPage(newPage);
      // 새 페이지 첫 매물이 보이게 목록 상단 복귀 — smooth 는 직후 리렌더에 취소될 수 있어 auto
      document.getElementById("section-articles")?.scrollIntoView({ behavior: "auto", block: "start" });
    },
    [setPage]
  );

  const handlePageSizeChange = useCallback(
    (newSize: ArticlePageSize) => {
      const firstItemIndex = (currentPage - 1) * pageSize;
      const maxPage = Math.max(1, Math.ceil(totalCount / newSize));
      const newPage = Math.min(Math.floor(firstItemIndex / newSize) + 1, maxPage);
      setPageSize(newSize);
      setPage(newPage);
    },
    [currentPage, pageSize, totalCount, setPage, setPageSize]
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
    return <ComplexLoadState kind="invalid" />;
  }

  // 판정 전(세션 해석 중 · 승인 여부 묻는 중)은 로딩 — 중개사에게 소비자 화면이 잠깐 비치지 않게(세션 482 PR 1b)
  // 서버가 그린 '한눈에 보기'는 판정 전에도 그대로 보인다(첫 HTML = 소비자 화면과 같은 자리)
  if (loading || !tokenReady || brokerPending) {
    return (
      <div className="space-y-8">
        {glance}
        <ComplexLoadState kind="loading" />
      </div>
    );
  }

  // 단지 정보 401(깨진·만료 토큰) / 403(정지 계정) — 오류 화면이 아니라 잠금 안내(세션 481 보완)
  if (complexQuery.isError && isAuthGateError(complexQuery.error)) {
    return (
      <div className="space-y-8">
        {glance}
        <div className="max-w-4xl mx-auto py-8">
          <LockedDataCard label="단지 정보" reason={lockReasonOf(complexQuery.error)} />
        </div>
      </div>
    );
  }
  if (error || !complex) {
    return (
      <div className="space-y-8">
        {glance}
        <ComplexLoadState kind="error" error={error} />
      </div>
    );
  }

  const totalPages = Math.ceil(totalCount / pageSize);

  // 🥈 매물 리스트 (spec L323 정보 위계 2순위) — 중개사 화면 본문 · 일반 회원 소비자 화면 맨 아래(세션 482 PR 1b)
  const articleSection = (
    <section aria-labelledby="section-articles" className="space-y-4">
      <h2 id="section-articles" className="text-lg md:text-xl font-semibold">매물</h2>

      {/* 필터 바 */}
      <div className="no-print">
        {/* 모바일 (< md) — shadcn Sheet 바텀시트 (PR 3b) */}
        <div className="md:hidden">
          <FilterBarMobileSheet key={`mobile-${navKey}`} onChange={handleFilterChange} filterOptions={filterOptions} onSortChange={handleSortChange} initialFilters={filters} />
        </div>
        {/* 데스크탑 (md+) — 기존 7 드롭다운 툴바 유지 */}
        <button
          type="button"
          onClick={() => setFilterOpen(v => !v)}
          className="text-sm text-blue-600 hover:text-blue-800 mb-1 hidden md:flex items-center gap-1"
        >
          {filterOpen ? "▲ 필터 접기" : "▼ 필터 펼치기"}
        </button>
        <div className={filterOpen ? "hidden md:block" : "hidden"}>
          <FilterBar key={navKey} onChange={handleFilterChange} filterOptions={filterOptions} sortBy={activeSortBy} onSortChange={handleSortChange} initialFilters={filters} />
        </div>
      </div>

      {/* 엑셀 내보내기 에러 배너 */}
      {exportError && (
        <Card className="bg-red-50 border-red-200 text-red-600 text-sm px-4 py-2 no-print">
          <div className="flex justify-between items-center">
            <span>{exportError}</span>
            <button type="button" onClick={() => clearExportError()} className="text-red-400 hover:text-red-600" aria-label="닫기">×</button>
          </div>
        </Card>
      )}

      {/* 적용된 필터 한 줄 요약 */}
      {hasActiveFilters && <FilterChipsSummary filters={filters} />}

      {/* 매물 수 + 데이터 갱신 + 엑셀 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        {/* 크롤 진행·완료·오류는 이 줄 안에 한 줄로 — 표를 위아래로 밀지 않는다 (세션 447)
            좁은 폭(640px 미만)에선 이 묶음이 한 줄을 다 쓰고 버튼 묶음이 다음 줄로 (세션 448 — 360px 겹침) */}
        <div className="flex items-center gap-2 md:gap-3 min-w-0 grow basis-full sm:basis-0">
          <span className="text-base md:text-lg font-semibold shrink-0">{loggedOut ? "매물" : `매물 ${totalCount}건`}</span>
          <CrawlMessage
            crawling={crawling}
            message={crawlMessage}
            messageType={crawlMessageType}
            progress={crawlProgress}
            onClear={clearCrawlMessage}
            tableLoading={tableLoading}
            staleLabel={crawlStaleLabel}
          />
        </div>
        {/* 데이터 갱신·엑셀(네이버 호출·내보내기)은 승인 중개사에게만(세션 482 PR 1b · 결정 2) */}
        {isApprovedBroker && (
          <div className="flex items-center gap-1.5 md:gap-2 no-print">
            {pendingRefresh ? (
              <Button type="button" size="sm" onClick={applyPendingRefresh}>
                {`새 매물 반영 (${pendingRefresh.count}건 바뀜)`}
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCrawl}
                disabled={crawling}
              >
                {crawling ? "갱신 중..." : "데이터 갱신"}
              </Button>
            )}
            <HintIcon text="네이버에서 최신 매물을 다시 가져옵니다 (30초~2분)" />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={exporting}
            >
              {exporting
                ? "내보내는 중..."
                : selectedArticleNos.size > 0
                  ? `선택 ${selectedArticleNos.size}건 내보내기`
                  : "엑셀 내보내기"}
            </Button>
          </div>
        )}
      </div>

      {/* 매물 API 실패 배너 — 401/403 은 잠금 안내, 그 외는 다시 시도 */}
      {articlesQuery.isError && (
        isAuthGateError(articlesQuery.error) ? (
          <LockedDataCard label="매물 목록" reason={lockReasonOf(articlesQuery.error)} />
        ) : (
          <Card className="bg-red-50 border-red-200 text-red-600 text-sm px-4 py-2">
            <div className="flex justify-between items-center gap-3">
              <span>매물 목록을 불러올 수 없습니다.</span>
              <button
                type="button"
                onClick={() => articlesQuery.refetch()}
                className="text-xs border border-red-300 rounded px-2 py-1 hover:bg-red-100 shrink-0"
              >다시 시도</button>
            </div>
          </Card>
        )
      )}

      {/* 매물 테이블 / 카드 */}
      {!loggedOut && !articlesQuery.isLoading && !articlesQuery.isError && (
        <div className={`transition-opacity duration-200 ${tableDimmed ? "opacity-50" : "opacity-100"}`}>
          <div className="hidden md:block">
            <div className="flex justify-end mb-2">
              <ArticlePageSizeSelect pageSize={pageSize} onPageSizeChange={handlePageSizeChange} />
            </div>
            <ArticleTable articles={articles} onRowClick={setSelectedArticle} onSortChange={handleSortChange} selectedArticleNos={selectedArticleNos} onSelectionChange={handleSelectionChange} onSelectAll={handleSelectAll} hasActiveFilters={hasActiveFilters} onResetFilters={resetFilters} />
          </div>
          <div className="md:hidden space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <ArticlePageSizeSelect pageSize={pageSize} onPageSizeChange={handlePageSizeChange} />
              {articles.length > 0 && (
                <ArticleViewToggle value={articleViewMode} onChange={handleViewModeChange} />
              )}
            </div>
            <ArticleCardMobile articles={articles} onRowClick={setSelectedArticle} selectedArticleNos={selectedArticleNos} onSelectionChange={handleSelectionChange} onSelectAll={handleSelectAll} hasActiveFilters={hasActiveFilters} onResetFilters={resetFilters} viewMode={articleViewMode} />
          </div>
        </div>
      )}

      {totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={handlePageChange}
        />
      )}
    </section>
  );

  // 로그인 세션 경고 — 확인 실패면 비로그인으로 판정돼 소비자 화면이 되므로 두 화면 모두 맨 위에(보완 A-3)
  const tokenWarning = tokenError ? (
    <Card className="bg-amber-50 border-amber-200 text-amber-800 px-3 py-2 no-print">
      <div className="flex justify-between items-center gap-2 text-xs">
        <span>로그인 세션을 확인할 수 없어 일부 기능(실거래가 수집)이 제한됩니다. 새로고침하거나 다시 로그인해 주세요.</span>
        <button
          type="button"
          onClick={dismissTokenError}
          aria-label="닫기"
          className="text-amber-600 hover:text-amber-900 shrink-0"
        >×</button>
      </div>
    </Card>
  ) : null;

  const overlays = (
    <>
      {/* 비교 플로팅 바 — printRef 내부라 no-print 필수, 모달(아래 조건부)보다 DOM 앞이어야 백드롭이 바를 덮음 */}
      <div className="no-print">
        <CompareFloatingBar list={compare.list} onRemove={compare.remove} onClear={compare.clear} />
        {compare.list.length > 0 && <div className="pb-16" />}
      </div>

      {/* 매물 상세 모달 */}
      {selectedArticle && (
        <ArticleDetail articleNo={selectedArticle} onClose={() => setSelectedArticle(null)} complex={complexQuery.data} />
      )}
    </>
  );

  // 비로그인·일반 회원 = 소비자 화면 「C 질문형」(세션 482 PR 1b) — 맨 아래만 다르다
  if (!isApprovedBroker) {
    return (
      <div className="space-y-8">
        {tokenWarning}
        {glance}
        <ConsumerComplexView
          complex={complex}
          seed={seed}
          starred={starred}
          onBack={goBack}
          onToggleFavorite={() => toggleFavorite(complex.complex_name, complex.cortar_address)}
          isCompared={compare.isInCompare(complexNo)}
          compareFull={compare.isFull}
          onToggleCompare={() => compare.toggle({ complex_no: complexNo, complex_name: complex.complex_name })}
          aside={
            loggedOut ? (
              <LockedDataCard
                title="지금 나온 매물과 호가는 로그인하면 볼 수 있어요"
                description="공인중개사 인증을 받으면 새로 받기·실거래가 수집·엑셀·인쇄까지"
              />
            ) : undefined
          }
          footer={loggedOut ? undefined : articleSection}
        />
        {overlays}
      </div>
    );
  }

  return (
    <div ref={printRef} className="space-y-8">
      {/* 서버가 그린 공공 자료 요약 — 중개사 화면에선 접어 둔다(결정 25 · 기본 닫힘) */}
      {glance && (
        <details className="no-print rounded-lg border border-gray-200 bg-white" data-testid="broker-glance-fold">
          <summary className="cursor-pointer px-4 py-2 text-sm text-gray-700">이 단지 공공 자료 요약</summary>
          <div className="px-2 pb-2">{glance}</div>
        </details>
      )}
      {/* 헤더 + 인쇄 버튼 */}
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <ComplexHeader
          complex={complex}
          starred={starred}
          onBack={goBack}
          onToggleFavorite={() => toggleFavorite(complex.complex_name, complex.cortar_address)}
          isCompared={compare.isInCompare(complexNo)}
          compareFull={compare.isFull}
          onToggleCompare={() => compare.toggle({ complex_no: complexNo, complex_name: complex.complex_name })}
        />
        <PrintButton contentRef={printRef} documentTitle={complex.complex_name} />
      </div>

      {/* 로그인 세션 경고 */}
      {tokenWarning}

      {/* 📱 한눈 대시보드 (PR 6d — 모바일 2×2 + 데스크톱 4×1 단일 컴포넌트) */}
      {complex && (
        <ComplexDashboard
          complex={complex}
          complexNo={complexNo}
          pyeongDetails={pyeongDetails}
          pyeongReady={!pyeongQuery.isPending}
          sessionToken={sessionToken}
          loggedOut={loggedOut}
          canAct={isApprovedBroker}
          onFilterChange={handleFilterChange}
        />
      )}

      {articleSection}

      {overlays}
    </div>
  );
}
