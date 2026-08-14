/**
 * AdminLivePanel 회귀 가드 — 우 패널 3 위젯 (실행중·최근 실패·네이버 호출)
 * 실행: npx vitest run src/components/admin/__tests__/AdminLivePanel.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";
import AdminLivePanel from "../AdminLivePanel";
import type { CrawlJobDetail } from "@/types/admin";
import type { CrawlFailureItem, NaverCallStats } from "@/lib/api/admin";

vi.mock("@/lib/api", () => ({
  getAdminCrawlJobs: vi.fn(),
  getAdminCrawlFailures: vi.fn(),
  getAdminNaverCalls: vi.fn(),
}));

vi.mock("@/hooks/useAdminQuery", () => ({
  useTokenReady: () => ({ token: "test-token", getToken: vi.fn() }),
}));

import {
  getAdminCrawlJobs,
  getAdminCrawlFailures,
  getAdminNaverCalls,
} from "@/lib/api";

const mockJobs = vi.mocked(getAdminCrawlJobs);
const mockFailures = vi.mocked(getAdminCrawlFailures);
const mockNaver = vi.mocked(getAdminNaverCalls);

const mkJob = (overrides: Partial<CrawlJobDetail>): CrawlJobDetail => ({
  id: 1,
  job_type: "crawl_articles",
  status: "running",
  total_items: 100,
  processed_items: 50,
  started_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  ...overrides,
});

const mkFailure = (overrides: Partial<CrawlFailureItem>): CrawlFailureItem => ({
  job_type: "crawl_details",
  count: 1,
  last_error: null,
  last_failed_at: null,
  ...overrides,
});

const mkNaver = (totals: Partial<NaverCallStats["totals"]>): NaverCallStats => ({
  labels: {},
  totals: { "10m": 0, "1h": 0, "24h": 0, ...totals },
  process_uptime_seconds: 3600,
});

function renderPanel() {
  return render(
    <TestQueryProvider>
      <AdminLivePanel />
    </TestQueryProvider>,
  );
}

describe("AdminLivePanel", () => {
  beforeEach(() => {
    mockJobs.mockReset();
    mockFailures.mockReset();
    mockNaver.mockReset();
  });

  it("3 위젯 (실행중·최근 실패·네이버) 모두 렌더링", async () => {
    mockJobs.mockResolvedValueOnce({ items: [], total: 0, page: 1, page_size: 20 });
    mockFailures.mockResolvedValueOnce({ window_hours: 24, total: 0, items: [] });
    mockNaver.mockResolvedValueOnce(mkNaver({ "24h": 0 }));
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("지금 돌아가는 작업")).toBeInTheDocument();
    });
    expect(screen.getByText("최근 실패 5건 (24h)")).toBeInTheDocument();
    expect(screen.getByText("네이버 호출 24h")).toBeInTheDocument();
  });

  it("실행중 작업 = 비어 있으면 '실행 중인 작업이 없습니다' 표시", async () => {
    mockJobs.mockResolvedValueOnce({ items: [], total: 0, page: 1, page_size: 20 });
    mockFailures.mockResolvedValueOnce({ window_hours: 24, total: 0, items: [] });
    mockNaver.mockResolvedValueOnce(mkNaver({ "24h": 0 }));
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("실행 중인 작업이 없습니다")).toBeInTheDocument();
    });
  });

  it("실행중 작업 1건 = job_type / processed / total 표시", async () => {
    mockJobs.mockResolvedValueOnce({
      items: [mkJob({ id: 7, job_type: "crawl_articles", target_id: "12345", processed_items: 42, total_items: 100 })],
      total: 1,
      page: 1,
      page_size: 20,
    });
    mockFailures.mockResolvedValueOnce({ window_hours: 24, total: 0, items: [] });
    mockNaver.mockResolvedValueOnce(mkNaver({ "24h": 0 }));
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText(/crawl_articles/)).toBeInTheDocument();
    });
    expect(screen.getByText("42/100")).toBeInTheDocument();
  });

  it("최근 실패 5건 미만 = items 전부 노출 + last_error truncate (line-clamp-2)", async () => {
    mockJobs.mockResolvedValueOnce({ items: [], total: 0, page: 1, page_size: 20 });
    mockFailures.mockResolvedValueOnce({
      window_hours: 24,
      total: 2,
      items: [
        mkFailure({ job_type: "crawl_details", count: 3, last_error: "Timeout after 30s" }),
        mkFailure({ job_type: "collect_prices", count: 1, last_error: null }),
      ],
    });
    mockNaver.mockResolvedValueOnce(mkNaver({ "24h": 0 }));
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("crawl_details")).toBeInTheDocument();
    });
    expect(screen.getByText("collect_prices")).toBeInTheDocument();
    expect(screen.getByText("3건")).toBeInTheDocument();
    const errorText = screen.getByText("Timeout after 30s");
    expect(errorText.className).toContain("line-clamp-2");
  });

  it("최근 실패 = 0건 = '최근 실패가 없습니다' 표시", async () => {
    mockJobs.mockResolvedValueOnce({ items: [], total: 0, page: 1, page_size: 20 });
    mockFailures.mockResolvedValueOnce({ window_hours: 24, total: 0, items: [] });
    mockNaver.mockResolvedValueOnce(mkNaver({ "24h": 0 }));
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("최근 실패가 없습니다")).toBeInTheDocument();
    });
  });

  it("네이버 호출 = 3축 (10m·1h·24h) 숫자 표시", async () => {
    mockJobs.mockResolvedValueOnce({ items: [], total: 0, page: 1, page_size: 20 });
    mockFailures.mockResolvedValueOnce({ window_hours: 24, total: 0, items: [] });
    mockNaver.mockResolvedValueOnce(mkNaver({ "10m": 12, "1h": 234, "24h": 5678 }));
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("5,678")).toBeInTheDocument();
    });
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("234")).toBeInTheDocument();
  });

  /** job_type 은 코드 원문이 아니라 crawl-job-labels 한글 라벨로 표시 (탭 간 표기 통일) */
  it("실행중 작업의 job_type 이 한글 라벨 + '단지 N' 으로 표시된다", async () => {
    mockJobs.mockResolvedValueOnce({
      items: [mkJob({ id: 9, job_type: "article_detail", target_id: "12345" })],
      total: 1,
      page: 1,
      page_size: 20,
    });
    mockFailures.mockResolvedValueOnce({ window_hours: 24, total: 0, items: [] });
    mockNaver.mockResolvedValueOnce(mkNaver({ "24h": 0 }));
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText(/매물 상세 보강/)).toBeInTheDocument();
    });
    // target_id 는 "단지 12345" 로 무엇을 가리키는 번호인지 밝힌다
    expect(screen.getByText(/단지 12345/)).toBeInTheDocument();
    // 코드 원문은 화면에 남지 않는다
    expect(screen.queryByText(/article_detail/)).not.toBeInTheDocument();
  });

  /** 최근 실패 목록의 job_type 도 같은 한글 라벨 적용 */
  it("최근 실패 목록의 job_type 이 한글 라벨로 표시된다", async () => {
    mockJobs.mockResolvedValueOnce({ items: [], total: 0, page: 1, page_size: 20 });
    mockFailures.mockResolvedValueOnce({
      window_hours: 24,
      total: 1,
      items: [mkFailure({ job_type: "complex_articles", count: 2 })],
    });
    mockNaver.mockResolvedValueOnce(mkNaver({ "24h": 0 }));
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("단지 매물 수집")).toBeInTheDocument();
    });
    expect(screen.queryByText("complex_articles")).not.toBeInTheDocument();
  });

  /** 미등록 job_type 코드는 라벨이 없으니 코드 그대로 (안전 폴백) */
  it("미등록 job_type 코드는 코드명 그대로 표시된다", async () => {
    mockJobs.mockResolvedValueOnce({ items: [], total: 0, page: 1, page_size: 20 });
    mockFailures.mockResolvedValueOnce({
      window_hours: 24,
      total: 1,
      items: [mkFailure({ job_type: "brand_new_job", count: 1 })],
    });
    mockNaver.mockResolvedValueOnce(mkNaver({ "24h": 0 }));
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("brand_new_job")).toBeInTheDocument();
    });
  });

  it("최근 실패 6건 이상 = 상위 5건만 slice 노출", async () => {
    mockJobs.mockResolvedValueOnce({ items: [], total: 0, page: 1, page_size: 20 });
    mockFailures.mockResolvedValueOnce({
      window_hours: 24,
      total: 6,
      items: [
        mkFailure({ job_type: "type_1", count: 1 }),
        mkFailure({ job_type: "type_2", count: 2 }),
        mkFailure({ job_type: "type_3", count: 3 }),
        mkFailure({ job_type: "type_4", count: 4 }),
        mkFailure({ job_type: "type_5", count: 5 }),
        mkFailure({ job_type: "type_6", count: 6 }),
      ],
    });
    mockNaver.mockResolvedValueOnce(mkNaver({ "24h": 0 }));
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("type_1")).toBeInTheDocument();
    });
    expect(screen.getByText("type_5")).toBeInTheDocument();
    expect(screen.queryByText("type_6")).not.toBeInTheDocument();
  });
});
