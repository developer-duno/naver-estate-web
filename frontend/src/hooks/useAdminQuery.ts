"use client";

import { useEffect, useState, useCallback } from "react";
import { useAdminToken } from "./useAdminToken";

/**
 * 관리자 페이지 공통: Supabase 토큰을 비동기로 가져와 동기 상태로 캐시
 *
 * - 토큰은 query key에 포함하지 않음 (보안)
 * - enabled: !!token 으로 토큰 대기 후 fetch
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
