/**
 * /admin/crawl 페이지 — 목록 필터·취소 확인창 회귀 가드 (관리자 화면 리뉴얼 A4)
 * 실행: npx vitest run src/app/admin/crawl/__tests__/page.test.tsx
 *
 * 검증하는 것:
 *  1. URL 쿼리(?status=failed&job_type=…)를 목록 초기 필터로 읽는다 — 대시보드가 이 주소로 보낸다
 *  2. 유형 조건은 BE 로 넘겨(job_type) 전체 이력에서 거르고 쪽 넘김도 그대로 쓴다.
 *     옛 BE(재시작 전)가 유형을 무시하고 전체를 돌려줘도 화면에서 한 번 더 거른다(안전망)
 *  3. "실패 자세히" 행을 누르면 유형을 버리지 않고 실패+유형 조건을 건다
 *  4. 취소는 확인창에서 "취소"하면 API 를 부르지 않는다
 *  5. 취소·일시정지·재개 뒤 목록이 바로 다시 불린다(무효화 키가 목록 키를 잡는다)
 *  6. 조건(상태·유형·쪽)을 바꾸면 주소 쿼리도 바뀌고(router.replace), 주소가 바뀌면(뒤로가기·붙여넣기)
 *     조건이 따라온다 — "?status=failed&job_type=kapt_costs" 를 공유하면 받은 사람도 같은 화면
 * 자식 카드(요약·실패 분포·단건 수집·추이 차트)는 각자 테스트가 있어 여기선 가짜로 바꾼다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";
import type { CrawlJobDetail, PaginatedResponse } from "@/types/admin";

const mockSearch = { value: new URLSearchParams() };
const replaceMock = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearch.value,
  useRouter: () => ({ push: vi.fn(), replace: replaceMock }),
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

vi.mock("@/components/admin/CrawlSummary", () => ({ default: () => <div>가짜 요약</div> }));
// 외부 자료 버튼 카드 — 자기 테스트(CollectorTrigger.test.tsx)가 있어 여기선 자리·받는 값만 본다
vi.mock("@/components/admin/CollectorTrigger", () => ({
  default: ({ token }: { token: string }) => <div>가짜 외부 자료 카드 {token}</div>,
}));
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

  it("?status=failed&job_type=… 을 초기 필터로 읽어 BE 에 유형까지 넘기고, 옛 BE 가 섞어 줘도 그 유형만 보여 준다", async () => {
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
        job_type: "price_history",
        page: 1,
      }),
    );
    expect(screen.getByLabelText("상태로 거르기")).toHaveValue("failed");
    expect(screen.getByLabelText("유형으로 거르기")).toHaveValue("price_history");
    // 안전망 — 옛 BE 가 섞어 준 다른 유형(단지 매물 가져오기) 행은 걸러진다
    await waitFor(() => expect(screen.getAllByText("단지 시세 기록 모으기").length).toBeGreaterThan(0));
    expect(screen.getByText("11")).toBeInTheDocument();
    expect(screen.getByText("13")).toBeInTheDocument();
    expect(screen.queryByText("12")).not.toBeInTheDocument();
    // "최근 100건 안에서만" 한계 문구는 없어졌다 — 유형 조건이 전체 이력에 걸린다
    expect(screen.queryByText(/가장 최근 작업 100건 안에서만/)).not.toBeInTheDocument();
    expect(screen.getByText(/단지 시세 기록 모으기 총 3건/)).toBeInTheDocument();
  });

  it("유형을 골라도 쪽 넘김이 보이고, 다음 쪽은 유형을 유지한 채 page=2 로 부른다", async () => {
    mockSearch.value = new URLSearchParams("job_type=price_history");
    mockJobs.mockResolvedValue({
      items: [mkJob({ id: 31, job_type: "price_history" })],
      total: 45,
      page: 1,
      page_size: 20,
    });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "다음" }));
    await waitFor(() =>
      expect(mockJobs).toHaveBeenLastCalledWith("test-token", {
        status: undefined,
        job_type: "price_history",
        page: 2,
      }),
    );
    expect(await screen.findByText("2 / 3 쪽")).toBeInTheDocument();
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
        job_type: "price_history",
        page: 1,
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

describe("/admin/crawl 주소 쿼리 동기화", () => {
  beforeEach(() => {
    mockSearch.value = new URLSearchParams();
    mockJobs.mockReset();
    replaceMock.mockReset();
    // 실제 라우터처럼 replace 하면 주소(useSearchParams)가 바뀐다 — 다음 렌더가 새 주소를 읽는다
    replaceMock.mockImplementation((url: string) => {
      mockSearch.value = new URLSearchParams(url.split("?")[1] ?? "");
    });
    mockJobs.mockResolvedValue(response([]));
  });

  it("상태를 고르면 주소가 ?status=… 로 바뀐다 (스크롤은 그대로)", async () => {
    renderPage();
    await waitFor(() => expect(mockJobs).toHaveBeenCalled());
    expect(replaceMock).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("상태로 거르기"), { target: { value: "failed" } });
    expect(replaceMock).toHaveBeenLastCalledWith("/admin/crawl?status=failed", { scroll: false });
    // 다시 전체로 돌리면 쿼리 없는 주소
    fireEvent.change(screen.getByLabelText("상태로 거르기"), { target: { value: "" } });
    expect(replaceMock).toHaveBeenLastCalledWith("/admin/crawl", { scroll: false });
  });

  it("유형을 고르고 다음 쪽으로 가면 주소에 유형과 쪽이 함께 남는다", async () => {
    mockJobs.mockResolvedValue({ items: [mkJob({ id: 31, job_type: "kapt_costs" })], total: 45, page: 1, page_size: 20 });
    renderPage();
    await waitFor(() => expect(mockJobs).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText("유형으로 거르기"), { target: { value: "kapt_costs" } });
    expect(replaceMock).toHaveBeenLastCalledWith("/admin/crawl?job_type=kapt_costs", { scroll: false });
    fireEvent.click(await screen.findByRole("button", { name: "다음" }));
    expect(replaceMock).toHaveBeenLastCalledWith("/admin/crawl?job_type=kapt_costs&page=2", { scroll: false });
  });

  it("실패 분포 행으로 건 조건도 주소에 남는다", async () => {
    renderPage();
    await waitFor(() => expect(mockJobs).toHaveBeenCalled());
    fireEvent.click(screen.getByText("가짜 실패 행"));
    expect(replaceMock).toHaveBeenLastCalledWith(
      "/admin/crawl?status=failed&job_type=price_history",
      { scroll: false },
    );
  });

  it("주소가 바뀌면(뒤로가기·주소 공유) 조건이 따라와 그 조건으로 다시 부른다", async () => {
    const view = renderPage();
    await waitFor(() => expect(mockJobs).toHaveBeenCalled());
    mockSearch.value = new URLSearchParams("status=failed&job_type=kapt_costs&page=3");
    view.rerender(
      <TestQueryProvider>
        <AdminCrawlPage />
      </TestQueryProvider>,
    );
    await waitFor(() =>
      expect(mockJobs).toHaveBeenLastCalledWith("test-token", {
        status: "failed",
        job_type: "kapt_costs",
        page: 3,
      }),
    );
    expect(screen.getByLabelText("상태로 거르기")).toHaveValue("failed");
    expect(screen.getByLabelText("유형으로 거르기")).toHaveValue("kapt_costs");
    // 주소를 따라온 것이므로 주소를 다시 쓰지 않는다(뒤로가기 기록을 덮지 않게)
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("?page= 는 1 이상 정수만 받는다 (이상한 값은 1쪽)", async () => {
    mockSearch.value = new URLSearchParams("page=-2");
    renderPage();
    await waitFor(() => expect(mockJobs).toHaveBeenCalled());
    expect(mockJobs).toHaveBeenLastCalledWith("test-token", { status: undefined, page: 1 });
  });

  it("화면 제목은 쉬운 말 — '자료 수집 관리' / '자료 수집이란?'", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { level: 2, name: "자료 수집 관리" })).toBeInTheDocument();
    expect(screen.getByText("자료 수집이란?")).toBeInTheDocument();
    expect(screen.queryByText(/크롤링/)).not.toBeInTheDocument();
  });

  /** 사장님 결정 2026-09-26: 대시보드에서 옮겨 온 외부 자료 버튼 — 요약 아래, 실패 분포 위 */
  it("외부 자료 버튼 카드가 요약 아래·실패 분포 위에 있고 토큰을 받는다", async () => {
    renderPage();
    const card = await screen.findByText("가짜 외부 자료 카드 test-token");
    const summary = screen.getByText("가짜 요약");
    const failure = screen.getByText("가짜 실패 행");
    expect(summary.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(card.compareDocumentPosition(failure) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

  /** 기존 결함 회귀 가드 — 무효화 키가 ["admin","crawlJobs",undefined] 이면 목록 키
   *  ["admin","crawlJobs",{status,page}] 를 부분 일치로 못 잡아 취소 뒤에도 옛 목록이 남았다 */
  it("취소가 끝나면 목록을 다시 부른다", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "취소" }));
    await waitFor(() => expect(mockCancel).toHaveBeenCalledTimes(1));
    // 처음 1번 + 무효화로 다시 1번
    await waitFor(() => expect(mockJobs).toHaveBeenCalledTimes(2));
  });
});
