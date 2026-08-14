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
  QuotaStatus,
  DataFreshnessResponse,
} from "../../src/types/admin";
import type { NaverCallStats, RecrawlStatus, RecrawlProgress, CrawlFailuresResponse } from "../../src/lib/api/admin";

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
  items: [
    {
      id: 5,
      user_id: "b0da4fd4-487d-46a9-8b3b-cff07227429c",
      action: "admin_recrawl_articles",
      target_type: "batch",
      target_id: "500",
      details: { level: "safe", force: false, parent_job_id: 12 },
      ip_address: "127.0.0.xxx",
      created_at: "2026-05-11T10:00:00+09:00",
    },
    {
      id: 4,
      user_id: "b0da4fd4-487d-46a9-8b3b-cff07227429c",
      action: "admin_collect_trigger",
      target_type: "collector",
      target_id: "backfill-price",
      details: {},
      ip_address: "127.0.0.xxx",
      created_at: "2026-05-11T09:00:00+09:00",
    },
    {
      id: 3,
      user_id: "b0da4fd4-487d-46a9-8b3b-cff07227429c",
      action: "admin_verify_reject",
      target_type: "verification",
      target_id: "1",
      details: { reason: "자격증 서류 미제출 — 재신청 시 첨부 부탁드립니다" },
      ip_address: "127.0.0.xxx",
      created_at: "2026-05-10T18:04:30+09:00",
    },
    {
      id: 2,
      user_id: "b0da4fd4-487d-46a9-8b3b-cff07227429c",
      action: "admin_user_update",
      target_type: "user",
      target_id: "b0da4fd4-487d-46a9-8b3b-cff07227429c",
      details: { role: "admin" },
      ip_address: "127.0.0.xxx",
      created_at: "2026-05-10T16:28:56+09:00",
    },
    {
      id: 1,
      user_id: "b0da4fd4-487d-46a9-8b3b-cff07227429c",
      action: "export",
      target_type: "complex",
      target_id: "9138",
      details: {},
      ip_address: "127.0.0.xxx",
      created_at: "2026-05-02T10:56:23+09:00",
    },
  ],
  total: 5,
  page: 1,
  page_size: 50,
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
      schedule: "12시간마다",
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

export const mockQuotaStatus: QuotaStatus = {
  api_name: "data_go_kr",
  date: "2026-05-11",
  count: 1234,
  limit: 10_000,
  remaining: 8_766,
  utilization_pct: 12.3,
};

export const mockCrawlFailures: CrawlFailuresResponse = {
  window_hours: 24,
  total: 4,
  items: [
    {
      job_type: "complex_articles",
      count: 3,
      last_error: "네이버 API 차단",
      last_failed_at: "2026-05-12T12:00:00+00:00",
    },
    {
      job_type: "price_history",
      count: 1,
      last_error: "DB 락 타임아웃",
      last_failed_at: "2026-05-12T11:30:00+00:00",
    },
  ],
};

// 신선도 카드 목 — 이 라우트가 없으면 CI(백엔드 부재)에서 카드가 로딩↔에러 재시도를
// 반복하며 페이지 높이가 출렁여(≈700px) 대시보드 시각 스크린샷이 영구 flaky 가 된다.
export const mockDataFreshness: DataFreshnessResponse = {
  items: [
    {
      key: "complexes", label: "단지", count: 1234, last_updated: "2026-04-16T08:00:00+09:00",
      expected_interval_seconds: 86400, status: "green", spinning: false,
      last_job: { started_at: "2026-04-16T08:00:00+09:00", completed_at: "2026-04-16T08:01:00+09:00", processed_items: 572, total_items: 572 },
      new_rows: 8,
    },
    {
      key: "articles", label: "매물", count: 90_000, last_updated: "2026-04-16T08:30:00+09:00",
      expected_interval_seconds: 43200, status: "green", spinning: false,
      last_job: { started_at: "2026-04-16T08:30:00+09:00", completed_at: "2026-04-16T08:31:00+09:00", processed_items: 572, total_items: 572 },
      new_rows: 120,
    },
    {
      key: "air_quality", label: "대기질", count: 1698, last_updated: "2026-04-14T02:00:00+09:00",
      expected_interval_seconds: 86400, status: "yellow", spinning: false,
      last_job: { started_at: "2026-04-14T02:00:00+09:00", completed_at: "2026-04-14T02:02:00+09:00", processed_items: 97, total_items: 100 },
      new_rows: null,
    },
    {
      key: "unsold", label: "미분양 이력", count: 4104, last_updated: "2026-04-11T05:00:00+09:00",
      expected_interval_seconds: 0, status: "green", spinning: false,
      last_job: null,
      new_rows: null,
    },
  ],
  generated_at: "2026-04-16T09:00:00+09:00",
};

export async function applyAdminMocks(page: Page): Promise<void> {
  await page.route("**/api/admin/data-freshness", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockDataFreshness) });
  });
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
  await page.route("**/api/admin/quota-status", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockQuotaStatus) });
  });
  await page.route("**/api/admin/crawl-failures*", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockCrawlFailures) });
  });
}
