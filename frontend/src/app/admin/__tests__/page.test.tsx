/**
 * 관리자 대시보드 회귀 가드 — "최근 활동" 카드(PR-R1) + 4층 배치(세션 419)
 * 실행: npx vitest run src/app/admin/__tests__/page.test.tsx
 *
 * 감사 로그 탭(AuditLogTable)이 이미 쓰는 admin-labels 유틸을 대시보드 카드도 써서
 * 탭 간 표기를 통일한다 — 코드 원문(admin_user_update, user:abc) 노출 금지.
 * 자식 카드들은 같은 @/lib/api 목으로 덮여 각자의 로딩·빈 상태로 렌더된다.
 * ⚠ 목 이름은 카드가 실제로 부르는 함수 이름과 같아야 한다 — 옛 목에는 존재하지 않는
 *   `getAdminSchedulerStatus` 가 있고 실제 이름(getSchedulerStatus 등)이 빠져 있었다(세션 419 정정).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";
import AdminDashboard from "../page";
import type { AuditLog, DetailedStats, PaginatedResponse } from "@/types/admin";

vi.mock("@/lib/api", () => ({
  getAdminDetailedStats: vi.fn(),
  getAdminAuditLogs: vi.fn(),
  getDataFreshness: vi.fn(),
  getAdminNaverCalls: vi.fn(),
  getAdminQuotaStatus: vi.fn(),
  getAdminCrawlFailures: vi.fn(),
  getAdminCrawlJobs: vi.fn(),
  getRecrawlStatus: vi.fn(),
  getRecrawlProgress: vi.fn(),
  runRecrawlArticles: vi.fn(),
  triggerCollection: vi.fn(),
  getSchedulerStatus: vi.fn(),
  getAdminTraffic: vi.fn(),
  getAdminVerifications: vi.fn(),
  getAdminUsers: vi.fn(),
}));

const pushMock = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

vi.mock("@/hooks/useAdminQuery", () => ({
  useTokenReady: () => ({ token: "test-token", getToken: vi.fn(async () => "test-token") }),
}));

import {
  getAdminDetailedStats,
  getAdminAuditLogs,
  getSchedulerStatus,
  getAdminTraffic,
  getAdminNaverCalls,
  getAdminCrawlFailures,
  getAdminCrawlJobs,
} from "@/lib/api";

const mockStats = vi.mocked(getAdminDetailedStats);
const mockLogs = vi.mocked(getAdminAuditLogs);
const mockScheduler = vi.mocked(getSchedulerStatus);
const mockTraffic = vi.mocked(getAdminTraffic);
const mockNaver = vi.mocked(getAdminNaverCalls);
const mockFailures = vi.mocked(getAdminCrawlFailures);
const mockJobs = vi.mocked(getAdminCrawlJobs);

const emptyStats: DetailedStats = {
  complex_count: 0,
  article_count: 0,
  active_article_count: 0,
  user_count: 0,
  today_crawl_count: 0,
  recent_crawl_jobs: [],
  error_count_24h: 0,
};

const mkLog = (overrides: Partial<AuditLog> = {}): AuditLog => ({
  id: 1,
  action: "admin_user_update",
  target_type: "user",
  target_id: "abc123",
  created_at: "2026-05-11T10:00:00+09:00",
  ...overrides,
});

function mkLogPage(items: AuditLog[]): PaginatedResponse<AuditLog> {
  return { items, total: items.length, page: 1, page_size: 20 };
}

function renderDashboard() {
  return render(
    <TestQueryProvider>
      <AdminDashboard />
    </TestQueryProvider>,
  );
}

describe("AdminDashboard 최근 활동", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStats.mockResolvedValue(emptyStats);
  });

  /** 정상: action·target 이 한글 라벨로 (감사 로그 탭과 동일 표기) */
  it("action·target 을 한글 라벨로 표시한다", async () => {
    mockLogs.mockResolvedValue(mkLogPage([mkLog()]));
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText("사용자 정보 수정")).toBeInTheDocument();
    });
    expect(screen.getByText(/사용자: abc123/)).toBeInTheDocument();
    // 코드 원문은 화면에 남으면 안 된다
    expect(screen.queryByText("admin_user_update")).not.toBeInTheDocument();
    expect(screen.queryByText(/user:abc123/)).not.toBeInTheDocument();
  });

  /** 사용자 대상의 36자 UUID 는 앞 8자 + "…" 로 줄이고, 전체는 title 로 남긴다 */
  it("사용자 대상 UUID 는 앞 8자만 보이고 전체는 title 로", async () => {
    const uuid = "1234abcd-5678-90ef-1234-567890abcdef";
    mockLogs.mockResolvedValue(mkLogPage([mkLog({ target_id: uuid })]));
    renderDashboard();

    const target = await screen.findByText("사용자: 1234abcd…");
    expect(target).toHaveAttribute("title", uuid);
    expect(screen.queryByText(new RegExp(uuid))).not.toBeInTheDocument();
  });

  /** 수집기 대상은 원문 이름(kapt-costs) 대신 우리말 */
  it("수집기 대상은 우리말 이름으로", async () => {
    mockLogs.mockResolvedValue(
      mkLogPage([mkLog({ action: "admin_collect_trigger", target_type: "collector", target_id: "kapt-costs" })]),
    );
    renderDashboard();

    expect(await screen.findByText(/수집기: 단지 관리비 받기/)).toBeInTheDocument();
    expect(screen.queryByText(/kapt-costs/)).not.toBeInTheDocument();
  });

  /** 경계: 미매핑 action 코드는 라벨이 없으니 코드 그대로 (안전 폴백) */
  it("미매핑 action 코드는 코드 원문 그대로 표시한다", async () => {
    mockLogs.mockResolvedValue(
      mkLogPage([mkLog({ action: "brand_new_action", target_type: undefined, target_id: undefined })]),
    );
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText("brand_new_action")).toBeInTheDocument();
    });
  });

  /** 빈 데이터: 로그 0건이면 안내 문구 */
  it("활동 기록이 없으면 안내 문구를 보여준다", async () => {
    mockLogs.mockResolvedValue(mkLogPage([]));
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText("활동 기록이 없습니다")).toBeInTheDocument();
    });
  });
});

describe("AdminDashboard 4층 배치 (세션 419)", () => {
  const SECTION_TITLES = [
    "자동 작업 현황",
    "데이터 신선도",
    "실패 자세히 (최근 24시간)",
    "네이버 호출 횟수",
    "방문·요청 통계",
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, "", window.location.pathname);
    // 24시간 오류 3건 — compact 라 대시보드엔 보이지 않아야 한다
    mockStats.mockResolvedValue({ ...emptyStats, complex_count: 1234, error_count_24h: 3 });
    mockLogs.mockResolvedValue(mkLogPage([]));
    mockJobs.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 20 });
    mockFailures.mockResolvedValue({
      window_hours: 24,
      total: 2,
      items: [{ job_type: "complex_articles", count: 2, last_error: null, last_failed_at: null }],
    });
  });

  /** 사장님 결정 2026-09-26: 외부 자료 버튼은 "필요할 때만 찾아가는 도구" 라 /admin/crawl 로 옮겼다 */
  it("4층은 '오래된 단지 한 번에 다시 수집' 한 장뿐 — 외부 자료 버튼 카드는 대시보드에 없다", async () => {
    renderDashboard();
    expect(await screen.findByText("오래된 단지 한 번에 다시 수집")).toBeInTheDocument();
    expect(screen.queryByText("외부 자료 지금 받아오기")).toBeNull();
    expect(screen.queryByText("외부 데이터 지금 받아오기")).toBeNull();
    expect(document.querySelectorAll("button[data-collector]")).toHaveLength(0);
  });

  it("1층 '지금 상태' 카드 + 지금 돌아가는 작업 한 줄, 좌측 목차·우측 라이브 패널은 없다", async () => {
    renderDashboard();
    expect(screen.getByRole("heading", { name: "지금 상태" })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("지금 돌아가는 작업 없음")).toBeInTheDocument();
    });
    expect(mockJobs).toHaveBeenCalledWith("test-token", { status: "running" });
    // 옛 좌측 목차·우측 라이브 패널 (파일째 삭제)
    expect(screen.queryByLabelText("실시간 운영 신호")).toBeNull();
    expect(screen.queryByText("최근 실패 5건 (24h)")).toBeNull();
  });

  it("2층 숫자는 4칸만 — 24시간 오류·채워진 비율은 대시보드에 없다", async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText("1,234")).toBeInTheDocument();
    });
    expect(screen.getByText("오늘 수집")).toBeInTheDocument();
    expect(screen.queryByText(/최근 24시간 오류/)).toBeNull();
    expect(screen.queryByText("채워진 비율")).toBeNull();
  });

  it("3층 절 5개는 기본 접힘 — 안쪽 카드의 API 를 부르지 않는다", async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText("지금 돌아가는 작업 없음")).toBeInTheDocument();
    });
    for (const t of SECTION_TITLES) {
      expect(screen.getByText(t)).toBeInTheDocument();
    }
    expect(screen.getAllByText(/펼치기/)).toHaveLength(SECTION_TITLES.length);
    expect(mockScheduler).not.toHaveBeenCalled();
    expect(mockTraffic).not.toHaveBeenCalled();
    expect(mockNaver).not.toHaveBeenCalled();
    // 24시간 실패는 절 안에서만 부른다 (이번 주 카드는 168시간을 부른다)
    expect(mockFailures).not.toHaveBeenCalledWith("test-token", 24);
  });

  it("24시간 실패가 있으면 접힌 실패 절 제목 옆에 'N건' 칩, 0 이면 칩이 없다", async () => {
    const { unmount } = renderDashboard();
    const chip = await screen.findByText("3건");
    // 실패 절의 summary 안 — 절을 열지 않아도 보인다
    expect(chip.closest("summary")).toHaveTextContent("실패 자세히 (최근 24시간)");
    expect(document.getElementById("failure")).not.toHaveAttribute("open");
    unmount();

    mockStats.mockResolvedValue({ ...emptyStats, complex_count: 1234, error_count_24h: 0 });
    renderDashboard();
    await waitFor(() => expect(screen.getByText("1,234")).toBeInTheDocument());
    expect(screen.queryByText("0건")).toBeNull();
    expect(screen.queryByText("3건")).toBeNull();
  });

  /** 절을 펼쳐도 제목은 절(summary) 것 한 줄뿐 — 안쪽 카드가 같은 제목(h3)을 또 그리지 않는다
   *  (라이브 실측: "자동 작업 현황 / 자동 작업 현황" 두 줄 중복 → AdminCard hideTitle) */
  it("3층 절을 펼치면 안쪽 카드는 제목(h3)을 그리지 않는다 — 제목 한 줄", async () => {
    renderDashboard();
    for (const t of SECTION_TITLES) fireEvent.click(screen.getByText(t));
    await screen.findByRole("button", { name: /단지 매물 가져오기 2건 실패/ });
    for (const id of ["scheduler", "freshness", "failure", "naver-calls", "traffic"]) {
      const section = document.getElementById(id)!;
      expect(section).toHaveAttribute("open");
      expect(within(section).queryAllByRole("heading", { level: 3 })).toHaveLength(0);
    }
    // 절 제목 글자는 절마다 정확히 한 번
    for (const t of SECTION_TITLES) {
      expect(screen.getAllByText(t, { exact: true })).toHaveLength(1);
    }
    // 도움말(ⓘ)은 제목을 숨겨도 남는다 — 5절 모두 설명 버튼이 있다
    expect(screen.getAllByRole("button", { name: "설명 보기" }).length).toBeGreaterThanOrEqual(5);
  });

  it("실패 절을 열고 유형을 누르면 /admin/crawl 로 '실패 + 그 유형' 필터를 들고 간다", async () => {
    renderDashboard();
    fireEvent.click(screen.getByText("실패 자세히 (최근 24시간)"));
    const row = await screen.findByRole("button", { name: /단지 매물 가져오기 2건 실패/ });
    expect(mockFailures).toHaveBeenCalledWith("test-token", 24);
    fireEvent.click(row);
    expect(pushMock).toHaveBeenCalledWith("/admin/crawl?status=failed&job_type=complex_articles");
  });
});
