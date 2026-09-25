/**
 * /admin/users 페이지 — 필터가 사용자 목록 카드 머리로 들어갔는지 (관리자 화면 리뉴얼 A4)
 * 실행: npx vitest run src/app/admin/users/__tests__/page.test.tsx
 * 요약 카드·검증 심사 카드는 각자 테스트가 있어 여기선 가짜로 바꾼다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";

vi.mock("@/lib/api", () => ({
  getAdminUsers: vi.fn(),
  updateAdminUser: vi.fn(),
}));

vi.mock("@/hooks/useAdminQuery", () => ({
  useTokenReady: () => ({ token: "test-token", getToken: vi.fn(async () => "test-token") }),
}));

vi.mock("@/components/admin/UsersSummary", () => ({ default: () => null }));
vi.mock("@/components/admin/VerificationReview", () => ({ default: () => null }));

import { getAdminUsers } from "@/lib/api";
import AdminUsersPage from "../page";

const mockUsers = vi.mocked(getAdminUsers);

function renderPage() {
  return render(
    <TestQueryProvider>
      <AdminUsersPage />
    </TestQueryProvider>,
  );
}

describe("/admin/users", () => {
  beforeEach(() => {
    mockUsers.mockReset();
    mockUsers.mockResolvedValue({
      items: [
        {
          user_id: "u1",
          email: "admin@example.com",
          role: "admin",
          status: "approved",
          daily_crawl_quota: 100,
          daily_export_quota: 10,
          login_count: 3,
          created_at: "2026-08-01T00:00:00Z",
        },
      ],
      total: 1,
      page: 1,
      page_size: 20,
    });
  });

  it("따로 떨어진 '필터' 카드가 없고, 역할·상태 필터가 사용자 목록 카드 머리에 있다", async () => {
    renderPage();
    const heading = await screen.findByRole("heading", { name: /사용자 목록 \(총 1명\)/ });
    expect(screen.queryByRole("heading", { name: "필터" })).not.toBeInTheDocument();
    const card = heading.closest("div.bg-white") as HTMLElement;
    expect(card).toContainElement(screen.getByLabelText("역할로 거르기"));
    expect(card).toContainElement(screen.getByLabelText("상태로 거르기"));
    // e2e 는 "첫 combobox" 를 찾는다 — 카드 머리의 역할 필터가 첫 번째다
    expect(screen.getAllByRole("combobox")[0]).toBe(screen.getByLabelText("역할로 거르기"));
  });

  it("상태로 거르면 그 값으로 다시 부른다", async () => {
    renderPage();
    await screen.findByRole("heading", { name: /사용자 목록/ });
    fireEvent.change(screen.getByLabelText("상태로 거르기"), { target: { value: "suspended" } });
    await waitFor(() =>
      expect(mockUsers).toHaveBeenLastCalledWith("test-token", {
        role: undefined,
        status: "suspended",
        page: 1,
      }),
    );
  });
});
