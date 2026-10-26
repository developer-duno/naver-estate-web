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
  return useApprovedBrokerStatus(sessionToken).approved;
}

/**
 * 위와 같은 판정 + 아직 묻는 중인가(세션 482 PR 1b) — 단지 화면이 소비자 화면/중개사 화면을 고르기 전에
 * 판정이 끝나길 기다려 중개사에게 소비자 화면이 잠깐 비치지 않게 한다. 조회 실패는 끝난 것(= 승인 아님)으로 본다.
 */
export function useApprovedBrokerStatus(sessionToken: string | undefined): { approved: boolean; pending: boolean } {
  const { data, isPending } = useQuery({
    queryKey: ["users", "me", sessionToken ?? null],
    queryFn: () =>
      fetchApi<MyProfile>("/api/users/me", { headers: { Authorization: `Bearer ${sessionToken}` } }),
    enabled: !!sessionToken,
    staleTime: 5 * 60_000,
    retry: false,
  });
  return { approved: !!sessionToken && isApprovedBrokerProfile(data), pending: !!sessionToken && isPending };
}
