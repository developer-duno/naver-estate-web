/**
 * 회원가입 페이지 회귀 가드 (PR 7b-1 신규)
 * - 폼 렌더링
 * - 약관 미동의 시 가입 버튼 disabled
 * - 가입 성공 시 EmptyState ("가입 신청이 접수되었습니다") 표시
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mockSignUp = vi.fn();

vi.mock("@/lib/supabase", () => ({
  createClient: () => ({
    auth: {
      signUp: mockSignUp,
    },
  }),
}));

import SignupPage from "../(auth)/signup/page";

describe("SignupPage", () => {
  beforeEach(() => {
    mockSignUp.mockReset();
  });

  it("이메일·비밀번호·확인 input 과 약관 체크박스 + 가입 버튼이 렌더", () => {
    render(<SignupPage />);
    expect(screen.getByLabelText("이메일")).toBeInTheDocument();
    expect(screen.getByLabelText("비밀번호")).toBeInTheDocument();
    expect(screen.getByLabelText("비밀번호 확인")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "가입 신청" })).toBeInTheDocument();
  });

  it("약관 미동의 시 가입 버튼 disabled (data validation)", () => {
    render(<SignupPage />);
    const btn = screen.getByRole("button", { name: "가입 신청" });
    expect(btn).toBeDisabled();
  });

  it("가입 성공 시 EmptyState '가입 신청이 접수되었습니다' 표시", async () => {
    mockSignUp.mockResolvedValueOnce({ error: null });
    render(<SignupPage />);
    fireEvent.change(screen.getByLabelText("이메일"), { target: { value: "test@example.com" } });
    fireEvent.change(screen.getByLabelText("비밀번호"), { target: { value: "Strong1!@#" } });
    fireEvent.change(screen.getByLabelText("비밀번호 확인"), { target: { value: "Strong1!@#" } });
    // 약관 체크박스 (Radix Checkbox = role="checkbox" 첫 번째)
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]); // agreeTerms
    const btn = screen.getByRole("button", { name: "가입 신청" });
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    await waitFor(() => {
      expect(screen.getByText("가입 신청이 접수되었습니다")).toBeInTheDocument();
    });
  });
});
