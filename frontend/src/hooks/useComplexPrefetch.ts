import { useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getComplex, getArticles } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { getArticlePageSize } from "@/lib/storage";
import { createClient } from "@/lib/supabase";

/**
 * 단지 행/카드 hover 시 complex + articles 프리페치 훅.
 * hover 200ms 유지 시에만 실행 (빠른 스크롤 시 불필요한 요청 방지).
 * 데스크톱 ComplexRow / 모바일 ComplexCardMobile 공용.
 *
 * B2 게이트: articles 는 승인 중개사 전용이므로 prefetch 시에도 토큰을 실어야
 * 403 캐시 오염을 피한다. 토큰 없으면(비로그인) articles prefetch 는 스킵하고
 * 공개 데이터인 complex 메타만 prefetch (prefetch 는 부가 최적화라 스킵 무해).
 */
export function useComplexPrefetch(complexNo: string) {
  const queryClient = useQueryClient();
  const prefetchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const onMouseEnter = useCallback(() => {
    prefetchTimer.current = setTimeout(async () => {
      queryClient.prefetchQuery({
        queryKey: queryKeys.complex(complexNo),
        queryFn: () => getComplex(complexNo),
        staleTime: 60_000,
      });
      // 토큰 즉석 조회 — 있을 때만 articles prefetch (없으면 403 캐시 오염 방지 위해 스킵)
      let token: string | undefined;
      try {
        const { data: { session } } = await createClient().auth.getSession();
        token = session?.access_token ?? undefined;
      } catch {
        token = undefined;
      }
      if (!token) return;
      const ps = getArticlePageSize();
      queryClient.prefetchQuery({
        queryKey: queryKeys.articles(complexNo, { page: 1, page_size: ps }),
        queryFn: () => getArticles(complexNo, { page: 1, page_size: ps }, token),
        staleTime: 60_000,
      });
    }, 200);
  }, [complexNo, queryClient]);

  const onMouseLeave = useCallback(() => {
    clearTimeout(prefetchTimer.current);
  }, []);

  return { onMouseEnter, onMouseLeave };
}
