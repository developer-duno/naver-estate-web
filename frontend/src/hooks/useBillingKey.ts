/**
 * useBillingKey 훅 — 자동결제 카드 등록 (빌링키 발급 + 첫 결제, PortOne V2, PR5).
 *
 * 흐름: 토큰 추출 → prepareBilling(issueId·customer) → PortOne.requestIssueBillingKey(카드등록창)
 *      → 성공 시 registerBilling(billingKey 저장 + 첫 결제) → paid_until 갱신.
 * useCheckout 패턴 답습 (useMutation 래핑 + status·error 노출 + SDK 동적 import).
 *
 * 일회성 결제(useCheckout)와 차이: requestPayment 대신 requestIssueBillingKey 로 카드를 "등록"하고,
 * 첫 결제·이후 매달 결제는 서버(billing/register + cron)가 빌링키로 수행한다 (FE 는 등록까지).
 */
"use client";

import { useCallback, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { prepareBilling, registerBilling } from "@/lib/api";
import { ApiError } from "@/lib/api/core";
import { createClient } from "@/lib/supabase";
import { queryKeys } from "@/lib/query-keys";
import type { BillingRegisterResponse, PlanKey } from "@/types/payment";

interface BillingHookResult {
  /** 카드 등록 진행 중 (prepare~register 전체 구간) */
  registering: boolean;
  /** 등록 실패·취소 메시지 (빈 문자열 = 에러 없음) */
  regError: string;
  clearRegError: () => void;
  /** 등록 시작 — 성공 시 BillingRegisterResponse, 취소·실패 시 null */
  startBilling: (plan: PlanKey) => Promise<BillingRegisterResponse | null>;
}

export function useBillingKey(): BillingHookResult {
  const [regError, setRegError] = useState("");
  const queryClient = useQueryClient();

  const clearRegError = useCallback(() => setRegError(""), []);

  const mutation = useMutation({
    mutationFn: async (plan: PlanKey): Promise<BillingRegisterResponse | null> => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("로그인이 필요합니다");

      // 1) 서버에서 발급 준비 (issueId·storeId/channelKey·customer)
      const prep = await prepareBilling(token, plan);

      // 2) PortOne 카드 등록창 (SDK 는 window 의존 → 동적 import)
      const PortOne = (await import("@portone/browser-sdk/v2")).default;
      const res = await PortOne.requestIssueBillingKey({
        storeId: prep.storeId,
        channelKey: prep.channelKey,
        billingKeyMethod: "CARD", // KPN 빌링키는 CARD 고정
        issueId: prep.issueId,
        issueName: prep.issueName,
        customer: {
          fullName: prep.customer.name, // KPN 필수
          phoneNumber: prep.customer.phone ?? undefined,
        },
      });

      // res 없음(undefined) 또는 code 존재 = 실패·취소 (PortOne 응답 규약)
      if (!res || res.code !== undefined) {
        throw new Error(res?.message || "카드 등록이 취소되었습니다");
      }

      // 3) 서버 register 로 빌링키 저장 + 첫 결제 즉시 실행 (위변조 방지: 금액 서버 결정)
      return registerBilling(token, res.billingKey, plan);
    },
    onSuccess: (res) => {
      // 등록·결제 후 구독 상태가 바뀌므로 프로필·검증·카드목록 캐시 무효화
      queryClient.invalidateQueries({ queryKey: queryKeys.verification.status() });
      queryClient.invalidateQueries({ queryKey: queryKeys.billing.cards() });
      if (res?.paid_until) {
        const until = new Date(res.paid_until).toLocaleDateString("ko-KR");
        toast.success(`자동결제 등록 완료 · 이용권 ${until}까지`);
      } else {
        toast.success("자동결제 등록 완료");
      }
    },
    onError: (err: unknown) => {
      // 409 = 정산 지연. 등록은 됐고 첫 결제 확정만 늦는 상황 — '실패' 아님.
      if (err instanceof ApiError && err.statusCode === 409) {
        const msg = "결제는 접수됐어요. 정산 확인 중이니 잠시 후 자동 반영됩니다.";
        setRegError(msg);
        toast.info(msg);
        return;
      }
      setRegError(err instanceof Error ? err.message : "카드 등록에 실패했습니다");
    },
  });

  const startBilling = useCallback(async (plan: PlanKey): Promise<BillingRegisterResponse | null> => {
    if (mutation.isPending) return null;
    setRegError("");
    try {
      return await mutation.mutateAsync(plan);
    } catch {
      return null; // onError 가 메시지 노출 — 호출처는 null 로 실패 분기
    }
  }, [mutation]);

  return {
    registering: mutation.isPending,
    regError,
    clearRegError,
    startBilling,
  };
}
