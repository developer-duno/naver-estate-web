/**
 * payment 래퍼 에러 전파 가드 (PR4) — preparePayment/completePayment 가 실패를 삼키면
 * 결제 실패가 사용자에게 "성공처럼" 보이거나 결제 UI 의 에러 분기가 dead code 가 된다
 * (error-propagation.md §3 — 래퍼 레벨 MSW 가드 의무).
 * vi.mock("@/lib/api") 컴포넌트 테스트는 래퍼를 우회하므로 5xx reject 를 절대 못 잡는다 →
 * 본 래퍼 레벨 MSW 가드가 필수.
 * 실행: npx vitest run src/lib/__tests__/payment-error.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

const API = "http://test-api:8000";

const server = setupServer(
  http.post(`${API}/api/payment/prepare`, async ({ request }) => {
    const body = (await request.json()) as { plan?: string };
    if (body.plan === "ERR") {
      return HttpResponse.json({ detail: "Server error" }, { status: 500 });
    }
    return HttpResponse.json({
      paymentId: "pay_test",
      storeId: "store-x",
      channelKey: "channel-x",
      orderName: "기본 플랜 30일",
      amount: 49000,
      currency: "KRW",
    });
  }),
  http.post(`${API}/api/payment/complete`, async ({ request }) => {
    const body = (await request.json()) as { payment_id?: string };
    if (body.payment_id === "pay_err") {
      return HttpResponse.json({ detail: "Server error" }, { status: 500 });
    }
    return HttpResponse.json({ paid_until: "2026-07-24T00:00:00+00:00", plan: "basic_30d", already_paid: false });
  }),
  // 빌링키 4함수 (PR5/6) — error-propagation.md §3 래퍼 가드. 전부 500 응답.
  http.post(`${API}/api/payment/billing/prepare`, () =>
    HttpResponse.json({ detail: "Server error" }, { status: 500 })),
  http.post(`${API}/api/payment/billing/register`, () =>
    HttpResponse.json({ detail: "Server error" }, { status: 500 })),
  http.get(`${API}/api/payment/billing/list`, () =>
    HttpResponse.json({ detail: "Server error" }, { status: 500 })),
  http.post(`${API}/api/payment/billing/cancel`, () =>
    HttpResponse.json({ detail: "Server error" }, { status: 500 })),
);

// HAS_BACKEND 가 core.ts 모듈 로드 시점 상수라 env 스텁 후 fresh import 필수
let payment: typeof import("@/lib/api/payment");

beforeAll(async () => {
  vi.stubEnv("NEXT_PUBLIC_API_URL", API);
  vi.resetModules();
  payment = await import("@/lib/api/payment");
  server.listen({ onUnhandledRequest: "bypass" });
});

afterEach(() => server.resetHandlers());

afterAll(() => {
  server.close();
  vi.unstubAllEnvs();
});

describe("payment 래퍼 — 실패 시 reject (삼킴 방지)", () => {
  it("preparePayment: 500 이면 reject 한다", async () => {
    await expect(payment.preparePayment("tok", "ERR" as never)).rejects.toThrow();
  });

  it("completePayment: 500 이면 reject 한다", async () => {
    await expect(payment.completePayment("tok", "pay_err")).rejects.toThrow();
  });

  it("preparePayment: 정상 응답을 그대로 반환한다 (paymentId·amount)", async () => {
    await expect(payment.preparePayment("tok", "basic_30d")).resolves.toMatchObject({
      paymentId: "pay_test",
      amount: 49000,
    });
  });

  it("completePayment: 정상 응답을 그대로 반환한다 (paid_until)", async () => {
    await expect(payment.completePayment("tok", "pay_test")).resolves.toMatchObject({
      plan: "basic_30d",
      already_paid: false,
    });
  });

  // 빌링키 4함수 (PR5/6) — 5xx → reject 단언 (error-propagation.md §3 래퍼당 1건 의무).
  it("prepareBilling: 500 이면 reject 한다", async () => {
    await expect(payment.prepareBilling("tok", "pro_30d" as never)).rejects.toThrow();
  });

  it("registerBilling: 500 이면 reject 한다", async () => {
    await expect(payment.registerBilling("tok", "bk_x", "pro_30d" as never)).rejects.toThrow();
  });

  it("listBillingCards: 500 이면 reject 한다", async () => {
    await expect(payment.listBillingCards("tok")).rejects.toThrow();
  });

  it("cancelBillingCard: 500 이면 reject 한다", async () => {
    await expect(payment.cancelBillingCard("tok", 1)).rejects.toThrow();
  });
});
