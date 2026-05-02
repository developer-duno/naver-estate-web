"use client";

/** /admin/users 최상단 — 심사 대기 + 역할 비율 한 줄 요약. verifications queryKey 는 VerificationReview 와 캐시 공유 */

import { useQuery, useQueries } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { getAdminVerifications, getAdminUsers } from "@/lib/api";
import type { AgentVerification, UserProfile, PaginatedResponse } from "@/types/admin";

interface Props {
  token: string;
}

const ROLES = ["user", "expert", "admin"] as const;

function scrollToVerificationReview() {
  const el = document.getElementById("verification-review");
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function UsersSummary({ token }: Props) {
  const verifQuery = useQuery<PaginatedResponse<AgentVerification>, Error>({
    queryKey: queryKeys.admin.verifications({ status: "pending" }),
    queryFn: () => getAdminVerifications(token, { status: "pending" }),
    enabled: !!token,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const roleQueries = useQueries({
    queries: ROLES.map((role) => ({
      queryKey: queryKeys.admin.users({ role }),
      queryFn: () => getAdminUsers(token, { role }),
      enabled: !!token,
      staleTime: 60_000,
      refetchInterval: 60_000,
    })),
  });

  const isLoading = verifQuery.isLoading || roleQueries.some((q) => q.isLoading);
  const roleData = roleQueries.map((q) => q.data) as (PaginatedResponse<UserProfile> | undefined)[];

  if (isLoading || !verifQuery.data || roleData.some((d) => !d)) {
    return (
      <div
        className="bg-white border rounded-lg p-3 mb-4 h-12 animate-pulse"
        aria-label="사용자 요약 로딩 중"
      />
    );
  }

  const pending = verifQuery.data.total;
  const [users, experts, admins] = roleData.map((d) => d?.total ?? 0);

  const containerClass =
    pending > 0
      ? "bg-amber-50 border-amber-200"
      : "bg-white border-gray-200";

  const summaryText = (
    <>
      <span className={pending > 0 ? "text-amber-800 font-medium" : "text-gray-700"}>
        심사 대기 {pending}건
      </span>
      <span className="text-gray-700">일반 {users}</span>
      <span className="text-gray-700">전문가 {experts}</span>
      <span className="text-gray-700">관리자 {admins}</span>
    </>
  );

  if (pending > 0) {
    return (
      <button
        type="button"
        onClick={scrollToVerificationReview}
        className={`w-full text-left border rounded-lg p-3 mb-4 text-sm transition hover:brightness-95 flex flex-wrap gap-x-3 gap-y-1 ${containerClass}`}
        aria-label="사용자 상태 요약 — 클릭 시 검증 심사로 이동"
      >
        {summaryText}
        <span className="text-xs text-amber-700 ml-auto">심사하기 ↓</span>
      </button>
    );
  }

  return (
    <div
      className={`border rounded-lg p-3 mb-4 text-sm flex flex-wrap gap-x-3 gap-y-1 ${containerClass}`}
      aria-label="사용자 상태 요약"
    >
      {summaryText}
    </div>
  );
}
