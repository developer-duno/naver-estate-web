"use client";

/**
 * "외부 자료 지금 받아오기" — 수집기 8종을 손으로 한 번 더 돌리는 버튼 (자료 수집 관리 화면, 사장님 결정 2026-09-26).
 *
 * 버튼마다 마지막 실행·결과 한 줄을 scheduler-status 에서 읽어 붙인다(자동 작업 현황과 같은 쿼리 키라
 * 같은 화면에 둘이 있어도 요청은 한 번). 수집기 정의·확인 문장·버튼 이름의 정본 = lib/admin/collectors.ts.
 *
 * 누른 뒤(세션 420): BE 는 수집기를 백그라운드로 시작하고 곧바로 "시작" 을 답한다. 결과(성공·실패·몇 건,
 * 한도로 멈춘 사유)는 수집기가 자기 crawl_jobs 행에 남기므로, 화면은 '지금 돌아가는 작업'·수집 작업 목록과
 * 버튼 아래 마지막 실행 한 줄로 본다. 같은 수집기가 이미 돌면(수동이든 자동이든) BE 가 409 + 우리말 문구.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSchedulerStatus, triggerCollection } from "@/lib/api";
import { ApiError } from "@/lib/api/core";
import { queryKeys } from "@/lib/query-keys";
import { jobTypeLabel } from "@/lib/crawl-job-labels";
import { COLLECTORS, describeLastRun, type CollectorDef, type CollectorName } from "@/lib/admin/collectors";
import AdminCard from "./AdminCard";

const HELP =
  "정해진 일정 말고 지금 한 번 더 받아오고 싶을 때 누르세요. 버튼 아래 줄은 그 작업이 마지막으로 언제 돌았고 어떻게 끝났는지예요. " +
  "누르면 서버에서 받기 시작하고, 진행과 결과는 '지금 돌아가는 작업'과 아래 '수집 작업 목록'에서 볼 수 있어요. " +
  "지금 도는 중인 작업은 두 번 돌지 않게 버튼이 잠겨요";

export const STARTED_TEXT = "시작했어요 — 진행 상황은 '지금 돌아가는 작업'에서 볼 수 있어요";

interface ResultLine {
  ok: boolean;
  message: string;
}

interface CollectorTriggerProps {
  token: string;
  getToken: () => Promise<string>;
}

export default function CollectorTrigger({ token, getToken }: CollectorTriggerProps) {
  const queryClient = useQueryClient();
  const [results, setResults] = useState<Partial<Record<CollectorName, ResultLine>>>({});

  const statusQuery = useQuery({
    queryKey: queryKeys.admin.schedulerStatus(),
    queryFn: () => getSchedulerStatus(token),
    enabled: !!token,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const jobsById = new Map((statusQuery.data?.jobs ?? []).map((j) => [j.scheduler_job_id, j]));

  const refreshLists = () => {
    // 접두 키 — 수집 작업 목록의 모든 조건(상태·유형·쪽)과 '지금 돌아가는 작업'(같은 접두 + "running")을 한 번에 새로 받는다
    queryClient.invalidateQueries({ queryKey: queryKeys.admin.crawlJobs() });
    queryClient.invalidateQueries({ queryKey: queryKeys.admin.schedulerStatus() });
  };

  const mutation = useMutation<unknown, Error, CollectorDef>({
    mutationFn: async (c) => triggerCollection(await getToken(), c.name),
    onSuccess: (_data, c) => {
      setResults((prev) => ({ ...prev, [c.name]: { ok: true, message: STARTED_TEXT } }));
      refreshLists();
    },
    onError: (err, c) => {
      // BE 가 준 거절 문구(detail — 409 "이미 돌고 있어요…" 등)는 이미 우리말이다. 연결 자체가 안 되면 그 원문 대신 한 줄.
      const message = err instanceof ApiError ? err.message : "서버에 연결하지 못했어요 — 잠시 뒤 다시 눌러 주세요";
      setResults((prev) => ({ ...prev, [c.name]: { ok: false, message } }));
      refreshLists();
    },
  });

  const handleClick = (c: CollectorDef) => {
    if (c.confirm && !window.confirm(c.confirm)) return;
    setResults((prev) => ({ ...prev, [c.name]: undefined }));
    mutation.mutate(c);
  };

  return (
    <AdminCard title="외부 자료 지금 받아오기" help={HELP}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {COLLECTORS.map((c) => {
          const result = results[c.name];
          const isLoading = mutation.isPending && mutation.variables?.name === c.name;
          const job = jobsById.get(c.schedulerJobId);
          const last = statusQuery.data ? describeLastRun(job?.last_run, c.manualCounted) : null;
          const alreadyRunning = !!last?.running;
          return (
            <button
              key={c.name}
              type="button"
              data-collector={c.name}
              onClick={() => handleClick(c)}
              disabled={mutation.isPending || alreadyRunning}
              className="flex flex-col items-start p-3 border rounded-lg hover:bg-gray-50
                         disabled:opacity-60 disabled:cursor-not-allowed text-left transition-colors"
            >
              <span className="text-sm font-medium">{jobTypeLabel(c.jobType)}</span>
              <span className="text-xs text-gray-500 mt-0.5">{c.description}</span>
              {last && (
                <span
                  className={`text-xs mt-1 flex items-start gap-1 ${
                    last.tone === "fail" ? "text-red-700" : last.tone === "running" ? "text-blue-700" : "text-gray-600"
                  }`}
                  title={last.raw}
                >
                  {last.tone === "fail" && (
                    <span aria-hidden className="mt-1 inline-block w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                  )}
                  <span>{last.text}</span>
                </span>
              )}
              {statusQuery.isError && (
                <span className="text-xs text-gray-500 mt-1">마지막 실행 정보를 불러오지 못했어요</span>
              )}
              {alreadyRunning && !isLoading && (
                <span className="text-xs text-blue-700 mt-1">이미 도는 중이라 지금은 누를 수 없어요</span>
              )}
              {isLoading && (
                <span className="text-xs text-blue-600 mt-1">시작하는 중...</span>
              )}
              {!isLoading && result && (
                <span className={`text-xs mt-1 ${result.ok ? "text-green-700" : "text-red-600"}`}>{result.message}</span>
              )}
            </button>
          );
        })}
      </div>
    </AdminCard>
  );
}
