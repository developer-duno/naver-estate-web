"use client";

import type { CrawlJobDetail } from "@/types/admin";
import { jobTypeLabel } from "@/lib/crawl-job-labels";

interface Props {
  jobs: CrawlJobDetail[];
  onCancel?: (jobId: number) => Promise<void>;
  onPause?: (jobId: number) => Promise<void>;
  onResume?: (jobId: number) => Promise<void>;
}

const STATUS_COLORS: Record<string, string> = {
  completed: "bg-green-100 text-green-700",
  running: "bg-blue-100 text-blue-700",
  pending: "bg-yellow-100 text-yellow-700",
  paused: "bg-amber-100 text-amber-700",
  failed: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-500",
};

const STATUS_LABELS: Record<string, string> = {
  completed: "완료",
  running: "실행 중",
  pending: "대기",
  paused: "일시정지",
  failed: "실패",
  cancelled: "취소",
};

export default function CrawlJobTable({ jobs, onCancel, onPause, onResume }: Props) {
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
              <td className="py-2 pr-3">
                <div className="flex flex-col">
                  <span className="text-gray-800">{jobTypeLabel(j.job_type)}</span>
                  <span className="text-[10px] text-gray-400">{j.job_type}</span>
                </div>
              </td>
              <td className="py-2 pr-3 text-xs text-gray-600 max-w-[120px] truncate select-text">{j.target_id || "-"}</td>
              <td className="py-2 pr-3">
                <span className={`text-xs px-1.5 py-0.5 rounded ${STATUS_COLORS[j.status] || "bg-gray-100"}`}>
                  {STATUS_LABELS[j.status] || j.status}
                </span>
              </td>
              <td className="py-2 pr-3 text-xs">
                {j.processed_items}/{j.total_items}
              </td>
              <td className="py-2 pr-3 text-xs text-gray-500">
                {j.started_at ? new Date(j.started_at).toLocaleString("ko") : "-"}
              </td>
              <td className="py-2">
                <div className="flex gap-2">
                  {onPause && j.status === "running" && (
                    <button
                      onClick={() => onPause(j.id)}
                      className="text-xs text-amber-600 hover:text-amber-800"
                    >
                      일시정지
                    </button>
                  )}
                  {onResume && j.status === "paused" && (
                    <button
                      onClick={() => onResume(j.id)}
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      재개
                    </button>
                  )}
                  {onCancel && (j.status === "running" || j.status === "pending" || j.status === "paused") && (
                    <button
                      onClick={() => onCancel(j.id)}
                      className="text-xs text-red-600 hover:text-red-800"
                    >
                      취소
                    </button>
                  )}
                </div>
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
