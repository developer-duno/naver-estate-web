"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTokenReady } from "@/hooks/useAdminQuery";
import { queryKeys } from "@/lib/query-keys";
import AdminCard from "@/components/admin/AdminCard";
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

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 mb-4">{error}</div>
      )}

      <AdminCard
        title={`기록 목록 (총 ${logsQuery.data?.total ?? 0}건)`}
        help="관리자와 사용자가 한 중요한 일(설정 바꾸기·사용자 정지·재수집·결제 등)이 시간 순서로 남는 기록이에요. 칸에 마우스를 올리거나 칸 글자를 누르면 원래 기록(영문)을 볼 수 있어요"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={filterAction}
              onChange={(e) => { setFilterAction(e.target.value); setPage(1); }}
              className="text-sm border rounded px-2 py-1"
              aria-label="한 일로 거르기"
            >
              <option value="">한 일 전체</option>
              {Object.entries(ACTION_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="사용자 고유번호"
              value={filterUserId}
              onChange={(e) => { setFilterUserId(e.target.value); setPage(1); }}
              aria-label="사용자로 거르기"
              className="text-sm border rounded px-2 py-1 w-40"
            />
            <button
              onClick={handleRefresh}
              className="text-sm px-3 py-1 border rounded hover:bg-gray-50"
            >
              새로고침
            </button>
          </div>
        }
      >
        {logsQuery.isLoading ? (
          <div className="text-sm text-gray-500 py-8 text-center" role="status">로딩 중...</div>
        ) : (
          <AuditLogTable logs={logsQuery.data?.items ?? []} token={token} />
        )}
      </AdminCard>

      {(logsQuery.data?.total ?? 0) > 50 && (
        <div className="flex justify-center gap-2 mt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="text-sm px-3 py-1 border rounded disabled:opacity-30"
          >
            이전
          </button>
          <span className="text-sm text-gray-500 py-1">{page} / {Math.ceil((logsQuery.data?.total ?? 0) / 50)} 쪽</span>
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
