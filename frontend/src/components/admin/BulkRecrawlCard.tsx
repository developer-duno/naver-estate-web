"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getRecrawlProgress,
  getRecrawlStatus,
  runRecrawlArticles,
  type RecrawlProgress,
  type RecrawlStatus,
} from "@/lib/api";
import AdminCard from "./AdminCard";
import RawDetail from "./RawDetail";

interface Props {
  getToken: () => Promise<string>;
}

const BATCH_OPTIONS = [50, 100, 200, 500] as const;

const LEVEL_STYLES: Record<RecrawlStatus["level"], { dot: string; border: string; text: string; label: string }> = {
  safe: { dot: "bg-green-500", border: "border-green-300", text: "text-green-800", label: "🟢 안전" },
  warn: { dot: "bg-yellow-500", border: "border-yellow-300", text: "text-yellow-800", label: "🟡 주의" },
  danger: { dot: "bg-red-500", border: "border-red-300", text: "text-red-800", label: "🔴 위험" },
};

export default function BulkRecrawlCard({ getToken }: Props) {
  const [batchSize, setBatchSize] = useState<number>(100);
  const qc = useQueryClient();

  const statusQuery = useQuery<RecrawlStatus, Error>({
    queryKey: ["admin", "recrawl", "status"] as const,
    queryFn: async () => {
      const token = await getToken();
      return getRecrawlStatus(token);
    },
    refetchInterval: 30_000,
  });

  const progressQuery = useQuery<RecrawlProgress, Error>({
    queryKey: ["admin", "recrawl", "progress"] as const,
    queryFn: async () => {
      const token = await getToken();
      return getRecrawlProgress(token);
    },
    refetchInterval: (q) => (q.state.data?.job?.status === "running" ? 3_000 : 15_000),
  });

  const runMut = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return runRecrawlArticles(token, batchSize, false);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "recrawl", "status"] });
      qc.invalidateQueries({ queryKey: ["admin", "recrawl", "progress"] });
    },
  });

  const status = statusQuery.data;
  const level = status?.level ?? "warn";
  const style = LEVEL_STYLES[level];
  const isDanger = level === "danger";
  const inProgress = status?.recrawl_in_progress ?? false;
  const disabled = statusQuery.isLoading || runMut.isPending || isDanger || inProgress;
  const estimatedMinutes = Math.ceil((batchSize * (status?.estimated_seconds_per_100 ?? 300)) / 100 / 60);

  const levelBadge = status ? (
    <span className={`inline-flex items-center gap-1 text-xs ${style.text}`}>
      <span className={`inline-block w-2 h-2 rounded-full ${style.dot}`} />
      {style.label}
    </span>
  ) : null;

  return (
    <AdminCard title="오래된 단지 한 번에 다시 수집" help="가장 오래 갱신 안 된 단지들을 한꺼번에 다시 수집해요. 새벽 5시~오전 10시(한국 시간)에 돌리는 게 안전해요. 그 외 시간엔 자동 작업과 겹쳐서 네이버에서 차단당할 위험이 있어요" action={levelBadge}>
      {statusQuery.isLoading && <p className="text-xs text-gray-500">상태 확인 중...</p>}

      {status && (
        <div className={`mb-3 p-2 border rounded text-xs ${style.border} ${style.text} bg-gray-50`}>
          {status.message}
          <div className="mt-1 text-gray-600">
            지금 한국 시간 {status.current_kst_hour}시 · 자동 수집 실행 중 {status.running_jobs_count}건 · 추천 시간대 {status.recommended_window_kst}
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3">
        <label className="text-xs text-gray-600">단지 수</label>
        <div className="flex gap-1">
          {BATCH_OPTIONS.map((n) => (
            <button
              key={n}
              onClick={() => setBatchSize(n)}
              className={`px-2 py-1 text-xs rounded border ${
                batchSize === n ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-700 border-gray-300"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-gray-500">약 {estimatedMinutes}분 소요</span>
      </div>

      <button
        onClick={() => runMut.mutate()}
        disabled={disabled}
        className="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white rounded text-sm disabled:opacity-50 hover:bg-blue-700"
      >
        {runMut.isPending ? "시작 중..." : inProgress ? "이미 실행 중" : "지금 실행"}
      </button>

      {isDanger && (
        <p className="mt-2 text-[11px] text-red-700">위험 상태에서는 실행이 막혀 있어요. 추천 시간대({status?.recommended_window_kst})에 다시 눌러 주세요.</p>
      )}

      {runMut.data && (
        <p className="mt-2 text-xs text-green-700">✓ 시작됨 — 한 번에 {runMut.data.batch_size}개 단지</p>
      )}
      {runMut.error && <p className="mt-2 text-xs text-red-700">{runMut.error.message}</p>}

      {progressQuery.data?.job && (
        <div className="mt-3 p-2 bg-gray-50 border border-gray-200 rounded">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-gray-700 font-medium">
              진행: {progressQuery.data.job.processed_items}/{progressQuery.data.job.total_items}건
            </span>
            <span
              className={
                progressQuery.data.job.status === "running"
                  ? "text-blue-700"
                  : progressQuery.data.job.status === "completed"
                    ? "text-green-700"
                    : "text-red-700"
              }
            >
              {progressQuery.data.job.status === "running" && "수집 중..."}
              {progressQuery.data.job.status === "completed" && "✓ 완료"}
              {progressQuery.data.job.status === "failed" && "✗ 실패"}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded h-1.5 overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                progressQuery.data.job.status === "failed" ? "bg-red-500" : "bg-blue-500"
              }`}
              style={{
                width: `${Math.min(100, Math.round((progressQuery.data.job.processed_items / Math.max(1, progressQuery.data.job.total_items)) * 100))}%`,
              }}
            />
          </div>
          {/* 쉬운 우리말을 보여주고 원문은 title 로 (세션 411, SchedulerMonitor 와 같은 방식).
              빈 문자열도 원문으로 폴백해야 하므로 `??` 가 아니라 `||` 를 쓴다. */}
          {progressQuery.data.job.error_message && (
            <p className="mt-1 text-[11px] text-red-700" title={progressQuery.data.job.error_message}>
              {progressQuery.data.job.error_plain || progressQuery.data.job.error_message}
            </p>
          )}
          {/* 우리말 번역이 따로 있을 때만 원문을 눌러서 펼친다(휴대폰) — 번역이 없으면 위 줄이 이미 원문이다 */}
          {progressQuery.data.job.error_plain && (
            <RawDetail raw={progressQuery.data.job.error_message} className="mt-0.5" />
          )}
        </div>
      )}

      <p className="mt-2 text-[11px] text-gray-500">
        가장 오래 수집 안 된 단지부터 차례대로 다시 가져와요. 자동 작업과 속도 제한을 같이 써서 네이버에 부담을 주지 않아요.
      </p>
    </AdminCard>
  );
}
