/**
 * 내 자동결제 카드 목록 + 해지 (빌링키, PR6).
 *
 * 로그인 사용자의 등록 카드를 보여주고(카드사·끝4자리·다음 결제일·기본 여부) 해지할 수 있다.
 * 카드가 없으면 아무것도 렌더하지 않는다(섹션 자체가 안 보임 — /pricing 상단 등록 버튼으로 유도).
 * CheckoutButton(useBillingKey) 와 같은 토큰·React Query 패턴 답습.
 */
"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useSessionToken } from "@/hooks/useSessionToken";
import { listBillingCards, cancelBillingCard } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { BillingCard } from "@/types/payment";

function formatNextCharge(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("ko-KR");
}

export default function MyBillingCards() {
  const { sessionToken, tokenReady } = useSessionToken();
  const queryClient = useQueryClient();
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.billing.cards(),
    queryFn: () => listBillingCards(sessionToken!),
    enabled: tokenReady && !!sessionToken,
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => cancelBillingCard(sessionToken!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.billing.cards() });
      toast.success("자동결제를 해지했어요");
      setConfirmId(null);
    },
    onError: () => {
      toast.error("해지에 실패했어요. 잠시 후 다시 시도해주세요");
    },
  });

  // 비로그인·로딩·카드 없음 = 섹션 미표시 (등록 버튼은 상단 PlanCards 가 담당)
  if (!tokenReady || !sessionToken || isLoading) return null;
  const cards: BillingCard[] = data?.cards ?? [];
  if (cards.length === 0) return null;

  return (
    <section className="mb-12 sm:mb-16" aria-label="내 자동결제 카드">
      <h2 className="font-heading text-lg sm:text-xl font-bold text-text-primary mb-4">내 자동결제</h2>
      <ul className="space-y-3">
        {cards.map((card) => (
          <li
            key={card.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-neutral-light bg-white px-4 py-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">
                {card.card_name ?? "등록 카드"}
                {card.card_last4 && <span className="text-text-secondary"> ····{card.card_last4}</span>}
                {card.is_default && (
                  <span className="ml-2 text-xs bg-accent-blue/10 text-accent-blue px-1.5 py-0.5 rounded">자동결제</span>
                )}
              </p>
              {card.next_charge_at && (
                <p className="text-xs text-text-secondary mt-0.5">
                  다음 결제 예정 · {formatNextCharge(card.next_charge_at)}
                </p>
              )}
            </div>
            {confirmId === card.id ? (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={cancelMutation.isPending}
                  onClick={() => cancelMutation.mutate(card.id)}
                  className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-60"
                >
                  {cancelMutation.isPending ? "해지 중…" : "해지 확인"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmId(null)}
                  className="text-xs text-text-secondary hover:text-text-primary"
                >
                  취소
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmId(card.id)}
                className="text-xs font-medium text-text-secondary hover:text-red-600 shrink-0"
              >
                해지
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
