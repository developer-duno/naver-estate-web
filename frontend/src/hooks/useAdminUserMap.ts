"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { getAdminUsers } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { UserProfile } from "@/types/admin";

/** 관리자: 사용자 ID → 이메일·이름 매핑. 5분 캐시. */
export function useAdminUserMap(token: string) {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.admin.users({ page: 1 }),
    queryFn: () => getAdminUsers(token, { page: 1 }),
    enabled: !!token,
    staleTime: 5 * 60_000,
  });

  const userMap = useMemo(() => {
    const map = new Map<string, UserProfile>();
    (data?.items ?? []).forEach((u) => map.set(u.user_id, u));
    return map;
  }, [data]);

  return { userMap, isLoading };
}

/** 사용자 ID → 표시 (이메일 우선, 없으면 display_name, 없으면 UUID 앞 8자). */
export function formatUserDisplay(userId: string | undefined, userMap: Map<string, UserProfile>): string {
  if (!userId) return "-";
  const u = userMap.get(userId);
  if (u) return u.email || u.display_name || userId.slice(0, 8);
  return userId.slice(0, 8);
}
