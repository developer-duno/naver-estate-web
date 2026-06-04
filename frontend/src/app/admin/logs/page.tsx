"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTokenReady } from "@/hooks/useAdminQuery";
import { queryKeys } from "@/lib/query-keys";
import AuditLogTable from "@/components/admin/AuditLogTable";
import { getAdminAuditLogs } from "@/lib/api";
import { ACTION_LABELS } from "@/lib/admin-labels";
import type { AuditLog, PaginatedResponse } from "@/types/admin";

export default function AdminLogsPage() {
  const [filterAction, setFilterAction] = useState("");
  const [filterUserId, setFilterUserId] = useState("");
  const [page, setPage] = useState(1);

  const { token } = useTokenReady();
  const queryClient = useQueryClient();

  const params = {
    action: filterAction || undefined,
    user_id: filterUserId || undefined,
    page,
  };

  const logsQuery = useQuery<PaginatedResponse<AuditLog>, Error>({
    queryKey: queryKeys.admin.auditLogs(params as Record<string, unknown>),
    queryFn: () => getAdminAuditLogs(token, params),
    enabled: !!token,
    staleTime: 60_000,
  });

  const error = logsQuery.error?.message ?? "";

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.admin.auditLogs(params as Record<string, unknown>) });
  };

  return (
    <>
      <h2 className="text-lg font-semibold mb-4">감사 로그</h2>

      <div className="flex gap-3 mb-4">
        <select
          value={filterAction}
          onChange={(e) => { setFilterAction(e.target.value); setPage(1); }}
          className="text-sm border rounded px-2 py-1"
          title="액션 필터"
          aria-label="액션 필터"
        >
          <option value="">액션 전체</option>
          {Object.entries(ACTION_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="사용자 ID"
          value={filterUserId}
          onChange={(e) => { setFilterUserId(e.target.value); setPage(1); }}
          title="사용자 ID 필터"
          aria-label="사용자 ID 필터"
          className="text-sm border rounded px-2 py-1 w-48"
        />
        <button
          onClick={handleRefresh}
          className="text-sm px-3 py-1 border rounded hover:bg-gray-50"
        >
          새로고침
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 mb-4">{error}</div>
      )}

      {logsQuery.isLoading ? (
        <div className="text-sm text-gray-500 py-8 text-center" role="status">로딩 중...</div>
      ) : (
        <AuditLogTable logs={logsQuery.data?.items ?? []} token={token} />
      )}

      {(logsQuery.data?.total ?? 0) > 50 && (
        <div className="flex justify-center gap-2 mt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="text-sm px-3 py-1 border rounded disabled:opacity-30"
          >
            이전
          </button>
          <span className="text-sm text-gray-500 py-1">{page} / {Math.ceil((logsQuery.data?.total ?? 0) / 50)}</span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= Math.ceil((logsQuery.data?.total ?? 0) / 50)}
            className="text-sm px-3 py-1 border rounded disabled:opacity-30"
          >
            다음
          </button>
        </div>
      )}
    </>
  );
}
