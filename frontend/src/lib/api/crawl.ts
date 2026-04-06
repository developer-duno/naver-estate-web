/**
 * 크롤링/가격수집 API
 */

import type { CrawlProgress, PriceCollectProgress } from "@/types";
import { fetchApi, DEFAULT_TIMEOUT_MS } from "./core";

/** 백그라운드 크롤링 시작 (즉시 반환) */
export async function startLiveCrawl(complexNo: string, token?: string) {
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return fetchApi<CrawlProgress>(
    `/api/live/${encodeURIComponent(complexNo)}/articles/start-crawl`,
    { method: "POST", timeoutMs: DEFAULT_TIMEOUT_MS, headers } as RequestInit & { timeoutMs?: number },
  );
}

/** 실거래가 on-demand 수집 시작 */
export async function startPriceCollect(complexNo: string, token?: string) {
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return fetchApi<PriceCollectProgress>(
    `/api/live/${encodeURIComponent(complexNo)}/price-history/start-collect`,
    { method: "POST", timeoutMs: DEFAULT_TIMEOUT_MS, headers } as RequestInit & { timeoutMs?: number },
  );
}

/** 실거래가 수집 진행 상태 폴링 */
export async function getPriceCollectStatus(complexNo: string) {
  return fetchApi<PriceCollectProgress>(
    `/api/live/${encodeURIComponent(complexNo)}/price-history/collect-status`,
    { timeoutMs: DEFAULT_TIMEOUT_MS } as RequestInit & { timeoutMs?: number },
  );
}
