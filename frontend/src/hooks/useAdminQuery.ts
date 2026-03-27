"use client";

import { useEffect, useState, useCallback } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
  type UseMutationOptions,
} from "@tanstack/react-query";
import { useAdminToken } from "./useAdminToken";

/**
 * 관리자 페이지 공통: Supabase 토큰을 자동으로 주입하는 React Query 래퍼
 *
 * - 토큰은 query key에 포함하지 않음 (보안)
 * - enabled: !!token 으로 토큰 대기 후 fetch
 * - staleTime: 0 으로 항상 신선한 데이터
 */

/** 토큰을 비동기로 가져와 동기 상태로 캐시 */
export function useTokenReady() {
  const getToken = useAdminToken();
  const [token, setToken] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    getToken().then((t) => {
      if (!cancelled) setToken(t);
    });
    return () => { cancelled = true; };
  }, [getToken]);

  // 토큰 재취득 (mutation 등에서 사용)
  const refetchToken = useCallback(async () => {
    const t = await getToken();
    setToken(t);
    return t;
  }, [getToken]);

  return { token, getToken: refetchToken };
}

/** 관리자 useQuery 래퍼: 토큰을 closure로 전달, key에는 미포함 */
export function useAdminQuery<TData>(
  queryKey: readonly unknown[],
  queryFn: (token: string) => Promise<TData>,
  options?: Omit<UseQueryOptions<TData, Error>, "queryKey" | "queryFn">,
) {
  const { token } = useTokenReady();

  return useQuery<TData, Error>({
    queryKey,
    queryFn: () => queryFn(token),
    enabled: !!token && (options?.enabled !== false),
    staleTime: 0,
    ...options,
  });
}

/** 관리자 useMutation 래퍼: 토큰을 closure로 전달 */
export function useAdminMutation<TData, TVariables>(
  mutationFn: (token: string, variables: TVariables) => Promise<TData>,
  options?: Omit<UseMutationOptions<TData, Error, TVariables>, "mutationFn">,
) {
  const { getToken } = useTokenReady();

  return useMutation<TData, Error, TVariables>({
    mutationFn: async (variables: TVariables) => {
      const token = await getToken();
      return mutationFn(token, variables);
    },
    ...options,
  });
}

/** invalidateQueries 헬퍼를 포함한 QueryClient 접근 */
export function useAdminQueryClient() {
  return useQueryClient();
}
