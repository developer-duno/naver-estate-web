"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTokenReady } from "@/hooks/useAdminQuery";
import { queryKeys } from "@/lib/query-keys";
import AdminCard from "@/components/admin/AdminCard";
import UserTable from "@/components/admin/UserTable";
import UsersSummary from "@/components/admin/UsersSummary";
import VerificationReview from "@/components/admin/VerificationReview";
import { getAdminUsers, updateAdminUser, suspendAdminUser } from "@/lib/api";
import type { UserProfile, UserUpdatePayload, PaginatedResponse } from "@/types/admin";

export default function AdminUsersPage() {
  const [filterRole, setFilterRole] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [page, setPage] = useState(1);

  const { token, getToken } = useTokenReady();
  const queryClient = useQueryClient();

  const params = {
    role: filterRole || undefined,
    status: filterStatus || undefined,
    page,
  };

  const usersQuery = useQuery<PaginatedResponse<UserProfile>, Error>({
    queryKey: queryKeys.admin.users(params as Record<string, unknown>),
    queryFn: () => getAdminUsers(token, params),
    enabled: !!token,
    staleTime: 60_000,
  });

  const updateMutation = useMutation<
    { status: string; changes: Record<string, unknown> },
    Error,
    { userId: string; payload: UserUpdatePayload }
  >({
    mutationFn: async ({ userId, payload }) => {
      const t = await getToken();
      return updateAdminUser(t, userId, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.users() });
    },
  });

  const suspendMutation = useMutation<{ status: string }, Error, string>({
    mutationFn: async (userId) => {
      const t = await getToken();
      return suspendAdminUser(t, userId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.users() });
    },
  });

  const error = usersQuery.error?.message ?? updateMutation.error?.message ?? suspendMutation.error?.message ?? "";

  const handleUpdate = async (userId: string, payload: UserUpdatePayload) => {
    await updateMutation.mutateAsync({ userId, payload });
  };

  return (
    <>
      <h2 className="text-lg font-semibold mb-4">사용자 관리</h2>

      {token && <UsersSummary token={token} />}

      {/* 검증 심사 대기 */}
      <div id="verification-review" className="mb-6">
        {token && <VerificationReview token={token} />}
      </div>

      {/* 필터 */}
      <div className="mt-6">
        <AdminCard title="필터" help="역할(일반·전문가·관리자)이나 상태(승인·대기·정지)로 사용자 목록을 좁혀서 볼 수 있어요">
          <div className="flex gap-3">
            <select
              value={filterRole}
              onChange={(e) => { setFilterRole(e.target.value); setPage(1); }}
              className="text-sm border rounded px-2 py-1"
            >
              <option value="">역할 전체</option>
              <option value="user">일반</option>
              <option value="expert">전문가</option>
              <option value="admin">관리자</option>
            </select>
            <select
              value={filterStatus}
              onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
              className="text-sm border rounded px-2 py-1"
            >
              <option value="">상태 전체</option>
              <option value="approved">승인</option>
              <option value="pending">대기</option>
              <option value="suspended">정지</option>
            </select>
          </div>
        </AdminCard>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 mt-4">{error}</div>
      )}

      <div className="mt-6">
        <AdminCard
          title={`사용자 목록 (총 ${usersQuery.data?.total ?? 0}명)`}
          help="가입한 사용자 목록이에요. 표 안에서 바로 역할이나 상태를 바꿀 수 있고, 승인 버튼을 누르면 기간을 정하는 작은 창이 떠요"
        >
          {usersQuery.isLoading ? (
            <div className="text-sm text-gray-500 py-8 text-center" role="status">로딩 중...</div>
          ) : (
            <UserTable users={usersQuery.data?.items ?? []} onUpdate={handleUpdate} />
          )}
        </AdminCard>
      </div>

      {/* 페이지네이션 */}
      {(usersQuery.data?.total ?? 0) > 20 && (
        <div className="flex justify-center gap-2 mt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="text-sm px-3 py-1 border rounded disabled:opacity-30"
          >
            이전
          </button>
          <span className="text-sm text-gray-500 py-1">
            {page} / {Math.ceil((usersQuery.data?.total ?? 0) / 20)}
          </span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= Math.ceil((usersQuery.data?.total ?? 0) / 20)}
            className="text-sm px-3 py-1 border rounded disabled:opacity-30"
          >
            다음
          </button>
        </div>
      )}
    </>
  );
}
