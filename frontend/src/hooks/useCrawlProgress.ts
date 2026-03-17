"use client";

import { useState, useCallback, useRef } from "react";
import { startLiveCrawl, getCrawlStatus, getArticles, getPyeongDetails, getComplex, liveArticles } from "@/lib/api";
import { PAGE_SIZE, CRAWL_STATUS_POLL_MS, ARTICLES_POLL_MS } from "@/lib/constants";
import type { Complex, Article, PyeongDetail, CrawlProgress } from "@/types";

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

        if (status.status === "error" || (status.status === "done" && status.detail_phase !== "running")) {
          clearAllPolling();
          setCrawling(false);
          if (status.status === "done") {
            setCrawlMessage("");
            try {
              const res = await getArticles(complexNo, { page: 1, page_size: PAGE_SIZE });
              if (!cancelledRef.current) {
                callbacks.setArticles(res.articles);
                callbacks.setTotalCount(res.total);
                callbacks.setCurrentPage(1);
              }
            } catch { /* ignore */ }
            try {
              const pyeong = await getPyeongDetails(complexNo);
              if (!cancelledRef.current) callbacks.setPyeongDetails(pyeong.pyeong_details);
            } catch { /* ignore */ }
            try {
              const cpx = await getComplex(complexNo);
              if (!cancelledRef.current) callbacks.setComplex(cpx);
            } catch { /* ignore */ }
          } else if (status.error) {
            setCrawlMessage(`크롤링 오류: ${status.error}`);
          }
        }
      } catch { /* polling failure ignored */ }
    }, CRAWL_STATUS_POLL_MS);

    articlesPollRef.current = setInterval(async () => {
      if (cancelledRef.current) return;
      try {
        const res = await getArticles(complexNo, { page: 1, page_size: PAGE_SIZE });
        if (cancelledRef.current || crawlTargetRef.current !== complexNo) return;
        callbacks.setArticles(res.articles);
        callbacks.setTotalCount(res.total);
      } catch { /* ignore */ }
    }, ARTICLES_POLL_MS);

    setCrawling(true);
  }, [clearAllPolling]);

  return { crawling, crawlMessage, crawlProgress, setCrawling, setCrawlMessage, startCrawl, clearAllPolling };
}
