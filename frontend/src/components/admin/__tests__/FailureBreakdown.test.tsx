/**
 * FailureBreakdown 카드 테스트 — 유형별 실패 분포
 * 실행: npx vitest run src/components/admin/__tests__/FailureBreakdown.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";
import FailureBreakdown from "../FailureBreakdown";

vi.mock("@/lib/api", () => ({
  getAdminCrawlFailures: vi.fn(),
}));

import { getAdminCrawlFailures } from "@/lib/api";
const mockGet = vi.mocked(getAdminCrawlFailures);

function renderCard(onJumpToFailed?: (jobType?: string) => void) {
  return render(
    <TestQueryProvider>
      <FailureBreakdown token="test-token" onJumpToFailed={onJumpToFailed} />
    </TestQueryProvider>,
  );
}

describe("FailureBreakdown", () => {
  it("실패 0건이면 모두 정상 메시지 표시", async () => {
    mockGet.mockResolvedValueOnce({
      window_hours: 24,
      total: 0,
      items: [],
    });
    renderCard();
    await waitFor(() => {
      expect(screen.getByText(/모두 정상이에요/)).toBeInTheDocument();
    });
  });

  it("유형별 카운트 + 한글 라벨 + 코드명 + 마지막 오류 표시", async () => {
    mockGet.mockResolvedValueOnce({
      window_hours: 24,
      total: 4,
      items: [
        {
          job_type: "complex_articles",
          count: 3,
          last_error: "네이버 API 차단",
          last_failed_at: new Date(Date.now() - 600_000).toISOString(),
        },
        {
          job_type: "price_history",
          count: 1,
          last_error: "DB 락 타임아웃",
          last_failed_at: new Date().toISOString(),
        },
      ],
    });
    renderCard();
    await waitFor(() => {
      expect(screen.getByText("단지 매물 수집")).toBeInTheDocument();
    });
    expect(screen.getByText("시세 이력 수집")).toBeInTheDocument();
    expect(screen.getByText("3건")).toBeInTheDocument();
    expect(screen.getByText("1건")).toBeInTheDocument();
    // 코드명 병기
    expect(screen.getByText("complex_articles")).toBeInTheDocument();
    // 최근 오류
    expect(screen.getByText(/네이버 API 차단/)).toBeInTheDocument();
    // 카드 헤더에 총합
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent("총 4건");
  });

  it("행 클릭 시 onJumpToFailed(jobType) 콜백 호출", async () => {
    mockGet.mockResolvedValueOnce({
      window_hours: 24,
      total: 2,
      items: [
        { job_type: "complex_articles", count: 2, last_error: null, last_failed_at: null },
      ],
    });
    const spy = vi.fn();
    renderCard(spy);
    await waitFor(() => {
      expect(screen.getByText("단지 매물 수집")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /단지 매물 수집/ }));
    expect(spy).toHaveBeenCalledWith("complex_articles");
  });

  it("로딩 중에는 회색 placeholder 표시", () => {
    mockGet.mockImplementation(() => new Promise(() => { /* never */ }));
    const { container } = renderCard();
    expect(container.querySelector(".animate-pulse")).toBeTruthy();
  });
});
