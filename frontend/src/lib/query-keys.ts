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
  pyeongDetails: (no: string) => ["pyeongDetails", no] as const,
  priceStats: (no: string) => ["priceStats", no] as const,
  priceHistory: (no: string, tradeType?: string, areaNo?: string) =>
    ["priceHistory", no, tradeType, areaNo] as const,
  /** invalidation prefix — 해당 단지의 모든 priceHistory 쿼리 무효화용 */
  priceHistoryAll: (no: string) => ["priceHistory", no] as const,

  // Article detail
  articleLive: (articleNo: string) => ["articleLive", articleNo] as const,

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
  },
} as const;
