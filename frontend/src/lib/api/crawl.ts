/**
 * 크롤링/가격수집 API
 */

import type { CrawlProgress, PriceCollectProgress } from "@/types";
import { fetchApi, DEFAULT_TIMEOUT_MS } from "./core";

/** 백그라운드 크롤링 시작 (즉시 반환).
 *
 * force=true 이면 서버의 `crawl_done` 쿨다운 캐시를 무시하고 강제로 크롤 시작.
 * (사용자가 "데이터 갱신" 버튼을 10초 내 재클릭한 경우에만 사용)
 */
export async function startLiveCrawl(
  complexNo: string,
  token?: string,
  force: boolean = false,
) {
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const qs = force ? "?force=true" : "";
  return fetchApi<CrawlProgress>(
    `/api/live/${encodeURIComponent(complexNo)}/articles/start-crawl${qs}`,
    { method: "POST", timeoutMs: DEFAULT_TIMEOUT_MS, headers } as RequestInit & { timeoutMs?: number },
  );
}

/** 백그라운드 크롤링 진행 상태 폴링 (started 이후 done/error 까지 추적) */
export async function getCrawlStatus(complexNo: string) {
  return fetchApi<CrawlProgress>(
    `/api/live/${encodeURIComponent(complexNo)}/articles/crawl-status`,
    { timeoutMs: DEFAULT_TIMEOUT_MS } as RequestInit & { timeoutMs?: number },
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
