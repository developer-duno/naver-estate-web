"use client";

import { useEffect, useState, useCallback } from "react";
import { createBrowserClient } from "@supabase/ssr";
import AdminLayout from "@/components/admin/AdminLayout";
import CrawlJobTable from "@/components/admin/CrawlJobTable";
import { getAdminCrawlJobs, cancelAdminCrawlJob } from "@/lib/api";
import type { CrawlJobDetail } from "@/types/admin";

export default function AdminCrawlPage() {
  const [jobs, setJobs] = useState<CrawlJobDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
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

  const loadJobs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = await getToken();
      if (!token) return;
      const data = await getAdminCrawlJobs(token, {
        status: filterStatus || undefined,
        page,
      });
      setJobs(data.items);
      setTotal(data.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "작업 목록 로드 실패");
    } finally {
      setLoading(false);
    }
  }, [getToken, filterStatus, page]);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  const handleCancel = async (jobId: number) => {
    if (!confirm("이 작업을 취소하시겠습니까?")) return;
    const token = await getToken();
    await cancelAdminCrawlJob(token, jobId);
    await loadJobs();
  };

  return (
    <AdminLayout>
      <h2 className="text-lg font-semibold mb-4">크롤링 관리</h2>

      <div className="flex gap-3 mb-4">
        <select
          value={filterStatus}
          onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
          className="text-sm border rounded px-2 py-1"
        >
          <option value="">상태 전체</option>
          <option value="running">실행 중</option>
          <option value="pending">대기</option>
          <option value="completed">완료</option>
          <option value="failed">실패</option>
          <option value="cancelled">취소</option>
        </select>
        <button
          onClick={loadJobs}
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
        <CrawlJobTable jobs={jobs} onCancel={handleCancel} />
      )}

      {total > 20 && (
        <div className="flex justify-center gap-2 mt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="text-sm px-3 py-1 border rounded disabled:opacity-30"
          >
            이전
          </button>
          <span className="text-sm text-gray-500 py-1">{page} / {Math.ceil(total / 20)}</span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= Math.ceil(total / 20)}
            className="text-sm px-3 py-1 border rounded disabled:opacity-30"
          >
            다음
          </button>
        </div>
      )}
    </AdminLayout>
  );
}
