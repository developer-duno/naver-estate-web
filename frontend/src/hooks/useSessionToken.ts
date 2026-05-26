"use client";

import { useCallback, useEffect, useState } from "react";

import { createClient } from "@/lib/supabase";

/**
 * Supabase 세션 토큰 mount-time 1회 추출.
 *
 * useExport·useCrawlAction 은 각자 내부에서 독립 getSession() 호출 유지.
 * 본 훅은 PriceChartSection·ComplexDashboardMobile 의 accessToken prop 용도.
 */
export function useSessionToken(): {
  sessionToken: string | undefined;
  tokenError: boolean;
  dismissTokenError: () => void;
} {
  const [sessionToken, setSessionToken] = useState<string | undefined>(undefined);
  const [tokenError, setTokenError] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) setSessionToken(session.access_token);
      } catch (err) {
        console.error("Failed to extract sessionToken:", err);
        setTokenError(true);
      }
    })();
  }, []);

  const dismissTokenError = useCallback(() => setTokenError(false), []);

  return { sessionToken, tokenError, dismissTokenError };
}
