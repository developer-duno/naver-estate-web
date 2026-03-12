"use client";

import { useEffect, useState, useCallback } from "react";
import { createBrowserClient } from "@supabase/ssr";
import AdminLayout from "@/components/admin/AdminLayout";
import AuditLogTable from "@/components/admin/AuditLogTable";
import { getAdminAuditLogs } from "@/lib/api";
import type { AuditLog } from "@/types/admin";

export default function AdminLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [filterUserId, setFilterUserId] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const getToken = useCallback(async () => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || "";
  }, []);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = await getToken();
      if (!token) return;
      const data = await getAdminAuditLogs(token, {
        action: filterAction || undefined,
        user_id: filterUserId || undefined,
        page,
      });
      setLogs(data.items);
      setTotal(data.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "로그 로드 실패");
    } finally {
      setLoading(false);
    }
  }, [getToken, filterAction, filterUserId, page]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  return (
    <AdminLayout>
      <h2 className="text-lg font-semibold mb-4">감사 로그</h2>

      <div className="flex gap-3 mb-4">
        <select
          value={filterAction}
          onChange={(e) => { setFilterAction(e.target.value); setPage(1); }}
          className="text-sm border rounded px-2 py-1"
        >
          <option value="">액션 전체</option>
          <option value="login">로그인</option>
          <option value="crawl_trigger">크롤링</option>
          <option value="export">내보내기</option>
          <option value="admin_action">관리자 액션</option>
        </select>
        <input
          type="text"
          placeholder="사용자 ID"
          value={filterUserId}
          onChange={(e) => { setFilterUserId(e.target.value); setPage(1); }}
          className="text-sm border rounded px-2 py-1 w-48"
        />
        <button
          onClick={loadLogs}
          className="text-sm px-3 py-1 border rounded hover:bg-gray-50"
        >
          새로고침
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 mb-4">{error}</div>
      )}

      {loading ? (
        <div className="text-sm text-gray-400 py-8 text-center">로딩 중...</div>
      ) : (
        <AuditLogTable logs={logs} />
      )}

      {total > 50 && (
        <div className="flex justify-center gap-2 mt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="text-sm px-3 py-1 border rounded disabled:opacity-30"
          >
            이전
          </button>
          <span className="text-sm text-gray-500 py-1">{page} / {Math.ceil(total / 50)}</span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= Math.ceil(total / 50)}
            className="text-sm px-3 py-1 border rounded disabled:opacity-30"
          >
            다음
          </button>
        </div>
      )}
    </AdminLayout>
  );
}
