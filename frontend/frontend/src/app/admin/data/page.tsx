"use client";

import { useEffect, useState, useCallback } from "react";
import { createBrowserClient } from "@supabase/ssr";
import AdminLayout from "@/components/admin/AdminLayout";
import StatsCards from "@/components/admin/StatsCards";
import { getAdminDetailedStats, deleteStaleData } from "@/lib/api";
import type { DetailedStats } from "@/types/admin";

export default function AdminDataPage() {
  const [stats, setStats] = useState<DetailedStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [staleDays, setStaleDays] = useState(90);
  const [deleting, setDeleting] = useState(false);
  const [deleteResult, setDeleteResult] = useState("");

  const getToken = useCallback(async () => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || "";
  }, []);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const data = await getAdminDetailedStats(token);
      setStats(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "통계 로드 실패");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { loadStats(); }, [loadStats]);

  const handleDeleteStale = async () => {
    if (!confirm(`${staleDays}일 이상 된 비활성 매물 데이터를 삭제하시겠습니까?`)) return;
    setDeleting(true);
    setDeleteResult("");
    try {
      const token = await getToken();
      const result = await deleteStaleData(token, staleDays);
      setDeleteResult(`${result.deleted}건 삭제 완료`);
      await loadStats();
    } catch (e) {
      setError(e instanceof Error ? e.message : "삭제 실패");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AdminLayout>
      <h2 className="text-lg font-semibold mb-4">데이터 관리</h2>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 mb-4">{error}</div>
      )}

      <StatsCards stats={stats} loading={loading} />

      {/* 데이터 정리 */}
      <div className="bg-white border rounded-lg p-4 mt-6">
        <h3 className="text-sm font-medium text-gray-700 mb-3">오래된 데이터 정리</h3>
        <p className="text-xs text-gray-500 mb-3">
          비활성 상태(is_active=false)이며 지정 일수 이상 경과된 매물을 삭제합니다.
        </p>
        <div className="flex items-center gap-3">
          <input
            type="number"
            value={staleDays}
            onChange={(e) => setStaleDays(Number(e.target.value))}
            min={30}
            className="w-20 text-sm border rounded px-2 py-1"
          />
          <span className="text-sm text-gray-500">일 이상</span>
          <button
            onClick={handleDeleteStale}
            disabled={deleting}
            className="text-sm px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
          >
            {deleting ? "삭제 중..." : "삭제"}
          </button>
        </div>
        {deleteResult && (
          <p className="text-sm text-green-600 mt-2">{deleteResult}</p>
        )}
      </div>
    </AdminLayout>
  );
}
