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
    // no-store = 서버 no-store 헤더에 대한 이중 방어 (프록시·미들웨어 회귀 시에도 브라우저가
    // 폴링 응답을 저장하지 않게 — 캐시되면 완료를 감지 못 한다, 세션 395)
    { timeoutMs: DEFAULT_TIMEOUT_MS, cache: "no-store" } as RequestInit & { timeoutMs?: number },
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
    // no-store = 서버 no-store 헤더에 대한 이중 방어 (위 getCrawlStatus 와 같은 이유, 세션 395)
    { timeoutMs: DEFAULT_TIMEOUT_MS, cache: "no-store" } as RequestInit & { timeoutMs?: number },
  );
}
