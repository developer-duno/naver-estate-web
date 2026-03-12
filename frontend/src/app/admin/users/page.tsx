"use client";

import { useEffect, useState, useCallback } from "react";
import { useAdminToken } from "@/hooks/useAdminToken";
import UserTable from "@/components/admin/UserTable";
import { getAdminUsers, updateAdminUser, suspendAdminUser } from "@/lib/api";
import type { UserProfile, UserUpdatePayload } from "@/types/admin";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterRole, setFilterRole] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const getToken = useAdminToken();

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = await getToken();
      if (!token) return;
      const data = await getAdminUsers(token, {
        role: filterRole || undefined,
        status: filterStatus || undefined,
        page,
      });
      setUsers(data.items);
      setTotal(data.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "사용자 목록 로드 실패");
    } finally {
      setLoading(false);
    }
  }, [getToken, filterRole, filterStatus, page]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const handleUpdate = async (userId: string, payload: UserUpdatePayload) => {
    try {
      const token = await getToken();
      await updateAdminUser(token, userId, payload);
      await loadUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "사용자 업데이트 실패");
    }
  };

  const handleSuspend = async (userId: string) => {
    if (!confirm("이 사용자를 정지하시겠습니까?")) return;
    try {
      const token = await getToken();
      await suspendAdminUser(token, userId);
      await loadUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "사용자 정지 실패");
    }
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

      {loading ? (
        <div className="text-sm text-gray-500 py-8 text-center" role="status">로딩 중...</div>
      ) : (
        <UserTable users={users} onUpdate={handleUpdate} onSuspend={handleSuspend} />
      )}

      {/* 페이지네이션 */}
      {total > 20 && (
        <div className="flex justify-center gap-2 mt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="text-sm px-3 py-1 border rounded disabled:opacity-30"
          >
            이전
          </button>
          <span className="text-sm text-gray-500 py-1">
            {page} / {Math.ceil(total / 20)}
          </span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= Math.ceil(total / 20)}
            className="text-sm px-3 py-1 border rounded disabled:opacity-30"
          >
            다음
          </button>
        </div>
      )}
    </>
  );
}
