/**
 * 관리자 "외부 자료 지금 받아오기" 버튼 8종의 정본 (사장님 결정 2026-09-26).
 *
 * - name        : BE 가 받는 수집기 이름 (backend/routers/admin/collect.py `CollectorName` — 집합 일치는
 *                 src/lib/admin/__tests__/collectors.test.ts 가 그 파일을 읽어 대조한다)
 * - jobType     : 그 수집기가 남기는 crawl_jobs.job_type — 버튼 이름은 이 값의 한글 이름표(crawl-job-labels.ts,
 *                 BE plain_words.JOB_WORDS 와 같은 표현)를 그대로 쓴다. 이름을 여기 손으로 또 적지 않는다.
 * - schedulerJobId : 마지막 실행·결과를 읽어 올 scheduler-status 의 잡 id (crawler/scheduler.py)
 * - manualCounted  : 이 버튼으로 돌린 실행도 그 잡 id 로 기록되는가.
 *                 false 인 둘(backfill-price·metrics)은 BE 가 수동 실행에 잡 id 를 붙이지 않아
 *                 scheduler-status 에는 자동 실행만 보인다 → 화면에 "마지막 자동 실행" 이라고 적는다.
 * - long        : 한 번 돌면 오래 걸리는 것. 이 API 는 끝날 때까지 답을 안 주는데(동기 실행) 화면은 120초까지만
 *                 기다린다 → 오래 걸리는 것은 잠깐만 기다린 뒤 "시작했어요" 로 보여 준다
 *                 (연결을 끊어도 서버의 수집은 계속 돈다).
 * - confirm     : 누르기 전에 묻는 문장. 시간·호출 수는 .claude/rules/infra.md 표와 backend/.claude/details.md 의 실측값.
 */
import type { SchedulerLastRun } from "@/types/admin";
import { formatRelativeKo } from "@/lib/format-relative";

export type CollectorName =
  | "crime-stats"
  | "air-quality"
  | "emergency"
  | "childcare"
  | "backfill-price"
  | "metrics"
  | "kapt-match"
  | "kapt-costs";

export interface CollectorDef {
  name: CollectorName;
  jobType: string;
  schedulerJobId: string;
  manualCounted: boolean;
  description: string;
  long: boolean;
  confirm?: string;
}

export const COLLECTORS: readonly CollectorDef[] = [
  {
    name: "crime-stats",
    jobType: "crime_stats",
    schedulerJobId: "collect_crime_stats",
    manualCounted: true,
    description: "경찰청 시군구별 범죄 통계를 새로 받아요",
    long: false,
  },
  {
    name: "air-quality",
    jobType: "air_quality",
    schedulerJobId: "collect_air_quality",
    manualCounted: true,
    description: "미세먼지를 한동안 못 받은 단지 100곳부터 새로 받아요",
    long: false,
  },
  {
    name: "emergency",
    jobType: "emergency",
    schedulerJobId: "collect_emergency",
    manualCounted: true,
    description: "전국 응급실 목록을 받아 단지마다 가까운 곳을 다시 찾아요",
    long: false,
  },
  {
    name: "childcare",
    jobType: "childcare",
    schedulerJobId: "collect_childcare",
    manualCounted: true,
    description: "전국 어린이집 정원·교사 정보를 받아 단지마다 다시 붙여요",
    long: true,
    confirm:
      "지금 시작하면 약 20~30분(예상) 걸리고 어린이집 자료 호출을 약 250회 써요. " +
      "이 창구는 미분양 서비스와 하루 1,000회를 나눠 쓰는데, 새벽 4시 30분 이후엔 그쪽이 한도를 다 써서 실패할 수 있어요. 계속할까요?",
  },
  {
    name: "backfill-price",
    jobType: "price_backfill",
    schedulerJobId: "backfill_price",
    manualCounted: false,
    description: "시세 기록이 적은 큰 단지 20곳을 골라 지난 2년 실거래가를 채워요",
    long: true,
    confirm:
      "지금 시작하면 보통 몇 분, 자료가 많으면 한 시간 넘게 걸리고 공공데이터 호출을 최대 약 480회 써요 " +
      "(하루 1만 회를 미분양 서비스와 나눠 써요). 계속할까요?",
  },
  {
    name: "metrics",
    jobType: "complex_metric",
    schedulerJobId: "collect_metrics",
    manualCounted: false,
    description: "모아 둔 시세로 단지 200곳의 가치 점수를 다시 계산해요 (외부 호출 없음)",
    long: false,
  },
  {
    name: "kapt-match",
    jobType: "kapt_match",
    schedulerJobId: "kapt_match",
    manualCounted: true,
    description: "관리비 사이트(K-apt)의 전국 단지 목록과 우리 단지를 다시 짝지어요",
    long: true,
    confirm:
      "지금 시작하면 약 3~4시간 반 걸리고 관리비 자료 호출을 약 1만 5천 회 써요. " +
      "짝이 바뀐 단지는 옛 연결과 관리비 기록이 정리돼요. 계속할까요?",
  },
  {
    name: "kapt-costs",
    jobType: "kapt_costs",
    schedulerJobId: "kapt_costs",
    manualCounted: true,
    description: "짝지어진 단지 500곳의 새로 나온 달 관리비를 받아요",
    long: true,
    confirm:
      "지금 시작하면 약 55~65분 걸리고 관리비 자료 호출을 약 1만 2천 회 써요 (하루 한도 10만 회). 계속할까요?",
  },
];

export type LastRunTone = "ok" | "fail" | "running" | "none";

export interface LastRunSummary {
  /** 버튼 아래 한 줄 */
  text: string;
  tone: LastRunTone;
  /** 지금 도는 중 — 버튼을 막는다 */
  running: boolean;
  /** 실패 원문 (마우스 올리면 보이게) */
  raw?: string;
}

/** scheduler-status 의 마지막 실행 → 버튼 아래 한 줄 */
export function describeLastRun(
  lastRun: SchedulerLastRun | null | undefined,
  manualCounted: boolean,
  now: Date = new Date(),
): LastRunSummary {
  const head = manualCounted ? "마지막 실행" : "마지막 자동 실행";
  if (!lastRun) return { text: `${head}: 기록 없음`, tone: "none", running: false };
  const startedRel = formatRelativeKo(lastRun.started_at, now);
  const endRel = formatRelativeKo(lastRun.completed_at ?? lastRun.started_at, now);
  switch (lastRun.status) {
    case "running":
    case "pending":
      return { text: `지금 도는 중 (${startedRel} 시작)`, tone: "running", running: true };
    case "completed": {
      const total = lastRun.total_items ?? 0;
      const done = lastRun.processed_items ?? 0;
      const count = total > 0 ? ` (${done.toLocaleString("ko-KR")}/${total.toLocaleString("ko-KR")}건)` : "";
      return { text: `${head}: ${endRel} · 완료${count}`, tone: "ok", running: false };
    }
    case "failed": {
      const reason = lastRun.error_plain || (lastRun.error_message ? "사유는 아래 '수집 작업 목록'에서 보세요" : "");
      return {
        text: `${head}: ${endRel} 실패${reason ? ` — ${reason}` : ""}`,
        tone: "fail",
        running: false,
        raw: lastRun.error_message ?? undefined,
      };
    }
    case "cancelled":
      return { text: `${head}: ${endRel} · 취소됨`, tone: "none", running: false };
    case "paused":
      return { text: `${head}: ${startedRel} 시작 · 일시정지`, tone: "none", running: false };
    default:
      return { text: `${head}: ${endRel}`, tone: "none", running: false };
  }
}
