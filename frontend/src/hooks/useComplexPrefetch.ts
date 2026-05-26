import { useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getComplex, getArticles } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { getArticlePageSize } from "@/lib/storage";

/**
 * 단지 행/카드 hover 시 complex + articles 프리페치 훅.
 * hover 200ms 유지 시에만 실행 (빠른 스크롤 시 불필요한 요청 방지).
 * 데스크톱 ComplexRow / 모바일 ComplexCardMobile 공용.
 */
export function useComplexPrefetch(complexNo: string) {
  const queryClient = useQueryClient();
  const prefetchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const onMouseEnter = useCallback(() => {
    prefetchTimer.current = setTimeout(() => {
      queryClient.prefetchQuery({
        queryKey: queryKeys.complex(complexNo),
        queryFn: () => getComplex(complexNo),
        staleTime: 60_000,
      });
      const ps = getArticlePageSize();
      queryClient.prefetchQuery({
        queryKey: queryKeys.articles(complexNo, { page: 1, page_size: ps }),
        queryFn: () => getArticles(complexNo, { page: 1, page_size: ps }),
        staleTime: 60_000,
      });
    }, 200);
  }, [complexNo, queryClient]);

  const onMouseLeave = useCallback(() => {
    clearTimeout(prefetchTimer.current);
  }, []);

  return { onMouseEnter, onMouseLeave };
}
