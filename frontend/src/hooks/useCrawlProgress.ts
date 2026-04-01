"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
  /** complexNo 설정 + 폴링 시작 */
  startCrawl: (complexNo: string) => void;
  clearAllPolling: () => void;
}

/**
 * 크롤링 진행률 폴링 훅 — setInterval 기반 직접 폴링
 *
 * React Query refetchInterval 대신 setInterval로 CRAWL_STATUS_POLL_MS마다
 * crawl-status를 직접 fetch하여 진행률을 확실하게 업데이트한다.
 */
export function useCrawlProgress(): CrawlHookResult {
  const queryClient = useQueryClient();
  const [crawling, setCrawling] = useState(false);
  const [crawlMessage, setCrawlMessage] = useState("");
  const [crawlProgress, setCrawlProgress] = useState<CrawlProgress | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  // refs: setInterval 콜백에서 stale closure 방지
  const targetRef = useRef("");
  const pollingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevPhaseRef = useRef<string | undefined>(undefined);
  const lastRefreshCountRef = useRef(0);

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

  // 폴링 중지
  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    pollingRef.current = false;
    setIsPolling(false);
  }, []);

  // 폴링 1회 실행
  const pollOnce = useCallback(async () => {
    const complexNo = targetRef.current;
    if (!complexNo || !pollingRef.current) return;

    try {
      const status = await getCrawlStatus(complexNo);

      // Phase 전환 시 매물 목록 즉시 갱신
      const curPhase = status.phase;
      if (prevPhaseRef.current === "articles" && curPhase && curPhase !== "articles") {
        queryClient.invalidateQueries({ queryKey: queryKeys.articlesAll(complexNo) });
        queryClient.invalidateQueries({ queryKey: queryKeys.priceStats(complexNo) });
      }
      prevPhaseRef.current = curPhase;

      // 상세 크롤링 중 매물 목록 중간 갱신 (20건 간격)
      const DETAIL_REFRESH_INTERVAL = 20;
      if (
        curPhase === "details" &&
        status.detail_crawled_count != null &&
        status.detail_crawled_count > 0 &&
        status.detail_crawled_count - lastRefreshCountRef.current >= DETAIL_REFRESH_INTERVAL
      ) {
        lastRefreshCountRef.current = status.detail_crawled_count;
        queryClient.invalidateQueries({ queryKey: queryKeys.articlesAll(complexNo) });
      }

      // 완료/에러 감지
      const isDone = (status.status === "done" || status.status === "done_partial") && status.detail_phase !== "running";
      const isIdle = status.status === "idle";
      const isError = status.status === "error";

      if (isDone || isIdle || isError) {
        stopPolling();
        setCrawling(false);
        setCrawlProgress(null);
        if (isDone || isIdle) {
          setCrawlMessage("");
          invalidateAllQueries(complexNo);
        } else if (isError && status.error) {
          setCrawlMessage(`크롤링 오류: ${status.error}`);
          invalidateAllQueries(complexNo);
        }
      } else {
        setCrawlProgress(status);
      }
    } catch {
      // 네트워크 에러 — 폴링 계속 (다음 주기에 재시도)
    }
  }, [queryClient, stopPolling, invalidateAllQueries]);

  // 언마운트 시 타이머 정리
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  // 안전장치: crawling=true인데 폴링이 시작되지 않으면 5초 후 자동 복원
  useEffect(() => {
    if (!crawling || isPolling) return;
    const timer = setTimeout(() => {
      setCrawling(false);
      setCrawlMessage("");
    }, 5_000);
    return () => clearTimeout(timer);
  }, [crawling, isPolling]);

  const startCrawl = useCallback((complexNo: string) => {
    // 기존 타이머 정리 (연타 방지)
    stopPolling();
    targetRef.current = complexNo;
    prevPhaseRef.current = undefined;
    lastRefreshCountRef.current = 0;
    setCrawlProgress(null);
    setCrawling(true);
    pollingRef.current = true;
    setIsPolling(true);
    // 즉시 1회 + 이후 주기적 폴링
    pollOnce();
    timerRef.current = setInterval(pollOnce, CRAWL_STATUS_POLL_MS);
  }, [stopPolling, pollOnce]);

  const clearAllPolling = useCallback(() => {
    stopPolling();
    targetRef.current = "";
  }, [stopPolling]);

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
