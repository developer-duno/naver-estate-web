/**
 * /admin/data 페이지 — 대시보드와 같은 숫자를 두 화면에 두지 않는다 (세션 465 B6)
 * 실행: npx vitest run src/app/admin/data/__tests__/page.test.tsx
 *
 * 대시보드 2층의 4칸(단지 수·활성 매물·사용자·오늘 수집)은 이 화면에서 빠지고,
 * 24시간 오류·채워진 비율만 남는지 본다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";
import type { DetailedStats } from "@/types/admin";

vi.mock("@/lib/api", () => ({
  getAdminDetailedStats: vi.fn(),
}));

vi.mock("@/hooks/useAdminQuery", () => ({
  useTokenReady: () => ({ token: "test-token", getToken: vi.fn(async () => "test-token") }),
}));

import { getAdminDetailedStats } from "@/lib/api";
import AdminDataPage from "../page";

const mockStats = vi.mocked(getAdminDetailedStats);

function mkStats(overrides: Partial<DetailedStats> = {}): DetailedStats {
  return {
    complex_count: 1234,
    article_count: 0,
    active_article_count: 56789,
    user_count: 42,
    today_crawl_count: 7,
    recent_crawl_jobs: [],
    error_count_24h: 3,
    complex_detail_fill_rate: 0.5,
    ...overrides,
  };
}

function renderPage() {
  return render(
    <TestQueryProvider>
      <AdminDataPage />
    </TestQueryProvider>,
  );
}

describe("/admin/data 숫자 자세히 보기", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStats.mockResolvedValue(mkStats());
  });

  it("대시보드와 같은 4칸 라벨·숫자가 없고, 24시간 오류·채워진 비율만 보인다", async () => {
    renderPage();
    expect(await screen.findByText("최근 24시간 오류: 3건")).toBeInTheDocument();
    expect(screen.getByText("채워진 비율")).toBeInTheDocument();
    for (const label of ["단지 수", "활성 매물", "사용자", "오늘 수집"]) {
      expect(screen.queryByText(label)).toBeNull();
    }
    expect(screen.queryByText("1,234")).toBeNull();
  });

  it("안내 문단은 4개 숫자가 대시보드에 있다고 알려 준다", async () => {
    renderPage();
    expect(await screen.findByText(/큰 숫자 4개는 대시보드에서 봐요/)).toBeInTheDocument();
  });

  it("불러오기에 실패하면 오류 문구를 보인다", async () => {
    mockStats.mockRejectedValue(new Error("통계를 불러오지 못했어요"));
    renderPage();
    expect(await screen.findByText("통계를 불러오지 못했어요")).toBeInTheDocument();
  });
});
