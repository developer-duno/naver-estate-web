/**
 * RunningJobsLine 테스트 — 대시보드 1층 "지금 돌아가는 작업" 한 줄 (세션 419)
 * 실행: npx vitest run src/components/admin/__tests__/RunningJobsLine.test.tsx
 *
 * 앱 설정은 창을 다시 눌러도 새로 받지 않으므로(refetchOnWindowFocus=false) 15초 자동 갱신이
 * 끝난 작업을 화면에서 내리는 길은 그것뿐이다 — 그 갱신을 시간으로 직접 확인한다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";
import RunningJobsLine from "../RunningJobsLine";
import type { CrawlJobDetail, PaginatedResponse } from "@/types/admin";

vi.mock("@/lib/api", () => ({
  getAdminCrawlJobs: vi.fn(),
}));

import { getAdminCrawlJobs } from "@/lib/api";
const mockGet = vi.mocked(getAdminCrawlJobs);

const mkJob = (overrides: Partial<CrawlJobDetail> = {}): CrawlJobDetail => ({
  id: 1,
  job_type: "article_detail",
  status: "running",
  total_items: 500,
  processed_items: 120,
  started_at: "2026-09-25T13:05:00+09:00",
  created_at: "2026-09-25T13:05:00+09:00",
  ...overrides,
});

const page = (items: CrawlJobDetail[]): PaginatedResponse<CrawlJobDetail> => ({
  items,
  total: items.length,
  page: 1,
  page_size: 20,
});

function renderLine(token = "test-token") {
  return render(
    <TestQueryProvider>
      <RunningJobsLine token={token} />
    </TestQueryProvider>,
  );
}

describe("RunningJobsLine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("0건이면 '지금 돌아가는 작업 없음'", async () => {
    mockGet.mockResolvedValue(page([]));
    renderLine();
    await waitFor(() => {
      expect(screen.getByText("지금 돌아가는 작업 없음")).toBeInTheDocument();
    });
    // status=running 만 물어본다
    expect(mockGet).toHaveBeenCalledWith("test-token", { status: "running" });
  });

  it("있으면 건수 + 우리말 작업 이름(원문은 title) + 'M건 중 N건 처리' + 시작 시각", async () => {
    mockGet.mockResolvedValue(page([mkJob(), mkJob({ id: 2, job_type: "unknown_job", total_items: 0, processed_items: 3, started_at: undefined })]));
    renderLine();
    await waitFor(() => {
      expect(screen.getByText("지금 돌아가는 작업 2건")).toBeInTheDocument();
    });
    const name = screen.getByTitle("article_detail");
    expect(name.textContent).not.toContain("article_detail");
    expect(screen.getByText("500건 중 120건 처리")).toBeInTheDocument();
    expect(screen.getByText("13:05 시작")).toBeInTheDocument();
    // 전체 건수가 0인 작업은 처리 건수만
    expect(screen.getByText("3건 처리")).toBeInTheDocument();
  });

  it("토큰이 없으면 부르지 않는다", () => {
    mockGet.mockResolvedValue(page([]));
    renderLine("");
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("오류면 삼키지 않고 오류 문구를 보인다", async () => {
    mockGet.mockRejectedValue(new Error("network down"));
    renderLine();
    await waitFor(() => {
      expect(screen.getByText(/지금 돌아가는 작업을 불러오지 못했어요/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/network down/)).toBeNull();
  });

  it("15초마다 저절로 다시 받아, 끝난 작업이 화면에서 내려간다", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockGet.mockResolvedValueOnce(page([mkJob()])).mockResolvedValue(page([]));
    renderLine();
    await waitFor(() => {
      expect(screen.getByText("지금 돌아가는 작업 1건")).toBeInTheDocument();
    });
    expect(mockGet).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_100);
    });
    await waitFor(() => {
      expect(screen.getByText("지금 돌아가는 작업 없음")).toBeInTheDocument();
    });
    expect(mockGet).toHaveBeenCalledTimes(2);
  });
});
