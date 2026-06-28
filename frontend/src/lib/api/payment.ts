/**
 * 유료 구독 결제 API — 결제 준비/완료 (PortOne V2 연동, PR4).
 *
 * 흐름: preparePayment → PortOne.requestPayment(브라우저 결제창) → completePayment.
 * 금액은 서버가 PLAN_PRICES 에서 결정하므로 FE 는 plan 키만 보낸다 (위변조 방지).
 * verify.ts 패턴 답습 (fetchApi + adminHeaders(token), token 첫 인자).
 */
import type {
  BillingListResponse,
  BillingPrepareResponse,
  BillingRegisterResponse,
  CompletePaymentResponse,
  PlanKey,
  PreparePaymentResponse,
} from "@/types/payment";
import { fetchApi, adminHeaders } from "./core";

/** 결제 준비 — paymentId·금액·storeId/channelKey 를 서버에서 받아온다. */
export async function preparePayment(token: string, plan: PlanKey): Promise<PreparePaymentResponse> {
  return fetchApi<PreparePaymentResponse>("/api/payment/prepare", {
    method: "POST",
    headers: { ...adminHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ plan }),
  });
}

/** 결제 완료 — 서버가 PortOne get_payment 로 PAID·금액 재검증 후 paid_until 연장 (멱등). */
export async function completePayment(token: string, paymentId: string): Promise<CompletePaymentResponse> {
  return fetchApi<CompletePaymentResponse>("/api/payment/complete", {
    method: "POST",
    headers: { ...adminHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ payment_id: paymentId }),
  });
}

// ── 빌링키 자동결제(정기결제) — BE routers/billing.py 짝꿍 (PR5) ──

/** 빌링키 발급 준비 — issueId·customer 를 받아 PortOne.requestIssueBillingKey 에 넘긴다. */
export async function prepareBilling(token: string, plan: PlanKey): Promise<BillingPrepareResponse> {
  return fetchApi<BillingPrepareResponse>("/api/payment/billing/prepare", {
    method: "POST",
    headers: { ...adminHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ plan }),
  });
}

/** 빌링키 등록 — 발급된 billingKey 를 저장 + 첫 결제 즉시 실행. */
export async function registerBilling(
  token: string,
  billingKey: string,
  plan: PlanKey,
): Promise<BillingRegisterResponse> {
  return fetchApi<BillingRegisterResponse>("/api/payment/billing/register", {
    method: "POST",
    headers: { ...adminHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ billing_key: billingKey, plan }),
  });
}

/** 내 등록 카드 목록 (active 만). */
export async function listBillingCards(token: string): Promise<BillingListResponse> {
  return fetchApi<BillingListResponse>("/api/payment/billing/list", {
    method: "GET",
    headers: adminHeaders(token),
  });
}

/** 빌링키 해지 — PortOne 삭제 + 자동결제 중단. */
export async function cancelBillingCard(token: string, billingKeyId: number): Promise<{ cancelled: boolean }> {
  return fetchApi<{ cancelled: boolean }>("/api/payment/billing/cancel", {
    method: "POST",
    headers: { ...adminHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ billing_key_id: billingKeyId }),
  });
}
