/** 실거래가 수집 진행 상태 */
export interface PriceCollectProgress {
  complex_no: string;
  status: "idle" | "running" | "done" | "error" | "fresh";
  collected?: number;
  failed?: number;
  total?: number;
  error?: string;
}

/** 크롤링 진행 상태 */
export interface CrawlProgress {
  complex_no: string;
  status: "idle" | "started" | "running" | "done" | "done_partial" | "error" | "cached" | "already_running";
  phase?: "articles" | "enriching" | "details";
  current_page?: number;
  article_count?: number;
  has_more?: boolean;
  error?: string;
  detail_phase?: "running" | "done" | null;
  detail_crawled_count?: number;
  detail_total?: number;
  detail_skipped_count?: number;
}
