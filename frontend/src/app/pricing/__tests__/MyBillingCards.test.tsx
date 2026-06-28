/**
 * MyBillingCards 테스트 — 내 자동결제 카드 표시 + 해지 (PR6)
 * 실행: npx vitest run src/app/pricing/__tests__/MyBillingCards.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";

const listBillingCardsMock = vi.fn();
const cancelBillingCardMock = vi.fn();

vi.mock("@/lib/api", () => ({
  listBillingCards: (...a: unknown[]) => listBillingCardsMock(...a),
  cancelBillingCard: (...a: unknown[]) => cancelBillingCardMock(...a),
}));

const useSessionTokenMock = vi.fn();
vi.mock("@/hooks/useSessionToken", () => ({
  useSessionToken: () => useSessionTokenMock(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import MyBillingCards from "../MyBillingCards";

const CARD = {
  id: 7,
  plan: "pro_30d",
  card_name: "신한카드",
  card_last4: "1234",
  is_default: true,
  next_charge_at: "2026-08-01T00:00:00+00:00",
};

describe("MyBillingCards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSessionTokenMock.mockReturnValue({ sessionToken: "tok", tokenReady: true });
  });

  it("비로그인이면 아무것도 렌더 안 함", () => {
    useSessionTokenMock.mockReturnValue({ sessionToken: undefined, tokenReady: true });
    const { container } = render(<MyBillingCards />, { wrapper: TestQueryProvider });
    expect(container.firstChild).toBeNull();
  });

  it("카드 없으면 섹션 미표시", async () => {
    listBillingCardsMock.mockResolvedValue({ cards: [] });
    const { container } = render(<MyBillingCards />, { wrapper: TestQueryProvider });
    await waitFor(() => expect(listBillingCardsMock).toHaveBeenCalled());
    expect(container.querySelector("section")).toBeNull();
  });

  it("카드 있으면 카드사·끝4자리·다음결제일·자동결제 뱃지 표시", async () => {
    listBillingCardsMock.mockResolvedValue({ cards: [CARD] });
    render(<MyBillingCards />, { wrapper: TestQueryProvider });
    expect(await screen.findByText(/신한카드/)).toBeInTheDocument();
    expect(screen.getByText(/1234/)).toBeInTheDocument();
    expect(screen.getByText("자동결제")).toBeInTheDocument();
    expect(screen.getByText(/다음 결제 예정/)).toBeInTheDocument();
  });

  it("해지는 2단계 — '해지' 클릭 후 '해지 확인' 클릭 시 cancelBillingCard 호출", async () => {
    listBillingCardsMock.mockResolvedValue({ cards: [CARD] });
    cancelBillingCardMock.mockResolvedValue({ cancelled: true });
    render(<MyBillingCards />, { wrapper: TestQueryProvider });

    fireEvent.click(await screen.findByRole("button", { name: "해지" }));
    // 1단계론 호출 안 됨 (확인 필요)
    expect(cancelBillingCardMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "해지 확인" }));
    await waitFor(() => expect(cancelBillingCardMock).toHaveBeenCalledWith("tok", 7));
  });

  it("'해지' 후 '취소' 누르면 해지 안 함", async () => {
    listBillingCardsMock.mockResolvedValue({ cards: [CARD] });
    render(<MyBillingCards />, { wrapper: TestQueryProvider });

    fireEvent.click(await screen.findByRole("button", { name: "해지" }));
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(cancelBillingCardMock).not.toHaveBeenCalled();
    // 다시 '해지' 버튼으로 복귀
    expect(screen.getByRole("button", { name: "해지" })).toBeInTheDocument();
  });
});
