import type { ArticleFilters } from "@/types";

export const queryKeys = {
  // Public
  stats: ["stats"] as const,
  regions: ["regions"] as const,

  // Search
  search: (keyword: string, types?: string) =>
    ["search", keyword, types] as const,
  regionSearch: (
    sido: string,
    sigungu?: string,
    dong?: string,
    types?: string,
  ) => ["regionSearch", sido, sigungu, dong, types] as const,

  // Complex
  complex: (no: string) => ["complex", no] as const,
  articles: (no: string, filters?: ArticleFilters) =>
    ["articles", no, filters] as const,
  /** invalidation prefix — 해당 단지의 모든 articles 쿼리 무효화용 */
  articlesAll: (no: string) => ["articles", no] as const,
  pyeongDetails: (no: string) => ["pyeongDetails", no] as const,
  priceStats: (no: string) => ["priceStats", no] as const,
  priceHistory: (no: string, tradeType?: string, areaNo?: string) =>
    ["priceHistory", no, tradeType, areaNo] as const,
  /** invalidation prefix — 해당 단지의 모든 priceHistory 쿼리 무효화용 */
  priceHistoryAll: (no: string) => ["priceHistory", no] as const,

  // Article detail
  articleLive: (articleNo: string) => ["articleLive", articleNo] as const,
  articlePriceHistory: (articleNo: string) => ["articlePriceHistory", articleNo] as const,

  // Crawl status (polling)
  crawlStatus: (no: string) => ["crawlStatus", no] as const,
  priceCollectStatus: (no: string) => ["priceCollectStatus", no] as const,

  // Admin (token excluded from keys for security)
  admin: {
    stats: () => ["admin", "stats"] as const,
    users: (params?: Record<string, unknown>) =>
      ["admin", "users", params] as const,
    crawlJobs: (params?: Record<string, unknown>) =>
      ["admin", "crawlJobs", params] as const,
    auditLogs: (params?: Record<string, unknown>) =>
      ["admin", "auditLogs", params] as const,
    settings: () => ["admin", "settings"] as const,
    schedulerStatus: () => ["admin", "schedulerStatus"] as const,
    verifications: (params?: Record<string, unknown>) =>
      ["admin", "verifications", params] as const,
    errorStats: (days: number) => ["admin", "errorStats", days] as const,
    naverCalls: () => ["admin", "naverCalls"] as const,
    dataFreshness: () => ["admin", "dataFreshness"] as const,
    crawlFailures: (hours: number = 24) => ["admin", "crawlFailures", hours] as const,
  },

  // 중개사 검증
  verification: {
    status: () => ["verification", "status"] as const,
  },

  // 미분양 (mibunyang)
  mb: {
    guList: (region: string) => ["mb", "guList", region] as const,
    apartments: (region: string, gu?: string, page?: number, sortBy?: string, keyword?: string) =>
      ["mb", "apartments", region, gu, page, ...(sortBy ? [sortBy] : []), ...(keyword ? [keyword] : [])] as const,
    apartmentDetail: (id: string) => ["mb", "apartment", id] as const,
    unsold: (region: string, gu?: string, sortBy?: string, keyword?: string) =>
      ["mb", "unsold", region, gu, ...(sortBy ? [sortBy] : []), ...(keyword ? [keyword] : [])] as const,
    unsoldHistory: (id: string) => ["mb", "unsoldHistory", id] as const,
    regions: (region: string, gu?: string) =>
      ["mb", "regions", region, gu] as const,
    trades: (region: string, gu?: string, dong?: string, page?: number, sortBy?: string) =>
      ["mb", "trades", region, gu, dong, page, ...(sortBy ? [sortBy] : [])] as const,
  },
} as const;
