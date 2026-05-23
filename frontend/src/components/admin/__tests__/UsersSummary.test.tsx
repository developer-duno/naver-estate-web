/**
 * UsersSummary 컴포넌트 테스트 — /admin/users 최상단 한 줄 요약
 * 실행: npx vitest run src/components/admin/__tests__/UsersSummary.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";
import UsersSummary from "../UsersSummary";
import type { AgentVerification, UserProfile, PaginatedResponse } from "@/types/admin";

vi.mock("@/lib/api", () => ({
  getAdminVerifications: vi.fn(),
  getAdminUsers: vi.fn(),
}));

import { getAdminVerifications, getAdminUsers } from "@/lib/api";
const mockVerif = vi.mocked(getAdminVerifications);
const mockUsers = vi.mocked(getAdminUsers);

function renderSummary(token = "test-token") {
  return render(
    <TestQueryProvider>
      <UsersSummary token={token} />
    </TestQueryProvider>,
  );
}

function mkVerifResponse(total: number): PaginatedResponse<AgentVerification> {
  return { items: [], total, page: 1, page_size: 20 };
}

function mkUserResponse(total: number): PaginatedResponse<UserProfile> {
  return { items: [], total, page: 1, page_size: 20 };
}

function mockRoles(users: number, experts: number, admins: number) {
  mockUsers.mockImplementation(async (_t, params) => {
    if (params?.role === "user") return mkUserResponse(users);
    if (params?.role === "expert") return mkUserResponse(experts);
    if (params?.role === "admin") return mkUserResponse(admins);
    return mkUserResponse(0);
  });
}

describe("UsersSummary", () => {
  it("심사 대기 = 0 일 때 흰 배경 + div (클릭 비활성)", async () => {
    mockVerif.mockResolvedValue(mkVerifResponse(0));
    mockRoles(120, 5, 2);

    const { container } = renderSummary();
    await waitFor(() => {
      expect(screen.getByText(/심사 대기 0건/)).toBeInTheDocument();
    });
    expect(container.querySelector("button")).toBeNull();
    const root = container.querySelector("[aria-label='사용자 상태 요약']");
    expect(root?.tagName.toLowerCase()).toBe("div");
    expect(root?.className).toContain("bg-white");
  });

  it("심사 대기 > 0 일 때 amber 배경 + button + 강조 텍스트", async () => {
    mockVerif.mockResolvedValue(mkVerifResponse(3));
    mockRoles(100, 4, 2);

    const { container } = renderSummary();
    await waitFor(() => {
      expect(screen.getByText(/심사 대기 3건/)).toBeInTheDocument();
    });
    const button = container.querySelector("button");
    expect(button).toBeTruthy();
    expect(button?.className).toContain("bg-amber-50");
    expect(screen.getByText(/심사 대기 3건/).className).toContain("font-medium");
  });

  it("pending > 0 클릭 시 scrollIntoView 호출", async () => {
    mockVerif.mockResolvedValue(mkVerifResponse(2));
    mockRoles(50, 1, 1);

    const target = document.createElement("div");
    target.id = "verification-review";
    const scrollSpy = vi.fn();
    target.scrollIntoView = scrollSpy;
    document.body.appendChild(target);

    renderSummary();
    await waitFor(() => {
      expect(screen.getByText(/심사 대기 2건/)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button"));
    expect(scrollSpy).toHaveBeenCalled();

    document.body.removeChild(target);
  });

  it("역할 비율(일반/전문가/관리자) 카운트가 표시된다", async () => {
    mockVerif.mockResolvedValue(mkVerifResponse(0));
    mockRoles(120, 8, 2);

    renderSummary();
    await waitFor(() => {
      expect(screen.getByText(/일반 120/)).toBeInTheDocument();
    });
    expect(screen.getByText(/전문가 8/)).toBeInTheDocument();
    expect(screen.getByText(/관리자 2/)).toBeInTheDocument();
  });

  it("로딩 중에는 회색 placeholder 표시", () => {
    mockVerif.mockImplementation(() => new Promise(() => { /* never */ }));
    mockUsers.mockImplementation(() => new Promise(() => { /* never */ }));
    const { container } = renderSummary();
    const placeholder = container.querySelector("[aria-label='사용자 요약 로딩 중']");
    expect(placeholder).toBeTruthy();
    expect(placeholder?.className).toContain("animate-pulse");
  });

  it("isError 일 때 빨간 에러 박스 + role=alert (영구 스켈레톤 차단)", async () => {
    // BE 다운 가정 — verif·users 모두 reject
    mockVerif.mockRejectedValue(new Error("backend down"));
    mockUsers.mockRejectedValue(new Error("backend down"));

    renderSummary();
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("사용자 요약을 불러오지 못했습니다.");
    });
    expect(screen.getByRole("alert").className).toContain("bg-red-50");
  });
});
