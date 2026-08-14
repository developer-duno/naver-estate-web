/**
 * SchedulerMonitor 컴포넌트 테스트 — 스케줄러 모니터링 테이블
 * 실행: npx vitest run src/components/__tests__/SchedulerMonitor.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";
import SchedulerMonitor from "../admin/SchedulerMonitor";

/* api 모킹 */
vi.mock("@/lib/api", () => ({
  getSchedulerStatus: vi.fn(),
}));

import { getSchedulerStatus } from "@/lib/api";
const mockGetStatus = vi.mocked(getSchedulerStatus);

/** 테스트용 mock 응답 데이터 */
const MOCK_RESPONSE = {
  jobs: [
    {
      scheduler_job_id: "collect_air_quality",
      name: "에어코리아 대기질",
      schedule: "매일 02:00",
      enabled: true,
      last_run: {
        status: "completed",
        started_at: new Date(Date.now() - 3600_000).toISOString(),
        completed_at: new Date().toISOString(),
        duration_seconds: 45,
        total_items: 100,
        processed_items: 98,
        error_message: undefined,
      },
      next_run_at: new Date(Date.now() + 86400_000).toISOString(),
      stats_24h: { runs: 1, failures: 0 },
    },
    {
      scheduler_job_id: "collect_crime_stats",
      name: "범죄통계",
      schedule: "분기별 첫째 일요일 04:00",
      enabled: true,
      last_run: {
        status: "failed",
        started_at: new Date(Date.now() - 7200_000).toISOString(),
        completed_at: new Date(Date.now() - 7100_000).toISOString(),
        duration_seconds: 100,
        total_items: 0,
        processed_items: 0,
        error_message: "API 연결 실패: timeout",
      },
      next_run_at: undefined,
      stats_24h: { runs: 1, failures: 1 },
    },
    {
      scheduler_job_id: "collect_childcare",
      name: "어린이집",
      schedule: "매월 첫째 목요일 06:00",
      enabled: false,
      last_run: null,
      next_run_at: undefined,
      stats_24h: { runs: 0, failures: 0 },
    },
  ],
  summary: { total_runs_today: 3, failures_today: 1 },
};

function renderWithProvider() {
  return render(
    <TestQueryProvider>
      <SchedulerMonitor token="test-token" />
    </TestQueryProvider>,
  );
}

describe("SchedulerMonitor 컴포넌트", () => {
  /** 정상 렌더링 — 제목과 요약 표시 */
  it("스케줄러 모니터링 제목과 요약이 표시된다", async () => {
    mockGetStatus.mockResolvedValueOnce(MOCK_RESPONSE);
    const { container } = renderWithProvider();
    // "스케줄러 모니터링" 타이틀은 isLoading 분기에서도 AdminCard 헤더로 즉시 렌더되므로,
    // jobs 목록이 실제 로드 완료되었는지는 job name 으로 확인한다
    await waitFor(() => {
      expect(screen.getByText("에어코리아 대기질")).toBeInTheDocument();
    });
    expect(screen.getByText("스케줄러 모니터링")).toBeInTheDocument();
    // summary 는 <span> 안에 내부 <span> 이 중첩되어 있어 getByText 가 다중 요소로 판단함 → textContent 포함 검증
    expect(container.textContent).toContain("오늘 3회 실행");
    expect(container.textContent).toContain("1건 실패");
  });

  /** 작업명이 모두 렌더되는지 */
  it("작업명이 모두 표시된다", async () => {
    mockGetStatus.mockResolvedValueOnce(MOCK_RESPONSE);
    renderWithProvider();
    await waitFor(() => {
      expect(screen.getByText("에어코리아 대기질")).toBeInTheDocument();
    });
    expect(screen.getByText("범죄통계")).toBeInTheDocument();
    expect(screen.getByText("어린이집")).toBeInTheDocument();
  });

  /** 비활성화된 작업에 OFF 뱃지 표시 */
  it("비활성 작업에 OFF 뱃지가 표시된다", async () => {
    mockGetStatus.mockResolvedValueOnce(MOCK_RESPONSE);
    renderWithProvider();
    await waitFor(() => {
      expect(screen.getByText("OFF")).toBeInTheDocument();
    });
  });

  /** 상태 뱃지는 영문 원문(completed/failed)이 아니라 JOB_STATUS_STYLES 한글 라벨로 표시 */
  it("상태 뱃지가 한글 라벨(완료/실패)로 표시된다", async () => {
    mockGetStatus.mockResolvedValueOnce(MOCK_RESPONSE);
    renderWithProvider();
    await waitFor(() => {
      expect(screen.getByText("완료")).toBeInTheDocument();
    });
    expect(screen.getByText("실패")).toBeInTheDocument();
    // 영문 원문이 화면에 남아 있으면 안 된다 (한글화 회귀 가드)
    expect(screen.queryByText("completed")).not.toBeInTheDocument();
    expect(screen.queryByText("failed")).not.toBeInTheDocument();
  });

  /** 실행 이력 없는 작업은 - 표시 */
  it("실행 이력 없는 작업은 상태에 -가 표시된다", async () => {
    mockGetStatus.mockResolvedValueOnce(MOCK_RESPONSE);
    renderWithProvider();
    await waitFor(() => {
      // 어린이집은 last_run이 null
      const dashes = screen.getAllByText("-");
      expect(dashes.length).toBeGreaterThan(0);
    });
  });

  /** 실패 행 클릭 시 에러 메시지 펼침 */
  it("실패한 작업 행 클릭 시 에러 메시지가 펼쳐진다", async () => {
    mockGetStatus.mockResolvedValueOnce(MOCK_RESPONSE);
    renderWithProvider();
    await waitFor(() => {
      expect(screen.getByText("범죄통계")).toBeInTheDocument();
    });

    // 에러 메시지가 처음에는 안 보임
    expect(screen.queryByText("API 연결 실패: timeout")).not.toBeInTheDocument();

    // 실패 행 클릭
    const failedRow = screen.getByText("범죄통계").closest("tr");
    expect(failedRow).not.toBeNull();
    fireEvent.click(failedRow!);

    // 에러 메시지 표시
    await waitFor(() => {
      expect(screen.getByText("API 연결 실패: timeout")).toBeInTheDocument();
    });
  });

  /** API 에러 시 에러 메시지 표시 */
  it("API 에러 시 에러 UI가 표시된다", async () => {
    mockGetStatus.mockRejectedValueOnce(new Error("네트워크 에러"));
    renderWithProvider();
    await waitFor(() => {
      expect(screen.getByText(/스케줄러 상태 조회 실패/)).toBeInTheDocument();
    });
  });

  /** 빈 jobs 배열 시 빈 상태 메시지 */
  it("jobs가 비어있으면 빈 상태 메시지가 표시된다", async () => {
    mockGetStatus.mockResolvedValueOnce({
      jobs: [],
      summary: { total_runs_today: 0, failures_today: 0 },
    });
    renderWithProvider();
    await waitFor(() => {
      expect(screen.getByText("등록된 스케줄러 작업이 없습니다")).toBeInTheDocument();
    });
  });
});
