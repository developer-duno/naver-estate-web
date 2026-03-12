"use client";

import { useCallback } from "react";
import { createClient } from "@/lib/supabase";

/** 관리자 페이지 공통: Supabase 세션에서 access_token 추출 */
export function useAdminToken() {
  return useCallback(async () => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || "";
  }, []);
}
