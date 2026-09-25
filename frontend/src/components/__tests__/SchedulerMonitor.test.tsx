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
      source: "에어코리아 실시간 대기질",
      source_url: "https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty",
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
      source: "경찰청 범죄통계 (3074462)",
      source_url: null,
    },
    {
      scheduler_job_id: "collect_childcare",
      name: "어린이집",
      schedule: "매월 첫째 목요일 06:00",
      enabled: false,
      last_run: null,
      next_run_at: undefined,
      stats_24h: { runs: 0, failures: 0 },
      // source 없는 잡(내부 DB 전용 등) — null/undefined 여도 렌더가 깨지지 않아야 함
      source: null,
      source_url: null,
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
  it("자동 작업 현황 제목과 요약이 표시된다", async () => {
    mockGetStatus.mockResolvedValueOnce(MOCK_RESPONSE);
    const { container } = renderWithProvider();
    // "스케줄러 모니터링" 타이틀은 isLoading 분기에서도 AdminCard 헤더로 즉시 렌더되므로,
    // jobs 목록이 실제 로드 완료되었는지는 job name 으로 확인한다
    await waitFor(() => {
      expect(screen.getByText("에어코리아 대기질")).toBeInTheDocument();
    });
    expect(screen.getByText("자동 작업 현황")).toBeInTheDocument();
    // 열 이름도 우리말 (세션 419: 스케줄 → 주기)
    expect(screen.getByText("주기")).toBeInTheDocument();
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
      expect(screen.getByText("꺼짐")).toBeInTheDocument();
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
    expect(screen.queryByText("알 수 없는 오류 (원문은 마우스를 올려 보세요)")).not.toBeInTheDocument();

    // 실패 행 클릭
    const failedRow = screen.getByText("범죄통계").closest("tr");
    expect(failedRow).not.toBeNull();
    fireEvent.click(failedRow!);

    // 에러 메시지 표시 (MOCK 은 error_plain 없음 → 고정 문구 + title 원문)
    await waitFor(() => {
      expect(screen.getByText("알 수 없는 오류 (원문은 마우스를 올려 보세요)")).toBeInTheDocument();
    });
    expect(screen.getByText("알 수 없는 오류 (원문은 마우스를 올려 보세요)")).toHaveAttribute("title", "API 연결 실패: timeout");
  });

  /** 펼침 영역은 쉬운 우리말(error_plain)을 보여주고 원문은 title 로 남긴다 (세션 411) */
  it("에러 펼침에 우리말이 보이고 원문은 title 에 남는다", async () => {
    const raw =
      "(psycopg2.errors.QueryCanceled) canceling statement due to statement timeout";
    const plain = "데이터베이스가 너무 오래 걸려 스스로 멈췄어요.";
    mockGetStatus.mockResolvedValueOnce({
      ...MOCK_RESPONSE,
      jobs: [
        {
          ...MOCK_RESPONSE.jobs[1],
          last_run: {
            status: "failed",
            started_at: new Date(Date.now() - 7200_000).toISOString(),
            completed_at: new Date(Date.now() - 7100_000).toISOString(),
            duration_seconds: 100,
            total_items: 0,
            processed_items: 0,
            error_message: raw,
            error_plain: plain,
          },
        },
      ],
    });
    renderWithProvider();
    await waitFor(() => {
      expect(screen.getByText("범죄통계")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("범죄통계").closest("tr")!);

    await waitFor(() => {
      expect(screen.getByText(plain)).toBeInTheDocument();
    });
    // 개발자 에러 원문은 화면 글자로 보이지 않는다
    expect(screen.queryByText(raw)).toBeNull();
    // 다만 추적용 원문은 title 로 남아 있어야 한다
    expect(screen.getByText(plain).getAttribute("title")).toBe(raw);
  });

  /** 옛 백엔드(error_plain 없음)면 원문 대신 고정 문구 — 화면이 비지도, 영어 원문이 드러나지도 않는다 (세션 419) */
  it("error_plain 이 없으면 고정 문구를 보이고 원문은 title 로만 둔다", async () => {
    const raw = "API 연결 실패: timeout";
    mockGetStatus.mockResolvedValueOnce(MOCK_RESPONSE);
    renderWithProvider();
    await waitFor(() => {
      expect(screen.getByText("범죄통계")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("범죄통계").closest("tr")!);

    await waitFor(() => {
      expect(screen.getByText("알 수 없는 오류 (원문은 마우스를 올려 보세요)")).toBeInTheDocument();
    });
    expect(screen.queryByText(raw)).toBeNull();
    expect(screen.getByText("알 수 없는 오류 (원문은 마우스를 올려 보세요)")).toHaveAttribute("title", raw);
  });

  /** error_plain 이 빈 문자열이어도 고정 문구 — `??` 였다면 화면이 비어 버린다 (세션 411·419) */
  it("error_plain 이 빈 문자열이면 고정 문구로 폴백한다", async () => {
    const raw = "API 연결 실패: timeout";
    mockGetStatus.mockResolvedValueOnce({
      ...MOCK_RESPONSE,
      jobs: [
        {
          ...MOCK_RESPONSE.jobs[1],
          last_run: { ...MOCK_RESPONSE.jobs[1].last_run!, error_message: raw, error_plain: "" },
        },
      ],
    });
    renderWithProvider();
    await waitFor(() => {
      expect(screen.getByText("범죄통계")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("범죄통계").closest("tr")!);

    await waitFor(() => {
      expect(screen.getByText("알 수 없는 오류 (원문은 마우스를 올려 보세요)")).toBeInTheDocument();
    });
    expect(screen.queryByText(raw)).toBeNull();
  });

  /** API 에러 시 에러 메시지 표시 */
  it("API 에러 시 에러 UI가 표시된다", async () => {
    mockGetStatus.mockRejectedValueOnce(new Error("네트워크 에러"));
    renderWithProvider();
    await waitFor(() => {
      expect(screen.getByText(/자동 작업 현황을 불러오지 못했어요/)).toBeInTheDocument();
    });
    // 개발자 에러 원문은 사장님 화면에 노출하지 않는다 (세션 410)
    expect(screen.queryByText(/네트워크 에러/)).toBeNull();
  });

  /** 출처(source)가 작업명 아래 보조 텍스트로 표시된다 (세션 402) */
  it("출처가 있으면 작업명 아래 표시된다", async () => {
    mockGetStatus.mockResolvedValueOnce(MOCK_RESPONSE);
    renderWithProvider();
    await waitFor(() => {
      expect(screen.getByText("에어코리아 대기질")).toBeInTheDocument();
    });
    expect(screen.getByText("자료 출처: 에어코리아 실시간 대기질")).toBeInTheDocument();
    expect(screen.getByText("자료 출처: 경찰청 범죄통계 (3074462)")).toBeInTheDocument();
  });

  /** source 가 null 이어도 렌더가 깨지지 않는다 */
  it("출처가 없는 작업은 출처 텍스트 없이 정상 렌더된다", async () => {
    mockGetStatus.mockResolvedValueOnce(MOCK_RESPONSE);
    renderWithProvider();
    await waitFor(() => {
      expect(screen.getByText("어린이집")).toBeInTheDocument();
    });
    // 어린이집 행에는 출처 텍스트가 없어야 함
    const childcareCell = screen.getByText("어린이집").closest("td");
    expect(childcareCell?.textContent).not.toContain("출처:");
  });

  /** 빈 jobs 배열 시 빈 상태 메시지 */
  it("jobs가 비어있으면 빈 상태 메시지가 표시된다", async () => {
    mockGetStatus.mockResolvedValueOnce({
      jobs: [],
      summary: { total_runs_today: 0, failures_today: 0 },
    });
    renderWithProvider();
    await waitFor(() => {
      expect(screen.getByText("등록된 자동 작업이 없습니다")).toBeInTheDocument();
    });
  });
});
