import type { Page } from "@playwright/test";
import type {
  DetailedStats,
  PaginatedResponse,
  AuditLog,
  CrawlJobDetail,
  SchedulerStatusResponse,
} from "../../src/types/admin";

export const mockDetailedStats: DetailedStats = {
  complex_count: 1234,
  article_count: 90_000,
  active_article_count: 56_789,
  user_count: 42,
  today_crawl_count: 7,
  recent_crawl_jobs: [],
  last_crawl_at: "2026-04-16T09:00:00+09:00",
  error_count_24h: 0,
  total_article_count: 90_000,
};

export const mockAuditLogs: PaginatedResponse<AuditLog> = {
  items: [],
  total: 0,
  page: 1,
  page_size: 20,
};

export const mockCrawlJobs: PaginatedResponse<CrawlJobDetail> = {
  items: [],
  total: 0,
  page: 1,
  page_size: 20,
};

export const mockSchedulerStatus: SchedulerStatusResponse = {
  jobs: [
    {
      scheduler_job_id: "collect_air_quality",
      name: "대기질 수집",
      schedule: "daily 02:00",
      enabled: true,
      last_run: {
        status: "completed",
        started_at: "2026-04-16T02:00:00+09:00",
        completed_at: "2026-04-16T02:01:30+09:00",
        duration_seconds: 90,
        total_items: 500,
        processed_items: 500,
      },
      next_run_at: "2026-04-17T02:00:00+09:00",
      stats_24h: { runs: 1, failures: 0 },
    },
    {
      scheduler_job_id: "crawl_articles",
      name: "매물 수집 배치",
      schedule: "12h interval",
      enabled: true,
      last_run: {
        status: "completed",
        started_at: "2026-04-16T08:00:00+09:00",
        completed_at: "2026-04-16T08:45:00+09:00",
        duration_seconds: 2700,
        total_items: 1200,
        processed_items: 1200,
      },
      next_run_at: "2026-04-16T20:00:00+09:00",
      stats_24h: { runs: 2, failures: 0 },
    },
  ],
  summary: {
    total_runs_today: 3,
    failures_today: 0,
  },
};

export async function applyAdminMocks(page: Page): Promise<void> {
  await page.route("**/api/admin/stats/detailed", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockDetailedStats) });
  });
  await page.route("**/api/admin/audit-logs*", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockAuditLogs) });
  });
  await page.route("**/api/admin/crawl-jobs*", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockCrawlJobs) });
  });
  await page.route("**/api/admin/scheduler-status", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockSchedulerStatus) });
  });
}
