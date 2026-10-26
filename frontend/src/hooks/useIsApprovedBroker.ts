"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchApi } from "@/lib/api";

interface MyProfile {
  /** BE 승인 게이트(get_approved_user)와 같은 판정 — 관리자·승인 상태·승인/이용권 기한 (세션 481 보완 F5) */
  is_approved_broker?: boolean;
}

/** 서버가 승인 중개사라고 답했나 — 칸이 없거나 false 면 거짓(안전한 쪽). */
export function isApprovedBrokerProfile(me: MyProfile | null | undefined): boolean {
  return me?.is_approved_broker === true;
}

/**
 * 로그인한 사람이 승인 중개사인가 (세션 481 공개 전환 — 자동 새로 받기·자동 실거래가 수집 가드용).
 *
 * 판정은 서버(/api/users/me 의 is_approved_broker)만 본다 — 역할·상태로 추정하면 기한 만료·관리자 목록을
 * 놓쳐 BE 와 어긋난다(보완 F5). 비로그인(토큰 없음)이면 조회하지 않고 false, 조회 실패도 false.
 */
export function useIsApprovedBroker(sessionToken: string | undefined): boolean {
  const { data } = useQuery({
    queryKey: ["users", "me", sessionToken ?? null],
    queryFn: () =>
      fetchApi<MyProfile>("/api/users/me", { headers: { Authorization: `Bearer ${sessionToken}` } }),
    enabled: !!sessionToken,
    staleTime: 5 * 60_000,
    retry: false,
  });
  return !!sessionToken && isApprovedBrokerProfile(data);
}
