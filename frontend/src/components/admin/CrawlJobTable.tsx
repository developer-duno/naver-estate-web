"use client";

import type { CrawlJobDetail } from "@/types/admin";
import { jobTypeLabel } from "@/lib/crawl-job-labels";
import RawDetail from "./RawDetail";
import {
  JOB_STATUS_STYLES,
  FALLBACK_CHIP,
  type JobStatus,
} from "@/lib/admin/job-status-styles";

interface Props {
  jobs: CrawlJobDetail[];
  onCancel?: (jobId: number) => Promise<void>;
  onPause?: (jobId: number) => Promise<void>;
  onResume?: (jobId: number) => Promise<void>;
}

export default function CrawlJobTable({ jobs, onCancel, onPause, onResume }: Props) {
  return (
    <div className="overflow-x-auto">
      {/* 7열 — 휴대폰(390px)에서 칸이 눌려 글자가 세로로 꺾이지 않게 최소 폭을 두고 가로로 넘긴다 */}
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b text-left text-gray-500">
            <th className="py-2 pr-3">번호</th>
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
                {/* 작업 코드 원문은 마우스를 올리거나 이름을 누르면 (본문에는 우리말 이름만) */}
                <RawDetail raw={j.job_type}>
                  <span className="text-gray-800" title={j.job_type}>
                    {jobTypeLabel(j.job_type)}
                  </span>
                </RawDetail>
              </td>
              <td className="py-2 pr-3 text-xs text-gray-600 max-w-30 truncate select-text">{j.target_id || "-"}</td>
              <td className="py-2 pr-3">
                {JOB_STATUS_STYLES[j.status as JobStatus] ? (
                  <span className={`text-xs px-1.5 py-0.5 rounded ${JOB_STATUS_STYLES[j.status as JobStatus].chip}`}>
                    {JOB_STATUS_STYLES[j.status as JobStatus].label}
                  </span>
                ) : (
                  // 모르는 상태값 — 영문 원문 대신 "알 수 없음", 원문은 title 과 누르면 펼침으로 보존
                  <RawDetail raw={j.status}>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${FALLBACK_CHIP}`} title={j.status}>
                      알 수 없음
                    </span>
                  </RawDetail>
                )}
                {/* 실패 사유 — BE 가 준 우리말 한 줄(error_plain)이 보이고, 원문은 마우스를 올리거나
                    그 아래 "원문 보기"를 누르면. 옛 BE 처럼 error_plain 이 없으면 줄 자체를 그리지 않는다 */}
                {j.status === "failed" && j.error_plain && (
                  <>
                    <span
                      className="mt-1 block max-w-[16rem] text-xs text-red-700 whitespace-normal"
                      title={j.error_message || undefined}
                    >
                      {j.error_plain}
                    </span>
                    <RawDetail raw={j.error_message} className="mt-0.5 max-w-[16rem]" />
                  </>
                )}
                {/* 완료했지만 사유가 남은 회차(세션 420) — 예: 소급 배치가 우리 하루 예산에 걸려 멈춤,
                    일부 시군구를 못 받음. 실패가 아니므로 빨강 대신 흐린 주황 한 줄. 원문은 title 로만,
                    error_plain 이 없는 옛 BE 면 실패 줄과 같은 까닭으로 그리지 않는다(원문이 본문에 새지 않게) */}
                {j.status === "completed" && j.error_plain && (
                  <span
                    className="mt-1 block max-w-[16rem] text-xs text-amber-700 whitespace-normal"
                    title={j.error_message || undefined}
                  >
                    {j.error_plain}
                  </span>
                )}
              </td>
              <td className="py-2 pr-3 text-xs">
                {j.processed_items}/{j.total_items}건
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
