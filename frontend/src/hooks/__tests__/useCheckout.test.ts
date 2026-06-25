/**
 * useCheckout 훅 테스트 — 결제 플로우 (prepare→requestPayment→complete, PR4)
 * 실행: npx vitest run src/hooks/__tests__/useCheckout.test.ts
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";

const preparePaymentMock = vi.fn();
const completePaymentMock = vi.fn();
const requestPaymentMock = vi.fn();

vi.mock("@/lib/api", () => ({
  preparePayment: (...a: unknown[]) => preparePaymentMock(...a),
  completePayment: (...a: unknown[]) => completePaymentMock(...a),
}));

// sonner 토스트 — 호출만 확인 (DOM 없는 훅 테스트라 mock)
const toastSuccessMock = vi.fn();
const toastInfoMock = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccessMock(...a),
    info: (...a: unknown[]) => toastInfoMock(...a),
  },
}));

vi.mock("@/lib/supabase", () => ({
  createClient: () => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: "test-token" } },
      }),
    },
  }),
}));

// PortOne SDK 동적 import 모킹 (default.requestPayment)
vi.mock("@portone/browser-sdk/v2", () => ({
  default: { requestPayment: (...a: unknown[]) => requestPaymentMock(...a) },
}));

const PREP = {
  paymentId: "pay_1",
  storeId: "store-x",
  channelKey: "channel-x",
  orderName: "기본 플랜 30일",
  amount: 49000,
  currency: "KRW",
};

describe("useCheckout 훅", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("초기 상태: paying=false, payError=빈문자열", async () => {
    const { useCheckout } = await import("../useCheckout");
    const { result } = renderHook(() => useCheckout(), { wrapper: TestQueryProvider });
    expect(result.current.paying).toBe(false);
    expect(result.current.payError).toBe("");
  });

  it("성공 플로우: prepare → requestPayment → complete 순서로 호출하고 결과 반환", async () => {
    preparePaymentMock.mockResolvedValue(PREP);
    requestPaymentMock.mockResolvedValue({ transactionType: "PAYMENT", txId: "tx_1", paymentId: "pay_1" });
    completePaymentMock.mockResolvedValue({ paid_until: "2026-07-24T00:00:00+00:00", plan: "basic_30d", already_paid: false });

    const { useCheckout } = await import("../useCheckout");
    const { result } = renderHook(() => useCheckout(), { wrapper: TestQueryProvider });

    let res: unknown;
    await act(async () => {
      res = await result.current.startCheckout("basic_30d");
    });

    expect(preparePaymentMock).toHaveBeenCalledWith("test-token", "basic_30d");
    // requestPayment 에 서버 결정 금액(totalAmount)·paymentId 전달 확인 (위변조 방지 핵심)
    expect(requestPaymentMock).toHaveBeenCalledWith(
      expect.objectContaining({ paymentId: "pay_1", totalAmount: 49000, currency: "CURRENCY_KRW" }),
    );
    expect(completePaymentMock).toHaveBeenCalledWith("test-token", "pay_1");
    expect(res).toMatchObject({ plan: "basic_30d", already_paid: false });
  });

  it("결제 실패(response.code 존재): complete 호출 안 하고 null 반환 + payError 설정", async () => {
    preparePaymentMock.mockResolvedValue(PREP);
    requestPaymentMock.mockResolvedValue({ code: "PAY_PROCESS_CANCELED", message: "사용자 취소" });

    const { useCheckout } = await import("../useCheckout");
    const { result } = renderHook(() => useCheckout(), { wrapper: TestQueryProvider });

    let res: unknown = "init";
    await act(async () => {
      res = await result.current.startCheckout("basic_30d");
    });

    expect(completePaymentMock).not.toHaveBeenCalled();
    expect(res).toBeNull();
    await waitFor(() => expect(result.current.payError).toBe("사용자 취소"));
  });

  it("결제창 취소(undefined 반환): complete 호출 안 하고 null 반환", async () => {
    preparePaymentMock.mockResolvedValue(PREP);
    requestPaymentMock.mockResolvedValue(undefined);

    const { useCheckout } = await import("../useCheckout");
    const { result } = renderHook(() => useCheckout(), { wrapper: TestQueryProvider });

    let res: unknown = "init";
    await act(async () => {
      res = await result.current.startCheckout("basic_30d");
    });

    expect(completePaymentMock).not.toHaveBeenCalled();
    expect(res).toBeNull();
  });

  it("prepare 실패(503 등): requestPayment 호출 안 하고 payError 설정", async () => {
    preparePaymentMock.mockRejectedValue(new Error("결제 서비스가 설정되지 않았습니다"));

    const { useCheckout } = await import("../useCheckout");
    const { result } = renderHook(() => useCheckout(), { wrapper: TestQueryProvider });

    let res: unknown = "init";
    await act(async () => {
      res = await result.current.startCheckout("basic_30d");
    });

    expect(requestPaymentMock).not.toHaveBeenCalled();
    expect(res).toBeNull();
    await waitFor(() => expect(result.current.payError).toBe("결제 서비스가 설정되지 않았습니다"));
  });

  it("409(정산 지연): 실패가 아니라 '잠시 후 반영' 안내 + info 토스트", async () => {
    const { ApiError } = await import("@/lib/api/core");
    preparePaymentMock.mockResolvedValue(PREP);
    requestPaymentMock.mockResolvedValue({ transactionType: "PAYMENT", txId: "tx_1", paymentId: "pay_1" });
    completePaymentMock.mockRejectedValue(new ApiError("아직 처리중", 409));

    const { useCheckout } = await import("../useCheckout");
    const { result } = renderHook(() => useCheckout(), { wrapper: TestQueryProvider });

    await act(async () => {
      await result.current.startCheckout("basic_30d");
    });

    // 409 는 일반 실패 메시지가 아니라 '접수됨, 잠시 후 반영' 안내 + info 토스트
    await waitFor(() => expect(result.current.payError).toContain("잠시 후"));
    expect(toastInfoMock).toHaveBeenCalled();
  });

  it("결제 성공 시 success 토스트(이용권 만료일 안내) 발사", async () => {
    preparePaymentMock.mockResolvedValue(PREP);
    requestPaymentMock.mockResolvedValue({ transactionType: "PAYMENT", txId: "tx_1", paymentId: "pay_1" });
    completePaymentMock.mockResolvedValue({ paid_until: "2026-07-24T00:00:00+00:00", plan: "basic_30d", already_paid: false });

    const { useCheckout } = await import("../useCheckout");
    const { result } = renderHook(() => useCheckout(), { wrapper: TestQueryProvider });

    await act(async () => {
      await result.current.startCheckout("basic_30d");
    });

    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalled());
  });
});
