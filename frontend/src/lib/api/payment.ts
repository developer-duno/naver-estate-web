/**
 * 유료 구독 결제 API — 결제 준비/완료 (PortOne V2 연동, PR4).
 *
 * 흐름: preparePayment → PortOne.requestPayment(브라우저 결제창) → completePayment.
 * 금액은 서버가 PLAN_PRICES 에서 결정하므로 FE 는 plan 키만 보낸다 (위변조 방지).
 * verify.ts 패턴 답습 (fetchApi + adminHeaders(token), token 첫 인자).
 */
import type { CompletePaymentResponse, PlanKey, PreparePaymentResponse } from "@/types/payment";
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
