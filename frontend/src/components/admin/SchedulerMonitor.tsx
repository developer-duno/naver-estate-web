"use client";

/** 스케줄러 모니터링 — 작업별 실행 이력 + 다음 실행 시각 테이블 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { getSchedulerStatus } from "@/lib/api";
import type { SchedulerJobStatus } from "@/types/admin";
import AdminCard from "./AdminCard";

/** 상태 뱃지 색상 매핑 */
const STATUS_STYLES: Record<string, string> = {
  completed: "bg-green-100 text-green-700",
  running: "bg-blue-100 text-blue-700",
  failed: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-500",
  pending: "bg-yellow-100 text-yellow-700",
};

/** 상대 시간 포맷 (예: "2시간 전") */
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "방금 전";
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

/** 소요시간 포맷 (예: "1분 23초") */
function formatDuration(seconds: number | undefined | null): string {
  if (seconds == null) return "-";
  if (seconds < 60) return `${seconds}초`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}분 ${s}초` : `${m}분`;
}

interface Props {
  token: string;
}

export default function SchedulerMonitor({ token }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.admin.schedulerStatus(),
    queryFn: () => getSchedulerStatus(token),
    enabled: !!token,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <AdminCard title="스케줄러 모니터링" help="각 자동 작업의 마지막 실행 결과와 다음 실행 시각. 작업 실패(failed)는 빨강. 데이터가 실제로 들어왔는지는 신선도 카드에서 확인">
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />
          ))}
        </div>
      </AdminCard>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
        스케줄러 상태 조회 실패: {(error as Error).message}
      </div>
    );
  }

  if (!data) return null;

  const { jobs, summary } = data;

  const summaryAction = (
    <span className="text-xs text-gray-500">
      오늘 {summary.total_runs_today}회 실행
      {summary.failures_today > 0 && (
        <span className="text-red-600 ml-1">/ {summary.failures_today}건 실패</span>
      )}
    </span>
  );

  return (
    <AdminCard title="스케줄러 모니터링" help="각 자동 작업의 마지막 실행 결과와 다음 실행 시각. 작업 실패(failed)는 빨강. 데이터가 실제로 들어왔는지는 신선도 카드에서 확인" action={summaryAction}>
      {/* 테이블 */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-gray-500">
              <th className="pb-2 pr-3 font-medium">작업</th>
              <th className="pb-2 pr-3 font-medium hidden sm:table-cell">스케줄</th>
              <th className="pb-2 pr-3 font-medium">상태</th>
              <th className="pb-2 pr-3 font-medium hidden md:table-cell">마지막 실행</th>
              <th className="pb-2 pr-3 font-medium hidden md:table-cell">소요시간</th>
              <th className="pb-2 pr-3 font-medium hidden lg:table-cell">처리</th>
              <th className="pb-2 font-medium hidden sm:table-cell">다음 실행</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <JobRow
                key={job.scheduler_job_id}
                job={job}
                expanded={expandedId === job.scheduler_job_id}
                onToggle={() =>
                  setExpandedId(
                    expandedId === job.scheduler_job_id ? null : job.scheduler_job_id
                  )
                }
              />
            ))}
          </tbody>
        </table>
      </div>

      {jobs.length === 0 && (
        <p className="text-sm text-gray-500 text-center py-4">등록된 스케줄러 작업이 없습니다</p>
      )}
    </AdminCard>
  );
}

/** 작업 행 컴포넌트 — 클릭 시 에러 메시지 펼침 */
function JobRow({
  job,
  expanded,
  onToggle,
}: {
  job: SchedulerJobStatus;
  expanded: boolean;
  onToggle: () => void;
}) {
  const isFailed = job.last_run?.status === "failed";
  const hasError = !!job.last_run?.error_message;
  const rowBg = isFailed ? "bg-red-50" : "";

  return (
    <>
      <tr
        className={`border-b last:border-b-0 ${rowBg} ${hasError ? "cursor-pointer hover:bg-gray-50" : ""}`}
        onClick={hasError ? onToggle : undefined}
      >
        {/* 작업명 + 활성화 여부 */}
        <td className="py-2 pr-3">
          <span className="text-gray-800">{job.name}</span>
          {!job.enabled && (
            <span className="ml-1 text-[10px] text-gray-400 border border-gray-200 rounded px-1">OFF</span>
          )}
        </td>

        {/* 스케줄 */}
        <td className="py-2 pr-3 text-gray-500 hidden sm:table-cell">{job.schedule}</td>

        {/* 상태 뱃지 */}
        <td className="py-2 pr-3">
          {job.last_run ? (
            <span
              className={`inline-block text-xs px-1.5 py-0.5 rounded ${STATUS_STYLES[job.last_run.status] ?? "bg-gray-100 text-gray-600"}`}
            >
              {job.last_run.status}
            </span>
          ) : (
            <span className="text-xs text-gray-400">-</span>
          )}
        </td>

        {/* 마지막 실행 (상대시간) */}
        <td className="py-2 pr-3 text-gray-500 hidden md:table-cell">
          {job.last_run?.started_at ? relativeTime(job.last_run.started_at) : "-"}
        </td>

        {/* 소요시간 */}
        <td className="py-2 pr-3 text-gray-500 hidden md:table-cell">
          {formatDuration(job.last_run?.duration_seconds)}
        </td>

        {/* 처리 건수 */}
        <td className="py-2 pr-3 text-gray-500 hidden lg:table-cell">
          {job.last_run
            ? `${(job.last_run.processed_items ?? 0).toLocaleString()}/${(job.last_run.total_items ?? 0).toLocaleString()}`
            : "-"}
        </td>

        {/* 다음 실행 */}
        <td className="py-2 text-gray-500 hidden sm:table-cell">
          {job.next_run_at ? new Date(job.next_run_at).toLocaleString("ko") : "-"}
        </td>
      </tr>

      {/* 에러 메시지 펼침 영역 */}
      {expanded && job.last_run?.error_message && (
        <tr>
          <td colSpan={7} className="px-3 py-2 bg-red-50 text-xs text-red-700 whitespace-pre-wrap">
            {job.last_run.error_message}
          </td>
        </tr>
      )}
    </>
  );
}
