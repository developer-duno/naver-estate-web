"use client";

/**
 * "외부 자료 지금 받아오기" — 수집기 8종을 손으로 한 번 더 돌리는 버튼 (자료 수집 관리 화면, 사장님 결정 2026-09-26).
 *
 * 버튼마다 마지막 실행·결과 한 줄을 scheduler-status 에서 읽어 붙인다(자동 작업 현황과 같은 쿼리 키라
 * 같은 화면에 둘이 있어도 요청은 한 번). 수집기 정의·확인 문장·버튼 이름의 정본 = lib/admin/collectors.ts.
 *
 * 누른 뒤: BE 는 수집이 끝나야 답을 준다(동기 실행). 화면이 기다리는 한도는 120초(LIVE_TIMEOUT_MS,
 * Cloudflare 기본 125초보다 짧다)라, 한 시간짜리 수집은 화면엔 "응답 시간 초과" 실패로 보이는데 서버는
 * 계속 돈다(동기 함수는 스레드에서 돌아 연결이 끊겨도 멈추지 않는다). 그래서 오래 걸리는 수집기는
 * LONG_WAIT_MS 만 기다린 뒤 화면이 먼저 손을 떼고 "시작했어요" 를 보여 준다. 짧은 것도 SHORT_WAIT_MS 까지만.
 * 그 안에 온 답(바로 거절·이미 도는 중·짧은 수집 완료)은 그대로 보여 준다.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSchedulerStatus, triggerCollection } from "@/lib/api";
import type { CollectionResult } from "@/lib/api/admin";
import { ApiError } from "@/lib/api/core";
import { queryKeys } from "@/lib/query-keys";
import { jobTypeLabel } from "@/lib/crawl-job-labels";
import { COLLECTORS, describeLastRun, type CollectorDef, type CollectorName } from "@/lib/admin/collectors";
import AdminCard from "./AdminCard";

/** 오래 걸리는 수집기 — 이만큼만 기다리고 "시작했어요" (바로 오는 거절·이미 도는 중은 이 안에 온다) */
export const LONG_WAIT_MS = 10_000;
/** 짧은 수집기 — 이보다 오래 걸리면 "아직 받는 중" 으로 보여 준다(120초 한도보다 앞) */
export const SHORT_WAIT_MS = 90_000;

const HELP =
  "정해진 일정 말고 지금 한 번 더 받아오고 싶을 때 누르세요. 버튼 아래 줄은 그 작업이 마지막으로 언제 돌았고 어떻게 끝났는지예요. " +
  "오래 걸리는 것(관리비·어린이집·옛 시세)은 누르면 서버에서 계속 돌고, 진행은 아래 '수집 작업 목록'에서 볼 수 있어요. " +
  "지금 도는 중인 작업은 두 번 돌지 않게 버튼이 잠겨요";

const LIST_HINT = "진행은 아래 '수집 작업 목록'에서 보세요";

type Outcome = { kind: "done"; data: CollectionResult } | { kind: "started"; long: boolean };

interface ResultLine {
  ok: boolean;
  message: string;
}

/** 수집기가 실패를 값으로 돌려줬을 때의 문구 (HTTP 200 이어도 실패) */
function failureText(data: CollectionResult): string {
  if (data.error === "already_running") return "이미 도는 회차가 있어요 — 끝난 뒤에 다시 눌러 주세요";
  return `받기 실패 — 사유는 아래 '수집 작업 목록'에서 보세요`;
}

/** 끝까지 받은 답 → 한 줄 */
function doneLine(data: CollectionResult): ResultLine {
  // 세션 362: backfill-price 는 호출 한도가 이미 바닥이면 0단지만 처리하고 끝난다 — "완료"로 보이면 오해한다.
  if (data.quota_exhausted) {
    return { ok: false, message: `하루 호출 한도를 다 써서 중단 (${data.success ?? 0}/${data.total ?? 0}건)` };
  }
  if (data.error) return { ok: false, message: failureText(data) };
  if (typeof data.success === "number" && typeof data.total === "number") {
    return { ok: true, message: `수집 완료 (${data.success}/${data.total}건)` };
  }
  if (typeof data.matched === "number") return { ok: true, message: `수집 완료 — ${data.matched}곳 짝지음` };
  if (typeof data.collected === "number") return { ok: true, message: `수집 완료 — ${data.collected}곳 받음` };
  return { ok: true, message: "수집 완료" };
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
    // 접두 키 — 목록의 모든 조건(상태·유형·쪽)을 한 번에 새로 받는다
    queryClient.invalidateQueries({ queryKey: queryKeys.admin.crawlJobs() });
    queryClient.invalidateQueries({ queryKey: queryKeys.admin.schedulerStatus() });
  };

  const mutation = useMutation<Outcome, Error, CollectorDef>({
    mutationFn: async (c) => {
      const t = await getToken();
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), c.long ? LONG_WAIT_MS : SHORT_WAIT_MS);
      try {
        return { kind: "done", data: await triggerCollection(t, c.name, ctrl.signal) };
      } catch (err) {
        // 화면이 먼저 손을 뗀 것 — 요청은 이미 서버에 닿아 수집이 돌고 있다
        if (ctrl.signal.aborted) return { kind: "started", long: c.long };
        throw err;
      } finally {
        clearTimeout(timer);
      }
    },
    onSuccess: (outcome, c) => {
      const line: ResultLine =
        outcome.kind === "done"
          ? doneLine(outcome.data)
          : {
              ok: true,
              message: outcome.long
                ? `시작했어요 — 서버에서 계속 받아요. ${LIST_HINT}`
                : `아직 받는 중이에요 — 서버에서 계속 받아요. ${LIST_HINT}`,
            };
      setResults((prev) => ({ ...prev, [c.name]: line }));
      refreshLists();
    },
    onError: (err, c) => {
      // BE 가 준 거절 문구(detail)는 이미 우리말이다(explain_error). 연결 자체가 안 되면 그 원문 대신 한 줄.
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
                <span className="text-xs text-blue-600 mt-1">{c.long ? "시작하는 중..." : "받는 중..."}</span>
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
