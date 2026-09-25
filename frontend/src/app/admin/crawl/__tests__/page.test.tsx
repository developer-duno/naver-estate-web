/**
 * /admin/crawl 페이지 — 목록 필터·취소 확인창 회귀 가드 (관리자 화면 리뉴얼 A4)
 * 실행: npx vitest run src/app/admin/crawl/__tests__/page.test.tsx
 *
 * 검증하는 것:
 *  1. URL 쿼리(?status=failed&job_type=…)를 목록 초기 필터로 읽는다 — 대시보드가 이 주소로 보낸다
 *  2. 유형 조건이 있으면 BE 가 job_type 을 못 받으므로 최근 100건을 받아 화면에서 거른다
 *  3. "실패 자세히" 행을 누르면 유형을 버리지 않고 실패+유형 조건을 건다
 *  4. 취소는 확인창에서 "취소"하면 API 를 부르지 않는다
 * 자식 카드(요약·실패 분포·단건 수집·추이 차트)는 각자 테스트가 있어 여기선 가짜로 바꾼다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";
import type { CrawlJobDetail, PaginatedResponse } from "@/types/admin";

const mockSearch = { value: new URLSearchParams() };
vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearch.value,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/admin/crawl",
}));

vi.mock("@/lib/api", () => ({
  getAdminCrawlJobs: vi.fn(),
  cancelAdminCrawlJob: vi.fn(),
  pauseAdminCrawlJob: vi.fn(),
  resumeAdminCrawlJob: vi.fn(),
}));

vi.mock("@/hooks/useAdminQuery", () => ({
  useTokenReady: () => ({ token: "test-token", getToken: vi.fn(async () => "test-token") }),
}));

vi.mock("@/components/admin/CrawlSummary", () => ({ default: () => null }));
vi.mock("@/components/admin/SingleRecrawlCard", () => ({ default: () => null }));
vi.mock("@/components/admin/ErrorRateChart", () => ({ default: () => null }));
// 실패 분포 카드: 행을 누르면 유형 코드를 넘기는 계약만 흉내 낸다 (FailureBreakdown.tsx onJumpToFailed(it.job_type))
vi.mock("@/components/admin/FailureBreakdown", () => ({
  default: ({ onJumpToFailed }: { onJumpToFailed?: (jobType?: string) => void }) => (
    <button type="button" onClick={() => onJumpToFailed?.("price_history")}>
      가짜 실패 행
    </button>
  ),
}));

import { getAdminCrawlJobs, cancelAdminCrawlJob } from "@/lib/api";
import AdminCrawlPage from "../page";

const mockJobs = vi.mocked(getAdminCrawlJobs);
const mockCancel = vi.mocked(cancelAdminCrawlJob);

function mkJob(overrides: Partial<CrawlJobDetail>): CrawlJobDetail {
  return {
    id: 1,
    job_type: "complex_articles",
    target_id: "12345",
    status: "failed",
    total_items: 5,
    processed_items: 1,
    error_message: undefined,
    started_at: "2026-09-25T01:00:00Z",
    completed_at: "2026-09-25T01:05:00Z",
    created_at: "2026-09-25T01:00:00Z",
    ...overrides,
  };
}

function response(items: CrawlJobDetail[]): PaginatedResponse<CrawlJobDetail> {
  return { items, total: items.length, page: 1, page_size: 20 } as PaginatedResponse<CrawlJobDetail>;
}

function renderPage() {
  return render(
    <TestQueryProvider>
      <AdminCrawlPage />
    </TestQueryProvider>,
  );
}

describe("/admin/crawl 목록 필터", () => {
  beforeEach(() => {
    mockSearch.value = new URLSearchParams();
    mockJobs.mockReset();
    mockCancel.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("쿼리가 없으면 상태·유형 전체로 20건씩(쪽 번호) 부른다", async () => {
    mockJobs.mockResolvedValue(response([mkJob({ id: 1 })]));
    renderPage();
    await waitFor(() => expect(mockJobs).toHaveBeenCalled());
    expect(mockJobs).toHaveBeenLastCalledWith("test-token", { status: undefined, page: 1 });
    expect(screen.getByLabelText("상태로 거르기")).toHaveValue("");
    expect(screen.getByLabelText("유형으로 거르기")).toHaveValue("");
  });

  it("?status=failed&job_type=… 을 초기 필터로 읽고, 최근 100건에서 그 유형만 보여 준다", async () => {
    mockSearch.value = new URLSearchParams("status=failed&job_type=price_history");
    mockJobs.mockResolvedValue(
      response([
        mkJob({ id: 11, job_type: "price_history" }),
        mkJob({ id: 12, job_type: "complex_articles" }),
        mkJob({ id: 13, job_type: "price_history" }),
      ]),
    );
    renderPage();
    await waitFor(() =>
      expect(mockJobs).toHaveBeenLastCalledWith("test-token", {
        status: "failed",
        page: 1,
        page_size: 100,
      }),
    );
    expect(screen.getByLabelText("상태로 거르기")).toHaveValue("failed");
    expect(screen.getByLabelText("유형으로 거르기")).toHaveValue("price_history");
    // 다른 유형(단지 매물 가져오기) 행은 걸러진다
    await waitFor(() => expect(screen.getAllByText("단지 시세 기록 모으기").length).toBeGreaterThan(0));
    expect(screen.getByText("11")).toBeInTheDocument();
    expect(screen.getByText("13")).toBeInTheDocument();
    expect(screen.queryByText("12")).not.toBeInTheDocument();
    // 한계를 숨기지 않는다
    expect(screen.getByText(/가장 최근 작업 100건 안에서만/)).toBeInTheDocument();
    expect(screen.getByText(/단지 시세 기록 모으기 2건 · 최근 3건 중/)).toBeInTheDocument();
  });

  it("모르는 상태값 쿼리는 버리고 전체로 시작한다", async () => {
    mockSearch.value = new URLSearchParams("status=hacked");
    mockJobs.mockResolvedValue(response([]));
    renderPage();
    await waitFor(() => expect(mockJobs).toHaveBeenCalled());
    expect(mockJobs).toHaveBeenLastCalledWith("test-token", { status: undefined, page: 1 });
  });

  it("실패 분포 행을 누르면 유형을 버리지 않고 실패+유형 조건을 건다", async () => {
    mockJobs.mockResolvedValue(response([]));
    renderPage();
    await waitFor(() => expect(mockJobs).toHaveBeenCalled());
    fireEvent.click(screen.getByText("가짜 실패 행"));
    await waitFor(() =>
      expect(mockJobs).toHaveBeenLastCalledWith("test-token", {
        status: "failed",
        page: 1,
        page_size: 100,
      }),
    );
    expect(screen.getByLabelText("유형으로 거르기")).toHaveValue("price_history");
  });

  it("필터는 따로 떨어진 '필터' 카드가 아니라 목록 카드 머리에 있다", async () => {
    mockJobs.mockResolvedValue(response([]));
    renderPage();
    await waitFor(() => expect(mockJobs).toHaveBeenCalled());
    expect(screen.queryByRole("heading", { name: "필터" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /수집 작업 목록/ })).toBeInTheDocument();
  });
});

describe("/admin/crawl 취소 확인창", () => {
  beforeEach(() => {
    mockSearch.value = new URLSearchParams();
    mockJobs.mockReset();
    mockCancel.mockReset();
    mockJobs.mockResolvedValue(response([mkJob({ id: 21, status: "running" })]));
    mockCancel.mockResolvedValue({ status: "cancelled" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("확인창에서 취소를 누르면 API 를 부르지 않는다", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "취소" }));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    // 되돌릴 수 없다는 것과 실제로 일어나는 일(기록만 바뀜)을 알린다
    expect(confirmSpy.mock.calls[0][0]).toMatch(/되돌릴 수 없어요/);
    expect(confirmSpy.mock.calls[0][0]).toMatch(/멈추지 않아요/);
    // 저장·취소 함수는 토큰을 await 한 뒤 API 를 부른다 — 비동기 흐름이 다 돈 뒤에 "안 불렸다"를 단언해야
    // 확인창 가드를 지웠을 때 이 단언이 실제로 깨진다 (뮤테이션 실측: flush 없이 단언하면 가드가 없어도 통과)
    await new Promise((r) => setTimeout(r, 50));
    expect(mockCancel).not.toHaveBeenCalled();
  });

  it("확인하면 그 작업 번호로 취소 API 를 부른다", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "취소" }));
    await waitFor(() => expect(mockCancel).toHaveBeenCalledWith("test-token", 21));
  });
});
