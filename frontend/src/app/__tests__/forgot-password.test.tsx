/**
 * 비밀번호 재설정 페이지 회귀 가드 (PR 7b-1 신규)
 * - 폼 렌더링
 * - 발송 성공 시 EmptyState ("재설정 링크 발송 요청 완료") + footnote 표시
 * - 60초 보안 차단 시 한국어 카피
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mockReset = vi.fn();

vi.mock("@/lib/supabase", () => ({
  createClient: () => ({
    auth: {
      resetPasswordForEmail: mockReset,
    },
  }),
}));

import ForgotPasswordPage from "../(auth)/forgot-password/page";

describe("ForgotPasswordPage", () => {
  beforeEach(() => {
    mockReset.mockReset();
  });

  it("이메일 input 과 재설정 링크 버튼이 렌더", () => {
    render(<ForgotPasswordPage />);
    expect(screen.getByLabelText("이메일")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "재설정 링크 보내기" })).toBeInTheDocument();
  });

  it("발송 성공 시 EmptyState 와 보안 footnote 표시", async () => {
    mockReset.mockResolvedValueOnce({ error: null });
    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByLabelText("이메일"), { target: { value: "test@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "재설정 링크 보내기" }));
    await waitFor(() => {
      expect(screen.getByText("재설정 링크를 보냈어요")).toBeInTheDocument();
    });
    // 보안 footnote (정직성 카피)
    expect(
      screen.getByText(/등록된 이메일이면 메일이 도착합니다/),
    ).toBeInTheDocument();
  });

  it("60초 보안 차단 시 한국어 카피로 번역", async () => {
    mockReset.mockResolvedValueOnce({
      error: {
        message: "For security purposes, you can only request this after 60 seconds.",
      },
    });
    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByLabelText("이메일"), { target: { value: "test@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "재설정 링크 보내기" }));
    await waitFor(() => {
      expect(
        screen.getByText(/보안상 60초 후에 다시 요청할 수 있습니다/),
      ).toBeInTheDocument();
    });
  });
});
