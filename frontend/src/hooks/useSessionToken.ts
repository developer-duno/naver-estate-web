"use client";

import { useCallback, useEffect, useState } from "react";

import { createClient } from "@/lib/supabase";

/**
 * Supabase 세션 토큰 mount-time 1회 추출.
 *
 * useExport·useCrawlAction 은 각자 내부에서 독립 getSession() 호출 유지.
 * 본 훅은 PriceChartSection·ComplexDashboard 의 accessToken prop 용도.
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
    (async () => {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) setSessionToken(session.access_token);
      } catch (err) {
        console.error("Failed to extract sessionToken:", err);
        setTokenError(true);
      } finally {
        setTokenReady(true);
      }
    })();
  }, []);

  const dismissTokenError = useCallback(() => setTokenError(false), []);

  return { sessionToken, tokenError, tokenReady, dismissTokenError };
}
