"use client";

import type { CrawlJobDetail } from "@/types/admin";

interface Props {
  jobs: CrawlJobDetail[];
  onCancel?: (jobId: number) => Promise<void>;
}

const STATUS_COLORS: Record<string, string> = {
  completed: "bg-green-100 text-green-700",
  running: "bg-blue-100 text-blue-700",
  pending: "bg-yellow-100 text-yellow-700",
  failed: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-500",
};

export default function CrawlJobTable({ jobs, onCancel }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-gray-500">
            <th className="py-2 pr-3">ID</th>
            <th className="py-2 pr-3">유형</th>
            <th className="py-2 pr-3">대상</th>
            <th className="py-2 pr-3">상태</th>
            <th className="py-2 pr-3">진행률</th>
            <th className="py-2 pr-3">시작</th>
            <th className="py-2">작업</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => (
            <tr key={j.id} className="border-b hover:bg-gray-50">
              <td className="py-2 pr-3 text-gray-500">{j.id}</td>
              <td className="py-2 pr-3">{j.job_type}</td>
              <td className="py-2 pr-3 text-xs text-gray-600 max-w-[120px] truncate">{j.target_id || "-"}</td>
              <td className="py-2 pr-3">
                <span className={`text-xs px-1.5 py-0.5 rounded ${STATUS_COLORS[j.status] || "bg-gray-100"}`}>
                  {j.status}
                </span>
              </td>
              <td className="py-2 pr-3 text-xs">
                {j.processed_items}/{j.total_items}
              </td>
              <td className="py-2 pr-3 text-xs text-gray-500">
                {j.started_at ? new Date(j.started_at).toLocaleString("ko") : "-"}
              </td>
              <td className="py-2">
                {onCancel && (j.status === "running" || j.status === "pending") && (
                  <button
                    onClick={() => onCancel(j.id)}
                    className="text-xs text-red-600 hover:text-red-800"
                  >
                    취소
                  </button>
                )}
              </td>
            </tr>
          ))}
          {jobs.length === 0 && (
            <tr><td colSpan={7} className="py-6 text-center text-gray-500">작업이 없습니다</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
