/**
 * CheckoutButton 테스트 — 로그인 분기 + 결제 버튼 동작 (PR4)
 * 실행: npx vitest run src/app/pricing/__tests__/CheckoutButton.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const useSessionTokenMock = vi.fn();
const startCheckoutMock = vi.fn();
const useCheckoutMock = vi.fn();

vi.mock("@/hooks/useSessionToken", () => ({
  useSessionToken: () => useSessionTokenMock(),
}));
vi.mock("@/hooks/useCheckout", () => ({
  useCheckout: () => useCheckoutMock(),
}));

import CheckoutButton from "../CheckoutButton";

describe("CheckoutButton — 로그인 분기", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCheckoutMock.mockReturnValue({
      paying: false,
      payError: "",
      clearPayError: vi.fn(),
      startCheckout: startCheckoutMock,
    });
  });

  it("비로그인: '무료 체험 시작' /signup 링크 노출 (결제 버튼 없음)", () => {
    useSessionTokenMock.mockReturnValue({ sessionToken: undefined, tokenReady: true, tokenError: false, dismissTokenError: vi.fn() });
    render(<CheckoutButton planKey="basic_30d" />);
    const link = screen.getByRole("link", { name: "무료 체험 시작" });
    expect(link).toHaveAttribute("href", "/signup");
    expect(screen.queryByRole("button", { name: /결제하고 시작/ })).not.toBeInTheDocument();
  });

  it("토큰 해석 전(tokenReady=false): 깜빡임 방지 위해 무료 체험 링크 기본 노출", () => {
    useSessionTokenMock.mockReturnValue({ sessionToken: undefined, tokenReady: false, tokenError: false, dismissTokenError: vi.fn() });
    render(<CheckoutButton planKey="basic_30d" />);
    expect(screen.getByRole("link", { name: "무료 체험 시작" })).toBeInTheDocument();
  });

  it("로그인: '결제하고 시작' 버튼 노출 + 클릭 시 startCheckout(planKey) 호출", () => {
    useSessionTokenMock.mockReturnValue({ sessionToken: "tok", tokenReady: true, tokenError: false, dismissTokenError: vi.fn() });
    render(<CheckoutButton planKey="pro_30d" />);
    const btn = screen.getByRole("button", { name: "결제하고 시작" });
    fireEvent.click(btn);
    expect(startCheckoutMock).toHaveBeenCalledWith("pro_30d");
  });

  it("결제 진행 중(paying): 버튼 비활성 + '결제 진행 중…' 표시", () => {
    useSessionTokenMock.mockReturnValue({ sessionToken: "tok", tokenReady: true, tokenError: false, dismissTokenError: vi.fn() });
    useCheckoutMock.mockReturnValue({ paying: true, payError: "", clearPayError: vi.fn(), startCheckout: startCheckoutMock });
    render(<CheckoutButton planKey="basic_30d" />);
    const btn = screen.getByRole("button", { name: "결제 진행 중…" });
    expect(btn).toBeDisabled();
  });

  it("payError 존재: 에러 메시지를 alert 로 노출", () => {
    useSessionTokenMock.mockReturnValue({ sessionToken: "tok", tokenReady: true, tokenError: false, dismissTokenError: vi.fn() });
    useCheckoutMock.mockReturnValue({ paying: false, payError: "결제 서비스가 설정되지 않았습니다", clearPayError: vi.fn(), startCheckout: startCheckoutMock });
    render(<CheckoutButton planKey="basic_30d" />);
    expect(screen.getByRole("alert")).toHaveTextContent("결제 서비스가 설정되지 않았습니다");
  });
});
