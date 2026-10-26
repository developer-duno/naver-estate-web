"use client";

import { useState, useEffect, useRef } from "react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { makeQueryClient } from "@/lib/query-client";
import { createClient } from "@/lib/supabase";
import VersionWatcher from "@/components/VersionWatcher";

/**
 * 로그인 여부로 응답이 달라지는 쿼리 접두사(세션 481 공개 전환) — 비로그인으로 받은 응답은 네이버 재료 칸이
 * 걷혔거나(단지 상세·검색) 401 상태(매물·평형·호가·추이·매물 상세)라, 로그인하면 새로 받아야 한다.
 * 접두사 정본 = lib/query-keys.ts.
 */
export const LOGIN_DEPENDENT_QUERY_PREFIXES: readonly (readonly string[])[] = [
  ["complex"],
  ["articles"],
  ["pyeongDetails"],
  ["priceStats"],
  ["priceHistory"],
  ["articleLive"],
  ["articlePriceHistory"],
  ["search"],
  ["complexSearchDb"],
  ["regionSearch"],
];

/** 로그인 직후 — 로그인 여부로 달라지는 쿼리를 새로 받게 한다. */
export function invalidateLoginDependentQueries(queryClient: QueryClient): void {
  for (const queryKey of LOGIN_DEPENDENT_QUERY_PREFIXES) {
    void queryClient.invalidateQueries({ queryKey: [...queryKey] });
  }
}

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(makeQueryClient);
  // 직전 이벤트에 세션이 있었나 — null = 아직 첫 이벤트 전
  const hadSessionRef = useRef<boolean | null>(null);

  // 로그아웃 시 모든 캐시 제거 (세션 간 데이터 유출 방지)
  useEffect(() => {
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const hasSession = !!session;
      if (event === "SIGNED_OUT") {
        queryClient.clear();
      } else if (hasSession && hadSessionRef.current === false) {
        // 세션 없음 → 있음일 때만(이 탭 로그인·다른 탭 로그인). auth-js 는 탭 포커스 때도 SIGNED_IN 을
        // 다시 보내므로 이벤트 이름만 보면 포커스마다 다시 받는다(세션 481 보완 F7).
        invalidateLoginDependentQueries(queryClient);
      }
      hadSessionRef.current = hasSession;
    });
    return () => subscription.unsubscribe();
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <VersionWatcher />
      {process.env.NODE_ENV !== "production" && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClientProvider>
  );
}
