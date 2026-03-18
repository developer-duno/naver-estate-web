"use client";

import { useState, useCallback, useRef } from "react";
import { startLiveCrawl, getCrawlStatus, getArticles, getPyeongDetails, getComplex, liveArticles } from "@/lib/api";
import { PAGE_SIZE, CRAWL_STATUS_POLL_MS, ARTICLES_POLL_MS } from "@/lib/constants";
import type { Complex, Article, PyeongDetail, CrawlProgress, ArticleFilters } from "@/types";

interface CrawlHookResult {
  crawling: boolean;
  crawlMessage: string;
  crawlProgress: CrawlProgress | null;
  setCrawling: (v: boolean) => void;
  setCrawlMessage: (v: string) => void;
  startCrawl: (
    complexNo: string,
    callbacks: {
      setArticles: (a: Article[]) => void;
      setTotalCount: (n: number) => void;
      setCurrentPage: (n: number) => void;
      setComplex: (c: Complex) => void;
      setPyeongDetails: (p: PyeongDetail[]) => void;
    },
    filtersRef?: React.RefObject<ArticleFilters>,
  ) => void;
  clearAllPolling: () => void;
}

export function useCrawlProgress(): CrawlHookResult {
  const [crawling, setCrawling] = useState(false);
  const [crawlMessage, setCrawlMessage] = useState("");
  const [crawlProgress, setCrawlProgress] = useState<CrawlProgress | null>(null);
  const cancelledRef = useRef(false);
  const crawlTargetRef = useRef<string>("");
  const statusPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const articlesPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearAllPolling = useCallback(() => {
    if (statusPollRef.current) { clearInterval(statusPollRef.current); statusPollRef.current = null; }
    if (articlesPollRef.current) { clearInterval(articlesPollRef.current); articlesPollRef.current = null; }
  }, []);

  const startCrawl = useCallback((
    complexNo: string,
    callbacks: {
      setArticles: (a: Article[]) => void;
      setTotalCount: (n: number) => void;
      setCurrentPage: (n: number) => void;
      setComplex: (c: Complex) => void;
      setPyeongDetails: (p: PyeongDetail[]) => void;
    },
    filtersRef?: React.RefObject<ArticleFilters>,
  ) => {
    clearAllPolling();
    cancelledRef.current = false;
    crawlTargetRef.current = complexNo;

    statusPollRef.current = setInterval(async () => {
      if (cancelledRef.current) return;
      try {
        const status = await getCrawlStatus(complexNo);
        if (cancelledRef.current || crawlTargetRef.current !== complexNo) return;
        setCrawlProgress(status);

        const isDone = status.status === "done" && status.detail_phase !== "running";
        const isIdle = status.status === "idle"; // BE가 done 후 status를 pop하면 idle 반환
        const isError = status.status === "error";

        if (isError || isDone || isIdle) {
          clearAllPolling();
          setCrawling(false);
          if (isDone || isIdle) {
            setCrawlMessage("");
            try {
              const filters = filtersRef?.current ?? {};
              const res = await getArticles(complexNo, { ...filters, page: 1, page_size: PAGE_SIZE });
              if (!cancelledRef.current) {
                callbacks.setArticles(res.articles);
                callbacks.setTotalCount(res.total);
                callbacks.setCurrentPage(1);
              }
            } catch (e) { console.error("[CrawlProgress]", e); }
            try {
              const pyeong = await getPyeongDetails(complexNo);
              if (!cancelledRef.current) callbacks.setPyeongDetails(pyeong.pyeong_details);
            } catch (e) { console.error("[CrawlProgress]", e); }
            try {
              const cpx = await getComplex(complexNo);
              if (!cancelledRef.current) callbacks.setComplex(cpx);
            } catch (e) { console.error("[CrawlProgress]", e); }
          } else if (status.error) {
            setCrawlMessage(`크롤링 오류: ${status.error}`);
          }
        }
      } catch (e) { console.error("[CrawlProgress] poll:", e); }
    }, CRAWL_STATUS_POLL_MS);

    // 크롤링 중 매물 실시간 폴링 — 현재 필터를 반영하여 호출
    articlesPollRef.current = setInterval(async () => {
      if (cancelledRef.current) return;
      try {
        const filters = filtersRef?.current ?? {};
        const res = await getArticles(complexNo, { ...filters, page: 1, page_size: PAGE_SIZE });
        if (cancelledRef.current || crawlTargetRef.current !== complexNo) return;
        callbacks.setArticles(res.articles);
        callbacks.setTotalCount(res.total);
      } catch (e) { console.error("[CrawlProgress]", e); }
    }, ARTICLES_POLL_MS);

    setCrawling(true);
  }, [clearAllPolling]);

  return { crawling, crawlMessage, crawlProgress, setCrawling, setCrawlMessage, startCrawl, clearAllPolling };
}
