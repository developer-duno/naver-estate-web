/**
 * useBillingKey 훅 테스트 — 자동결제 카드 등록 (prepareBilling→requestIssueBillingKey→registerBilling, PR5)
 * 실행: npx vitest run src/hooks/__tests__/useBillingKey.test.ts
 * useCheckout.test.ts 패턴 답습 (api·sonner·supabase·PortOne SDK mock).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";

const prepareBillingMock = vi.fn();
const registerBillingMock = vi.fn();
const requestIssueBillingKeyMock = vi.fn();

vi.mock("@/lib/api", () => ({
  prepareBilling: (...a: unknown[]) => prepareBillingMock(...a),
  registerBilling: (...a: unknown[]) => registerBillingMock(...a),
}));

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

// PortOne SDK 동적 import 모킹 (default.requestIssueBillingKey)
vi.mock("@portone/browser-sdk/v2", () => ({
  default: { requestIssueBillingKey: (...a: unknown[]) => requestIssueBillingKeyMock(...a) },
}));

const PREP = {
  issueId: "i_1",
  storeId: "store-x",
  channelKey: "channel-x",
  issueName: "월간 이용권 30일",
  customer: { name: "홍길동", phone: "01012345678" },
};

describe("useBillingKey 훅", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("초기 상태: registering=false, regError=빈문자열", async () => {
    const { useBillingKey } = await import("../useBillingKey");
    const { result } = renderHook(() => useBillingKey(), { wrapper: TestQueryProvider });
    expect(result.current.registering).toBe(false);
    expect(result.current.regError).toBe("");
  });

  it("성공: prepare → requestIssueBillingKey → register 순서 + customer(fullName/phoneNumber) 전달", async () => {
    prepareBillingMock.mockResolvedValue(PREP);
    requestIssueBillingKeyMock.mockResolvedValue({ billingKey: "bk_abc" });
    registerBillingMock.mockResolvedValue({ paid_until: "2026-08-01T00:00:00+00:00", plan: "pro_30d", billing_registered: true });

    const { useBillingKey } = await import("../useBillingKey");
    const { result } = renderHook(() => useBillingKey(), { wrapper: TestQueryProvider });

    let res: unknown;
    await act(async () => {
      res = await result.current.startBilling("pro_30d");
    });

    expect(prepareBillingMock).toHaveBeenCalledWith("test-token", "pro_30d");
    // KPN 빌링키 발급에 billingKeyMethod=CARD + customer.fullName(대표자명) 전달 확인
    expect(requestIssueBillingKeyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        billingKeyMethod: "CARD",
        issueId: "i_1",
        customer: expect.objectContaining({ fullName: "홍길동", phoneNumber: "01012345678" }),
      }),
    );
    expect(registerBillingMock).toHaveBeenCalledWith("test-token", "bk_abc", "pro_30d");
    expect(res).toMatchObject({ billing_registered: true });
  });

  it("발급 취소(code 존재): register 호출 안 하고 null + regError", async () => {
    prepareBillingMock.mockResolvedValue(PREP);
    requestIssueBillingKeyMock.mockResolvedValue({ code: "ISSUE_CANCELED", message: "카드 등록 취소" });

    const { useBillingKey } = await import("../useBillingKey");
    const { result } = renderHook(() => useBillingKey(), { wrapper: TestQueryProvider });

    let res: unknown = "init";
    await act(async () => {
      res = await result.current.startBilling("pro_30d");
    });

    expect(registerBillingMock).not.toHaveBeenCalled();
    expect(res).toBeNull();
    await waitFor(() => expect(result.current.regError).toBe("카드 등록 취소"));
  });

  it("발급창 취소(undefined): register 호출 안 함", async () => {
    prepareBillingMock.mockResolvedValue(PREP);
    requestIssueBillingKeyMock.mockResolvedValue(undefined);

    const { useBillingKey } = await import("../useBillingKey");
    const { result } = renderHook(() => useBillingKey(), { wrapper: TestQueryProvider });

    let res: unknown = "init";
    await act(async () => {
      res = await result.current.startBilling("pro_30d");
    });

    expect(registerBillingMock).not.toHaveBeenCalled();
    expect(res).toBeNull();
  });

  it("prepare 실패(검증 미완료 400): requestIssueBillingKey 호출 안 함 + regError", async () => {
    prepareBillingMock.mockRejectedValue(new Error("공인중개사 검증을 먼저 완료해주세요"));

    const { useBillingKey } = await import("../useBillingKey");
    const { result } = renderHook(() => useBillingKey(), { wrapper: TestQueryProvider });

    await act(async () => {
      await result.current.startBilling("pro_30d");
    });

    expect(requestIssueBillingKeyMock).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.regError).toBe("공인중개사 검증을 먼저 완료해주세요"));
  });

  it("409(정산 지연): 실패 아님 — '잠시 후 반영' 안내 + info 토스트", async () => {
    const { ApiError } = await import("@/lib/api/core");
    prepareBillingMock.mockResolvedValue(PREP);
    requestIssueBillingKeyMock.mockResolvedValue({ billingKey: "bk_abc" });
    registerBillingMock.mockRejectedValue(new ApiError("결제 확인 지연", 409));

    const { useBillingKey } = await import("../useBillingKey");
    const { result } = renderHook(() => useBillingKey(), { wrapper: TestQueryProvider });

    await act(async () => {
      await result.current.startBilling("pro_30d");
    });

    await waitFor(() => expect(result.current.regError).toContain("잠시 후"));
    expect(toastInfoMock).toHaveBeenCalled();
  });

  it("등록 성공 시 success 토스트 발사", async () => {
    prepareBillingMock.mockResolvedValue(PREP);
    requestIssueBillingKeyMock.mockResolvedValue({ billingKey: "bk_abc" });
    registerBillingMock.mockResolvedValue({ paid_until: "2026-08-01T00:00:00+00:00", plan: "pro_30d", billing_registered: true });

    const { useBillingKey } = await import("../useBillingKey");
    const { result } = renderHook(() => useBillingKey(), { wrapper: TestQueryProvider });

    await act(async () => {
      await result.current.startBilling("pro_30d");
    });

    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalled());
  });
});
