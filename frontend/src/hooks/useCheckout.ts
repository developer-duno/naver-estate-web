/**
 * useCheckout 훅 — 유료 구독 결제 플로우 (PortOne V2, PR4).
 *
 * 흐름: 토큰 추출 → preparePayment(서버 금액결정) → PortOne.requestPayment(브라우저 결제창)
 *      → 성공 시 completePayment(서버 PAID 재검증) → paid_until 갱신.
 * useExport 패턴 답습 (useMutation 래핑 + status·error 노출).
 *
 * 보안: 금액은 서버(PLAN_PRICES)가 결정하고 complete 가 PortOne 응답과 재대조하므로,
 * FE 는 결과 성공 여부만 신뢰하지 않고 항상 서버 complete 로 확정한다.
 */
"use client";

import { useCallback, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { completePayment, preparePayment } from "@/lib/api";
import { createClient } from "@/lib/supabase";
import { queryKeys } from "@/lib/query-keys";
import type { CompletePaymentResponse, PlanKey } from "@/types/payment";

interface CheckoutHookResult {
  /** 결제 진행 중 (prepare~complete 전체 구간) */
  paying: boolean;
  /** 결제 실패·취소 메시지 (빈 문자열 = 에러 없음) */
  payError: string;
  clearPayError: () => void;
  /** 결제 시작 — 성공 시 CompletePaymentResponse, 취소·실패 시 null */
  startCheckout: (plan: PlanKey) => Promise<CompletePaymentResponse | null>;
}

export function useCheckout(): CheckoutHookResult {
  const [payError, setPayError] = useState("");
  const queryClient = useQueryClient();

  const clearPayError = useCallback(() => setPayError(""), []);

  const mutation = useMutation({
    mutationFn: async (plan: PlanKey): Promise<CompletePaymentResponse | null> => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("로그인이 필요합니다");

      // 1) 서버에서 결제 준비 (paymentId·금액·storeId/channelKey)
      const prep = await preparePayment(token, plan);

      // 2) PortOne 브라우저 결제창 (SDK 는 window 의존 → 동적 import)
      const PortOne = (await import("@portone/browser-sdk/v2")).default;
      const res = await PortOne.requestPayment({
        storeId: prep.storeId,
        channelKey: prep.channelKey,
        paymentId: prep.paymentId,
        orderName: prep.orderName,
        totalAmount: prep.amount,
        currency: "CURRENCY_KRW",
        payMethod: "CARD",
      });

      // res 없음(undefined) 또는 code 존재 = 실패·취소 (PortOne 응답 규약)
      if (!res || res.code !== undefined) {
        throw new Error(res?.message || "결제가 취소되었습니다");
      }

      // 3) 서버 complete 로 PAID·금액 재검증 후 paid_until 연장 (위변조 방지 핵심)
      return completePayment(token, prep.paymentId);
    },
    onSuccess: () => {
      // 결제 후 구독 상태가 바뀌므로 프로필·검증상태 캐시 무효화
      queryClient.invalidateQueries({ queryKey: queryKeys.verification.status() });
    },
    onError: (err: unknown) => {
      setPayError(err instanceof Error ? err.message : "결제에 실패했습니다");
    },
  });

  const startCheckout = useCallback(async (plan: PlanKey): Promise<CompletePaymentResponse | null> => {
    if (mutation.isPending) return null;
    setPayError("");
    try {
      return await mutation.mutateAsync(plan);
    } catch {
      // onError 가 메시지 노출 — 호출처는 null 로 실패 분기
      return null;
    }
  }, [mutation]);

  return {
    paying: mutation.isPending,
    payError,
    clearPayError,
    startCheckout,
  };
}
