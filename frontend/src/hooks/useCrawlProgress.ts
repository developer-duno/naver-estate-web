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

    // 크롤링 중 매물 폴링 — 필터 없이 건수만 갱신 (필터 결과를 덮어씌우지 않음)
    // 사용자가 필터를 적용한 상태에서 크롤링 폴링이 전체 매물로 덮어씌우는 버그 방지

    setCrawling(true);
  }, [clearAllPolling]);

  return { crawling, crawlMessage, crawlProgress, setCrawling, setCrawlMessage, startCrawl, clearAllPolling };
}
