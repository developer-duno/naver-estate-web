/**
 * CollectorTrigger 컴포넌트 테스트 — "외부 자료 지금 받아오기" 버튼 8종 (사장님 결정 2026-09-26)
 * 실행: npx vitest run src/components/__tests__/CollectorTrigger.test.tsx
 *
 * 검증하는 것:
 *  1. 버튼 8개 — 이름은 crawl-job-labels(BE JOB_WORDS 와 같은 표현)
 *  2. 버튼마다 마지막 실행·결과 한 줄(scheduler-status) — 실패면 빨간 점 + 우리말 사유, 도는 중이면 버튼 잠금
 *  3. 오래 걸리는 수집기는 확인창을 거치고, 취소하면 API 를 부르지 않는다
 *  4. 누르면 BE 가 곧바로 "시작" 을 답한다(세션 420 백그라운드화) → "시작했어요" + '지금 돌아가는 작업'·현황 새로고침
 *  5. 이미 도는 중(409)이면 BE 의 우리말 문구 그대로, 연결 실패 원문은 쉬운 한 줄로
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { SchedulerJobStatus, SchedulerStatusResponse } from "@/types/admin";
import { ApiError } from "@/lib/api/core";

vi.mock("@/lib/api", () => ({
  triggerCollection: vi.fn(),
  getSchedulerStatus: vi.fn(),
}));

import { triggerCollection, getSchedulerStatus } from "@/lib/api";
import CollectorTrigger, { STARTED_TEXT } from "../admin/CollectorTrigger";

const mockTrigger = vi.mocked(triggerCollection);
const mockStatus = vi.mocked(getSchedulerStatus);
const getToken = vi.fn().mockResolvedValue("test-token");

const NOW = new Date("2026-09-26T07:00:00+09:00");

function mkJob(id: string, last_run: SchedulerJobStatus["last_run"]): SchedulerJobStatus {
  return { scheduler_job_id: id, name: id, schedule: "", enabled: true, last_run, stats_24h: { runs: 0, failures: 0 } };
}

function statusWith(jobs: SchedulerJobStatus[]): SchedulerStatusResponse {
  return { jobs, summary: { total_runs_today: 0, failures_today: 0 } };
}

let client: QueryClient;
function renderIt() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrap = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<CollectorTrigger token="test-token" getToken={getToken} />, { wrapper: wrap });
}

/** 버튼 이름으로 그 버튼 요소를 찾는다 */
function btn(label: string): HTMLButtonElement {
  return screen.getByText(label).closest("button") as HTMLButtonElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  getToken.mockResolvedValue("test-token");
  mockStatus.mockResolvedValue(statusWith([]));
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("CollectorTrigger — 버튼 8종", () => {
  it("버튼 8개가 쉬운 이름으로 보인다 (BE JOB_WORDS 와 같은 표현)", async () => {
    renderIt();
    for (const label of [
      "동네 범죄 통계 받기",
      "동네 공기질 받기",
      "응급실 위치 받기",
      "어린이집 정보 받기",
      "옛 시세 채워 넣기",
      "단지 가치 점수 계산",
      "관리비 단지 연결하기",
      "단지 관리비 받기",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(document.querySelectorAll("button[data-collector]")).toHaveLength(8);
    expect(screen.getByText("외부 자료 지금 받아오기")).toBeInTheDocument();
  });
});

describe("CollectorTrigger — 마지막 실행·결과 한 줄", () => {
  it("실패면 빨간 점 + 우리말 사유, 완료면 처리 건수, 기록이 없으면 '기록 없음'", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    mockStatus.mockResolvedValue(
      statusWith([
        mkJob("kapt_costs", {
          status: "failed",
          started_at: "2026-09-26T06:20:00+09:00",
          completed_at: "2026-09-26T06:34:00+09:00",
          total_items: 0,
          processed_items: 0,
          error_message: "API error resultCode=04",
          error_plain: "포털 오류 04",
        }),
        mkJob("collect_metrics", {
          status: "completed",
          started_at: "2026-09-26T04:30:00+09:00",
          completed_at: "2026-09-26T04:31:00+09:00",
          total_items: 1200,
          processed_items: 1200,
        }),
      ]),
    );
    renderIt();
    const fail = await screen.findByText("마지막 실행: 26분 전 실패 — 포털 오류 04");
    // 원문은 마우스를 올리면
    expect(fail.parentElement).toHaveAttribute("title", "API error resultCode=04");
    expect(btn("단지 관리비 받기").querySelector(".bg-red-500")).not.toBeNull();
    // 가치 점수는 수동 실행이 기록에 안 잡혀 "자동 실행" 이라고 밝힌다
    expect(screen.getByText("마지막 자동 실행: 2시간 전 · 완료 (1,200/1,200건)")).toBeInTheDocument();
    expect(btn("단지 가치 점수 계산").querySelector(".bg-red-500")).toBeNull();
    expect(screen.getByText("마지막 자동 실행: 기록 없음", { selector: "span" })).toBeInTheDocument();
    expect(screen.getAllByText("마지막 실행: 기록 없음")).toHaveLength(5);
  });

  it("지금 도는 중이면 버튼이 잠기고 '이미 도는 중' — 눌러도 API 를 부르지 않는다", async () => {
    mockStatus.mockResolvedValue(
      statusWith([
        mkJob("kapt_costs", {
          status: "running",
          started_at: new Date(Date.now() - 5 * 60_000).toISOString(),
          total_items: 750,
          processed_items: 10,
        }),
      ]),
    );
    renderIt();
    await screen.findByText("지금 도는 중 (5분 전 시작)");
    expect(screen.getByText("이미 도는 중이라 지금은 누를 수 없어요")).toBeInTheDocument();
    const b = btn("단지 관리비 받기");
    expect(b).toBeDisabled();
    fireEvent.click(b);
    expect(window.confirm).not.toHaveBeenCalled();
    expect(mockTrigger).not.toHaveBeenCalled();
    // 다른 버튼은 그대로 누를 수 있다
    expect(btn("동네 범죄 통계 받기")).not.toBeDisabled();
  });
});

describe("CollectorTrigger — 누르기 전 확인창", () => {
  it("오래 걸리는 수집기는 시간·호출 수를 묻고, 취소하면 API 를 부르지 않는다", async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    renderIt();
    fireEvent.click(btn("단지 관리비 받기"));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("약 55~65분"));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("약 1만 2천 회"));
    await act(async () => {});
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it("짧은 수집기는 묻지 않고 바로 부른다", async () => {
    mockTrigger.mockResolvedValueOnce({ status: "started", collector: "crime-stats" });
    renderIt();
    fireEvent.click(btn("동네 범죄 통계 받기"));
    expect(window.confirm).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(mockTrigger).toHaveBeenCalledWith("test-token", "crime-stats");
    });
    await screen.findByText(STARTED_TEXT);
  });
});

describe("CollectorTrigger — 누른 뒤 (세션 420 백그라운드화)", () => {
  it("시작 답이 오면 '시작했어요' + '지금 돌아가는 작업'·현황 새로고침", async () => {
    mockTrigger.mockResolvedValueOnce({ status: "started", collector: "kapt-costs" });
    renderIt();
    const spy = vi.spyOn(client, "invalidateQueries");
    fireEvent.click(btn("단지 관리비 받기"));
    const line = await screen.findByText("시작했어요 — 진행 상황은 '지금 돌아가는 작업'에서 볼 수 있어요");
    expect(line).toHaveClass("text-green-700");
    // 접두 키 — 수집 작업 목록과 '지금 돌아가는 작업'(["admin","crawlJobs","running"])을 함께 새로 받는다
    expect(spy).toHaveBeenCalledWith({ queryKey: ["admin", "crawlJobs"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["admin", "schedulerStatus"] });
    // 옛 "완료" 문구는 더 없다 — 결과는 수집 작업 목록이 보여 준다
    expect(screen.queryByText(/^수집 완료/)).toBeNull();
  });

  it("이미 도는 중(409)이면 서버의 우리말 문구를 그대로, 빨간 글씨로", async () => {
    mockTrigger.mockRejectedValueOnce(new ApiError("이미 돌고 있어요 — 끝난 뒤 다시 눌러 주세요", 409));
    renderIt();
    const spy = vi.spyOn(client, "invalidateQueries");
    fireEvent.click(btn("단지 관리비 받기"));
    const line = await screen.findByText("이미 돌고 있어요 — 끝난 뒤 다시 눌러 주세요");
    expect(line).toHaveClass("text-red-600");
    // 도는 회차가 버튼 잠금에 반영되게 현황도 새로 받는다
    expect(spy).toHaveBeenCalledWith({ queryKey: ["admin", "schedulerStatus"] });
  });

  it("연결 실패 원문은 쉬운 한 줄로", async () => {
    mockTrigger.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    renderIt();
    fireEvent.click(btn("동네 공기질 받기"));
    await screen.findByText("서버에 연결하지 못했어요 — 잠시 뒤 다시 눌러 주세요");
    expect(screen.queryByText("Failed to fetch")).toBeNull();
  });
});
