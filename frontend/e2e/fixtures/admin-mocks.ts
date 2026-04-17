import type { Page } from "@playwright/test";
import type {
  DetailedStats,
  PaginatedResponse,
  AuditLog,
  CrawlJobDetail,
  SchedulerStatusResponse,
  UserProfile,
  AdminSetting,
  AgentVerification,
} from "../../src/types/admin";
import type { NaverCallStats, RecrawlStatus, RecrawlProgress } from "../../src/lib/api/admin";

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

export const mockNaverCallStats: NaverCallStats = {
  labels: {
    search: { "10m": 3, "1h": 12, "24h": 87 },
    crawl_articles_batch: { "10m": 0, "1h": 8, "24h": 420 },
    article_detail_live: { "10m": 1, "1h": 5, "24h": 35 },
  },
  totals: { "10m": 4, "1h": 25, "24h": 542 },
  process_uptime_seconds: 43200,
};

export const mockUsers: PaginatedResponse<UserProfile> = {
  items: [
    {
      user_id: "u-1",
      email: "admin@example.com",
      display_name: "관리자",
      role: "admin",
      status: "approved",
      daily_crawl_quota: 100,
      daily_export_quota: 10,
      login_count: 42,
      created_at: "2025-01-01T00:00:00+09:00",
    },
    {
      user_id: "u-2",
      email: "expert@example.com",
      display_name: "전문가",
      role: "expert",
      status: "approved",
      daily_crawl_quota: 50,
      daily_export_quota: 5,
      login_count: 7,
      created_at: "2025-06-01T00:00:00+09:00",
    },
  ],
  total: 2,
  page: 1,
  page_size: 20,
};

export const mockSettings: { items: AdminSetting[] } = {
  items: [
    {
      key: "scheduler.popular_batch_size",
      value: 50,
      updated_at: "2026-04-10T12:00:00+09:00",
    },
    {
      key: "crawl.throttle_ms",
      value: { min: 2000, max: 5000 },
      updated_at: "2026-04-12T09:30:00+09:00",
    },
  ],
};

export const mockRecrawlStatus: RecrawlStatus = {
  level: "safe",
  message: "지금 실행",
  current_kst_hour: 10,
  running_jobs_count: 0,
  running_jobs: [],
  recrawl_in_progress: false,
  recommended_window_kst: "야간 (00~06시)",
  estimated_seconds_per_100: 300,
};

export const mockRecrawlProgress: RecrawlProgress = {
  job: null,
};

export const mockVerifications: PaginatedResponse<AgentVerification> = {
  items: [],
  total: 0,
  page: 1,
  page_size: 20,
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
  await page.route("**/api/admin/naver-calls", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockNaverCallStats) });
  });
  await page.route("**/api/admin/users*", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockUsers) });
  });
  await page.route("**/api/admin/settings", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockSettings) });
  });
  await page.route("**/api/admin/verifications*", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockVerifications) });
  });
  await page.route("**/api/admin/recrawl/status", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockRecrawlStatus) });
  });
  await page.route("**/api/admin/recrawl/progress", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockRecrawlProgress) });
  });
}
