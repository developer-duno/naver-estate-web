/**
 * 관리자 대시보드 "최근 활동" 카드 회귀 가드 (PR-R1)
 * 실행: npx vitest run src/app/admin/__tests__/page.test.tsx
 *
 * 감사 로그 탭(AuditLogTable)이 이미 쓰는 admin-labels 유틸을 대시보드 카드도 써서
 * 탭 간 표기를 통일한다 — 코드 원문(admin_user_update, user:abc) 노출 금지.
 * 자식 카드 11종은 같은 @/lib/api 목으로 덮여 각자의 로딩·빈 상태로 렌더된다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";
import AdminDashboard from "../page";
import type { AuditLog, DetailedStats, PaginatedResponse } from "@/types/admin";

vi.mock("@/lib/api", () => ({
  getAdminDetailedStats: vi.fn(),
  getAdminAuditLogs: vi.fn(),
  getDataFreshness: vi.fn(),
  getAdminNaverCalls: vi.fn(),
  getAdminQuotaStatus: vi.fn(),
  getAdminCrawlFailures: vi.fn(),
  getAdminCrawlJobs: vi.fn(),
  getRecrawlStatus: vi.fn(),
  getRecrawlProgress: vi.fn(),
  runRecrawlArticles: vi.fn(),
  triggerCollection: vi.fn(),
  getAdminSchedulerStatus: vi.fn(),
  getAdminUsers: vi.fn(),
}));

vi.mock("@/hooks/useAdminQuery", () => ({
  useTokenReady: () => ({ token: "test-token", getToken: vi.fn(async () => "test-token") }),
}));

import { getAdminDetailedStats, getAdminAuditLogs } from "@/lib/api";

const mockStats = vi.mocked(getAdminDetailedStats);
const mockLogs = vi.mocked(getAdminAuditLogs);

const emptyStats: DetailedStats = {
  complex_count: 0,
  article_count: 0,
  active_article_count: 0,
  user_count: 0,
  today_crawl_count: 0,
  recent_crawl_jobs: [],
  error_count_24h: 0,
};

const mkLog = (overrides: Partial<AuditLog> = {}): AuditLog => ({
  id: 1,
  action: "admin_user_update",
  target_type: "user",
  target_id: "abc123",
  created_at: "2026-05-11T10:00:00+09:00",
  ...overrides,
});

function mkLogPage(items: AuditLog[]): PaginatedResponse<AuditLog> {
  return { items, total: items.length, page: 1, page_size: 20 };
}

function renderDashboard() {
  return render(
    <TestQueryProvider>
      <AdminDashboard />
    </TestQueryProvider>,
  );
}

describe("AdminDashboard 최근 활동", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStats.mockResolvedValue(emptyStats);
  });

  /** 정상: action·target 이 한글 라벨로 (감사 로그 탭과 동일 표기) */
  it("action·target 을 한글 라벨로 표시한다", async () => {
    mockLogs.mockResolvedValue(mkLogPage([mkLog()]));
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText("사용자 정보 수정")).toBeInTheDocument();
    });
    expect(screen.getByText(/사용자: abc123/)).toBeInTheDocument();
    // 코드 원문은 화면에 남으면 안 된다
    expect(screen.queryByText("admin_user_update")).not.toBeInTheDocument();
    expect(screen.queryByText(/user:abc123/)).not.toBeInTheDocument();
  });

  /** 경계: 미매핑 action 코드는 라벨이 없으니 코드 그대로 (안전 폴백) */
  it("미매핑 action 코드는 코드 원문 그대로 표시한다", async () => {
    mockLogs.mockResolvedValue(
      mkLogPage([mkLog({ action: "brand_new_action", target_type: undefined, target_id: undefined })]),
    );
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText("brand_new_action")).toBeInTheDocument();
    });
  });

  /** 빈 데이터: 로그 0건이면 안내 문구 */
  it("활동 기록이 없으면 안내 문구를 보여준다", async () => {
    mockLogs.mockResolvedValue(mkLogPage([]));
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText("활동 기록이 없습니다")).toBeInTheDocument();
    });
  });
});
