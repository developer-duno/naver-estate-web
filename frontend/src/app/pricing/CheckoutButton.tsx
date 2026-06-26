"use client";

import Link from "next/link";
import { useSessionToken } from "@/hooks/useSessionToken";
import { useCheckout } from "@/hooks/useCheckout";
import type { PlanKey } from "@/types/payment";

/**
 * 요금제 카드 CTA (PR4) — 로그인 여부로 분기.
 * - 비로그인: "무료 체험 시작" → /signup (기존 동작 유지)
 * - 로그인: "결제하고 시작" → PortOne 결제 플로우 (useCheckout)
 *
 * 가격은 카드에서 "출시 시 공개"로 숨김 (PLAN_PRICES amount placeholder). 금액은 prepare
 * 응답으로 결제창에만 전달된다. PortOne env 미설정 시 BE prepare 가 503 → payError 안내.
 */
export default function CheckoutButton({
  planKey,
  highlight,
  free,
}: {
  planKey: PlanKey;
  highlight?: boolean;
  /** 무료체험 플랜 — 결제(prepare) 를 타지 않고 항상 /signup(카드 등록 7일 무료) 로 보낸다. */
  free?: boolean;
}) {
  const { sessionToken, tokenReady } = useSessionToken();
  const { paying, payError, startCheckout } = useCheckout();

  const base = "block w-full text-center font-medium text-sm py-2.5 rounded-lg transition";
  const filled = highlight
    ? "bg-accent-blue hover:bg-accent-blue/90 text-white"
    : "bg-neutral-light hover:bg-neutral-light/80 text-text-primary";

  // 토큰 해석 전 깜빡임 방지 — 기존 "무료 체험 시작" 링크를 기본 노출 (비로그인과 동일 UX)
  const loggedIn = tokenReady && !!sessionToken;

  // 무료체험 플랜(기본) 또는 비로그인 = 결제 없이 /signup(카드 등록 → 7일 무료)
  if (free || !loggedIn) {
    return (
      <Link href="/signup" className={`${base} ${filled}`}>
        무료 체험 시작
      </Link>
    );
  }

  return (
    <div className="w-full">
      <button
        type="button"
        disabled={paying}
        onClick={() => startCheckout(planKey)}
        className={`${base} ${filled} disabled:opacity-60 disabled:cursor-not-allowed`}
      >
        {paying ? "결제 진행 중…" : "결제하고 시작"}
      </button>
      {payError && (
        <p role="alert" className="mt-2 text-xs text-red-600 text-center">
          {payError}
        </p>
      )}
    </div>
  );
}
