"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTokenReady } from "@/hooks/useAdminQuery";
import { queryKeys } from "@/lib/query-keys";
import UserTable from "@/components/admin/UserTable";
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
    staleTime: 0,
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

      {/* 필터 */}
      <div className="flex gap-3 mb-4">
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

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 mb-4">{error}</div>
      )}

      {usersQuery.isLoading ? (
        <div className="text-sm text-gray-500 py-8 text-center" role="status">로딩 중...</div>
      ) : (
        <UserTable users={usersQuery.data?.items ?? []} onUpdate={handleUpdate} />
      )}

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
