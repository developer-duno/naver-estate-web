"use client";

import { useCallback, useEffect, useState } from "react";

import { createClient } from "@/lib/supabase";

/**
 * Supabase 세션 토큰 추출 + 갱신 구독.
 *
 * 마운트 시 getSession() 으로 초기 토큰을 읽고, 이후 onAuthStateChange 로 갱신을 구독한다.
 * Supabase 액세스 토큰은 약 1시간마다 갱신되므로, 구독이 없으면 단지 페이지·매물 상세 모달을
 * 1시간 넘게 열어둔 뒤의 React Query 재조회가 만료 토큰으로 나가 401 → 승인 중개사에게
 * "승인 필요" 잠금 카드가 뜬다(세션 395 사후검증 CONFIRMED).
 *
 * useExport·useCrawlAction 은 각자 내부에서 독립 getSession() 호출 유지.
 * 본 훅은 PriceChartSection·ComplexDashboard·ArticleDetail 의 accessToken prop 용도.
 */
export function useSessionToken(): {
  sessionToken: string | undefined;
  tokenError: boolean;
  /** 세션 해석 완료 여부 — B2 게이트 쿼리의 enabled 가드용. */
  tokenReady: boolean;
  dismissTokenError: () => void;
} {
  const [sessionToken, setSessionToken] = useState<string | undefined>(undefined);
  const [tokenError, setTokenError] = useState(false);
  // 토큰 해석이 끝났는지(성공/비로그인/에러 무관). B2 게이트 쿼리는 이 값이 true 일 때만
  // 실행해야, 토큰 도착 전 undefined 로 먼저 쏴서 403→queryKey 불변으로 refetch 안 되는
  // 잠금 화면 오인을 막는다(승인 중개사 보호).
  const [tokenReady, setTokenReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // 구독이 이미 값을 준 뒤에 늦게 끝난 getSession() 이 낡은 값으로 덮어쓰는 경합 차단.
    // (onAuthStateChange 는 구독 즉시 INITIAL_SESSION 을 쏘므로 순서가 뒤집힐 수 있다)
    let deliveredBySubscription = false;

    let unsubscribe: (() => void) | undefined;

    try {
      const supabase = createClient();

      // 갱신 구독을 먼저 건다 — getSession() await 사이에 일어나는 갱신도 놓치지 않게.
      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        if (cancelled) return;
        deliveredBySubscription = true;
        // TOKEN_REFRESHED / SIGNED_IN / USER_UPDATED = 새 토큰, SIGNED_OUT = undefined.
        // 이벤트 종류로 분기하지 않고 session 을 그대로 신뢰한다 — 어떤 이벤트든
        // 그 시점 세션이 진실이므로, 새 이벤트 종류가 생겨도 자동으로 옳게 동작한다.
        setSessionToken(session?.access_token ?? undefined);
        setTokenReady(true);
      });
      unsubscribe = () => data.subscription.unsubscribe();

      void (async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (cancelled || deliveredBySubscription) return;
          if (session?.access_token) setSessionToken(session.access_token);
        } catch (err) {
          console.error("Failed to extract sessionToken:", err);
          // 구독이 이미 진실을 배달했으면 늦게 끝난 getSession() 실패는 사용자 상태와
          // 무관하다 — 정상 로그인인데 오류 배너가 뜨던 경합. 성공 경로 가드와 대칭(세션 396).
          if (!cancelled && !deliveredBySubscription) setTokenError(true);
        } finally {
          if (!cancelled) setTokenReady(true);
        }
      })();
    } catch (err) {
      console.error("Failed to extract sessionToken:", err);
      setTokenError(true);
      setTokenReady(true);
    }

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const dismissTokenError = useCallback(() => setTokenError(false), []);

  return { sessionToken, tokenError, tokenReady, dismissTokenError };
}
