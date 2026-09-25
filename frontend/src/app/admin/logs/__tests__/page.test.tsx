/**
 * /admin/logs 페이지 — 필터 줄이 기록 목록 카드 머리로 들어갔는지 (관리자 화면 리뉴얼 A4)
 * 실행: npx vitest run src/app/admin/logs/__tests__/page.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";

vi.mock("@/lib/api", () => ({
  getAdminAuditLogs: vi.fn(),
  getAdminUsers: vi.fn(),
}));

vi.mock("@/hooks/useAdminQuery", () => ({
  useTokenReady: () => ({ token: "test-token", getToken: vi.fn(async () => "test-token") }),
}));

import { getAdminAuditLogs, getAdminUsers } from "@/lib/api";
import AdminLogsPage from "../page";

const mockLogs = vi.mocked(getAdminAuditLogs);
const mockUsers = vi.mocked(getAdminUsers);

function renderPage() {
  return render(
    <TestQueryProvider>
      <AdminLogsPage />
    </TestQueryProvider>,
  );
}

describe("/admin/logs", () => {
  beforeEach(() => {
    mockLogs.mockReset();
    mockUsers.mockReset();
    mockUsers.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 20 });
    mockLogs.mockResolvedValue({
      items: [
        {
          id: 1,
          user_id: "u1",
          action: "admin_setting_update",
          target_type: "batch",
          target_id: "500",
          created_at: "2026-09-25T00:00:00Z",
        },
      ],
      total: 1,
      page: 1,
      page_size: 50,
    });
  });

  it("필터(한 일·사용자)와 표가 '기록 목록' 카드 안에 있다", async () => {
    renderPage();
    const heading = await screen.findByRole("heading", { name: /기록 목록 \(총 1건\)/ });
    const card = heading.closest("div.bg-white") as HTMLElement;
    expect(card).toContainElement(screen.getByLabelText("한 일로 거르기"));
    expect(card).toContainElement(screen.getByLabelText("사용자로 거르기"));
    expect(card).toContainElement(await screen.findByRole("columnheader", { name: "한 일" }));
    // 개발자 말 "액션" 이 화면에 남지 않는다
    expect(screen.queryByText(/액션/)).not.toBeInTheDocument();
    expect(screen.getByText("일괄 작업 500건")).toBeInTheDocument();
  });

  it("한 일로 거르면 그 값으로 다시 부른다", async () => {
    renderPage();
    await screen.findByRole("heading", { name: /기록 목록/ });
    fireEvent.change(screen.getByLabelText("한 일로 거르기"), { target: { value: "admin_setting_update" } });
    await waitFor(() =>
      expect(mockLogs).toHaveBeenLastCalledWith("test-token", {
        action: "admin_setting_update",
        user_id: undefined,
        page: 1,
      }),
    );
  });
});
