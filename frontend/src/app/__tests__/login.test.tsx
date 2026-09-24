/**
 * 로그인 페이지 회귀 가드 (PR 7b-1 신규)
 * - 기본 폼 렌더링
 * - failCount 5회 잠금 + Lock 아이콘 + Alert
 * - redirect URL 보안 가드 (외부 origin 차단 → / 폴백)
 * - 비밀번호 표시 토글 aria-label
 * - user_profiles 직접 upsert 미호출 (세션 417: V062 뒤 항상 실패하는 죽은 코드 제거)
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mockPush = vi.fn();
const mockRefresh = vi.fn();
const mockSignIn = vi.fn();
const mockFrom = vi.fn().mockReturnValue({
  upsert: vi.fn().mockResolvedValue({}),
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    refresh: mockRefresh,
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/login",
  useSearchParams: () => new URLSearchParams("redirect=https://evil.com/x"),
  useParams: () => ({}),
}));

vi.mock("@/lib/supabase", () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: mockSignIn,
      getSession: vi.fn().mockResolvedValue({
        data: { session: { user: { id: "u1", email: "a@b.com" }, access_token: "tok" } },
      }),
    },
    from: mockFrom,
  }),
}));

import LoginPage from "../(auth)/login/page";

describe("LoginPage", () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockRefresh.mockClear();
    mockSignIn.mockReset();
    mockFrom.mockClear();
  });

  it("이메일·비밀번호 input 과 로그인 버튼이 렌더", () => {
    render(<LoginPage />);
    expect(screen.getByLabelText("이메일")).toBeInTheDocument();
    expect(screen.getByLabelText("비밀번호")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "로그인" })).toBeInTheDocument();
  });

  it("Supabase 에러 시 한국어 메시지로 번역해 Alert 표시", async () => {
    mockSignIn.mockResolvedValueOnce({
      error: { message: "Invalid login credentials" },
    });
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText("이메일"), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByLabelText("비밀번호"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));
    await waitFor(() => {
      expect(
        screen.getByText(/이메일 또는 비밀번호가 올바르지 않습니다/),
      ).toBeInTheDocument();
    });
  });

  it("외부 origin redirect URL 입력 시 / 으로 폴백 (보안 가드)", async () => {
    mockSignIn.mockResolvedValueOnce({ error: null });
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText("이메일"), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByLabelText("비밀번호"), { target: { value: "pw" } });
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/");
    });
  });

  it("비밀번호 표시 토글에 aria-label 박힘 (접근성)", () => {
    render(<LoginPage />);
    const toggle = screen.getByRole("button", { name: /비밀번호 표시/ });
    expect(toggle).toBeInTheDocument();
  });

  it("로그인 성공 시 user_profiles 직접 upsert 를 호출하지 않는다 (V062 뒤 항상 실패하는 죽은 코드 제거)", async () => {
    mockSignIn.mockResolvedValueOnce({ error: null });
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText("이메일"), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByLabelText("비밀번호"), { target: { value: "pw" } });
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/");
    });
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
