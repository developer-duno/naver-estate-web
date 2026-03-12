"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import AdminLayout from "@/components/admin/AdminLayout";
import StatsCards from "@/components/admin/StatsCards";
import { getAdminDetailedStats, getAdminAuditLogs, getAdminCrawlJobs } from "@/lib/api";
import type { DetailedStats, AuditLog, CrawlJobDetail } from "@/types/admin";

export default function AdminDashboard() {
  const [stats, setStats] = useState<DetailedStats | null>(null);
  const [recentLogs, setRecentLogs] = useState<AuditLog[]>([]);
  const [runningJobs, setRunningJobs] = useState<CrawlJobDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const token = session.access_token;

      try {
        const [statsData, logsData, jobsData] = await Promise.all([
          getAdminDetailedStats(token),
          getAdminAuditLogs(token, { page: 1 }),
          getAdminCrawlJobs(token, { status: "running" }),
        ]);
        setStats(statsData);
        setRecentLogs(logsData.items.slice(0, 5));
        setRunningJobs(jobsData.items);
      } catch (e) {
        setError(e instanceof Error ? e.message : "데이터 로드 실패");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  return (
    <AdminLayout>
      <h2 className="text-lg font-semibold mb-4">대시보드</h2>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 mb-4">{error}</div>
      )}

      <StatsCards stats={stats} loading={loading} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        {/* 실행 중인 크롤링 */}
        <div className="bg-white border rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">실행 중인 크롤링</h3>
          {runningJobs.length === 0 ? (
            <p className="text-sm text-gray-400">실행 중인 작업이 없습니다</p>
          ) : (
            <ul className="space-y-2">
              {runningJobs.map((j) => (
                <li key={j.id} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">{j.job_type} — {j.target_id || "전체"}</span>
                  <span className="text-xs text-blue-600">{j.processed_items}/{j.total_items}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 최근 활동 */}
        <div className="bg-white border rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">최근 활동</h3>
          {recentLogs.length === 0 ? (
            <p className="text-sm text-gray-400">활동 기록이 없습니다</p>
          ) : (
            <ul className="space-y-2">
              {recentLogs.map((l) => (
                <li key={l.id} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">
                    <span className="bg-gray-100 text-xs px-1.5 py-0.5 rounded mr-1">{l.action}</span>
                    {l.target_type ? `${l.target_type}:${l.target_id || ""}` : ""}
                  </span>
                  <span className="text-xs text-gray-400">
                    {l.created_at ? new Date(l.created_at).toLocaleString("ko") : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
