/**
 * AuditLogTable 컴포넌트 테스트
 * 실행: npx vitest run src/components/admin/__tests__/AuditLogTable.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";
import AuditLogTable from "../AuditLogTable";
import type { AuditLog, PaginatedResponse, UserProfile } from "@/types/admin";

vi.mock("@/lib/api", () => ({
  getAdminUsers: vi.fn(),
}));

import { getAdminUsers } from "@/lib/api";
const mockGetUsers = vi.mocked(getAdminUsers);

const baseLog = (overrides: Partial<AuditLog> = {}): AuditLog => ({
  id: 1,
  user_id: "b0da4fd4-487d-46a9-8b3b-cff07227429c",
  action: "admin_recrawl_articles",
  target_type: "batch",
  target_id: "500",
  details: { level: "safe", force: false },
  ip_address: "127.0.0.xxx",
  created_at: "2026-05-11T10:00:00+09:00",
  ...overrides,
});

const emptyUsers: PaginatedResponse<UserProfile> = {
  items: [],
  total: 0,
  page: 1,
  page_size: 20,
};

function renderTable(logs: AuditLog[], token = "test-token") {
  return render(
    <TestQueryProvider>
      <AuditLogTable logs={logs} token={token} />
    </TestQueryProvider>,
  );
}

describe("AuditLogTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUsers.mockResolvedValue(emptyUsers);
  });

  it("정상 렌더 — 액션 한글 + target 한글 + details 요약", async () => {
    renderTable([baseLog()]);
    await waitFor(() => expect(screen.getByText("매물 일괄 재수집 시작")).toBeInTheDocument());
    expect(screen.getByText("배치 500건")).toBeInTheDocument();
    expect(screen.getByText("안전")).toBeInTheDocument();
  });

  it("collector target — '수집기: 실거래가' 표시", async () => {
    renderTable([baseLog({ target_type: "collector", target_id: "backfill-price", action: "admin_collect_trigger", details: {} })]);
    await waitFor(() => expect(screen.getByText("데이터 수집 시작")).toBeInTheDocument());
    expect(screen.getByText("수집기: 실거래가")).toBeInTheDocument();
  });

  it("userMap 미로드 — UUID 앞 8자 표시", async () => {
    renderTable([baseLog()]);
    await waitFor(() => expect(screen.getByText("매물 일괄 재수집 시작")).toBeInTheDocument());
    expect(screen.getByText("b0da4fd4")).toBeInTheDocument();
  });

  it("userMap 로드 — 이메일 표시 (mockUsers u-1 답습)", async () => {
    mockGetUsers.mockResolvedValue({
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
      ],
      total: 1,
      page: 1,
      page_size: 20,
    });
    renderTable([baseLog({ user_id: "u-1" })]);
    await waitFor(() => expect(screen.getByText("admin@example.com")).toBeInTheDocument());
  });

  it("빈 로그 — '로그가 없습니다' 표시", () => {
    renderTable([]);
    expect(screen.getByText("로그가 없습니다")).toBeInTheDocument();
  });
});
