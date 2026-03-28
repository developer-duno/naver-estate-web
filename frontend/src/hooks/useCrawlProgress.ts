"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getCrawlStatus } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { CRAWL_STATUS_POLL_MS } from "@/lib/constants";
import type { CrawlProgress } from "@/types";

export interface CrawlHookResult {
  crawling: boolean;
  crawlMessage: string;
  crawlProgress: CrawlProgress | null;
  setCrawling: (v: boolean) => void;
  setCrawlMessage: (v: string) => void;
  /** isPolling — 현재 폴링 중인지 여부 */
  isPolling: boolean;
  /** complexNo 설정 + 폴링 시작 (콜백 불필요) */
  startCrawl: (complexNo: string) => void;
  clearAllPolling: () => void;
}

export function useCrawlProgress(): CrawlHookResult {
  const queryClient = useQueryClient();
  const [crawling, setCrawling] = useState(false);
  const [crawlMessage, setCrawlMessage] = useState("");
  const [crawlProgress, setCrawlProgress] = useState<CrawlProgress | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [targetComplexNo, setTargetComplexNo] = useState<string>("");
  const prevPhaseRef = useRef<string | undefined>(undefined);

  // 크롤 완료 시 관련 쿼리 무효화
  const invalidateAllQueries = useCallback(
    (complexNo: string) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.articlesAll(complexNo) });
      queryClient.invalidateQueries({ queryKey: queryKeys.pyeongDetails(complexNo) });
      queryClient.invalidateQueries({ queryKey: queryKeys.complex(complexNo) });
      queryClient.invalidateQueries({ queryKey: queryKeys.priceStats(complexNo) });
    },
    [queryClient],
  );

  // useQuery로 crawl status 폴링
  const statusQuery = useQuery({
    queryKey: queryKeys.crawlStatus(targetComplexNo),
    queryFn: () => getCrawlStatus(targetComplexNo),
    enabled: isPolling && !!targetComplexNo,
    refetchInterval: isPolling ? CRAWL_STATUS_POLL_MS : false,
  });

  // 폴링 결과에 따른 상태 전환 (useEffect로 처리 — 렌더 중 setState 방지)
  useEffect(() => {
    if (!isPolling || !statusQuery.data) return;

    const status = statusQuery.data;

    // Phase 1(articles) → enriching/details 전환 시 매물 목록 + priceStats 즉시 갱신
    const curPhase = status.phase;
    if (prevPhaseRef.current === "articles" && curPhase && curPhase !== "articles") {
      queryClient.invalidateQueries({ queryKey: queryKeys.articlesAll(targetComplexNo) });
      queryClient.invalidateQueries({ queryKey: queryKeys.priceStats(targetComplexNo) });
    }
    prevPhaseRef.current = curPhase;

    // 상세 크롤링 진행 중 매물 목록 중간 갱신 (20건마다)
    if (
      curPhase === "details" &&
      status.detail_crawled_count != null &&
      status.detail_crawled_count > 0 &&
      status.detail_crawled_count % 20 === 0
    ) {
      queryClient.invalidateQueries({ queryKey: queryKeys.articlesAll(targetComplexNo) });
    }

    // 완료/에러 감지
    const isDone = (status.status === "done" || status.status === "done_partial") && status.detail_phase !== "running";
    const isIdle = status.status === "idle";
    const isError = status.status === "error";

    if (isDone || isIdle || isError) {
      setIsPolling(false);
      setCrawling(false);
      setCrawlProgress(null); // 프로그레스 바 즉시 제거
      if (isDone || isIdle) {
        setCrawlMessage("");
        invalidateAllQueries(targetComplexNo);
      } else if (isError && status.error) {
        setCrawlMessage(`크롤링 오류: ${status.error}`);
        invalidateAllQueries(targetComplexNo);
      }
    } else {
      // 진행 중 — 프로그레스 업데이트
      setCrawlProgress(status);
    }
  }, [statusQuery.data, isPolling, targetComplexNo, invalidateAllQueries, queryClient]);

  const startCrawl = useCallback((complexNo: string) => {
    setTargetComplexNo(complexNo);
    prevPhaseRef.current = undefined;
    setCrawlProgress(null);
    setIsPolling(true);
    setCrawling(true);
  }, []);

  const clearAllPolling = useCallback(() => {
    setIsPolling(false);
    setTargetComplexNo("");
  }, []);

  return {
    crawling,
    crawlMessage,
    crawlProgress,
    setCrawling,
    setCrawlMessage,
    isPolling,
    startCrawl,
    clearAllPolling,
  };
}
