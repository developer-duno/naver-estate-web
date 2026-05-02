/**
 * CrawlSummary 컴포넌트 테스트 — /admin/crawl 최상단 한 줄 요약
 * 실행: npx vitest run src/components/admin/__tests__/CrawlSummary.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";
import CrawlSummary from "../CrawlSummary";
import type { CrawlJobDetail, PaginatedResponse } from "@/types/admin";

vi.mock("@/lib/api", () => ({
  getAdminCrawlJobs: vi.fn(),
}));

import { getAdminCrawlJobs } from "@/lib/api";
const mockGet = vi.mocked(getAdminCrawlJobs);

function renderSummary(token = "test-token") {
  return render(
    <TestQueryProvider>
      <CrawlSummary token={token} />
    </TestQueryProvider>,
  );
}

function mkResponse(total: number): PaginatedResponse<CrawlJobDetail> {
  return { items: [], total, page: 1, page_size: 20 };
}

describe("CrawlSummary", () => {
  it("status 별 total 카운트가 텍스트로 표시된다", async () => {
    mockGet
      .mockImplementationOnce(async (_t, params) => {
        if (params?.status === "running") return mkResponse(2);
        return mkResponse(0);
      })
      .mockImplementationOnce(async (_t, params) => {
        if (params?.status === "pending") return mkResponse(5);
        return mkResponse(0);
      })
      .mockImplementationOnce(async (_t, params) => {
        if (params?.status === "failed") return mkResponse(3);
        return mkResponse(0);
      });

    renderSummary();
    await waitFor(() => {
      expect(screen.getByText(/돌아가는 중 2건/)).toBeInTheDocument();
    });
    expect(screen.getByText(/대기 중 5건/)).toBeInTheDocument();
    expect(screen.getByText(/실패 누적 3건/)).toBeInTheDocument();
  });

  it("failed > 0 이면 bg-red-50 클래스 적용", async () => {
    mockGet
      .mockResolvedValueOnce(mkResponse(0))
      .mockResolvedValueOnce(mkResponse(0))
      .mockResolvedValueOnce(mkResponse(1));

    const { container } = renderSummary();
    await waitFor(() => {
      expect(screen.getByText(/실패 누적 1건/)).toBeInTheDocument();
    });
    const root = container.querySelector("[aria-label='현재 크롤 작업 요약']");
    expect(root?.className).toContain("bg-red-50");
  });

  it("로딩 중에는 회색 placeholder 표시", () => {
    mockGet.mockImplementation(() => new Promise(() => { /* never resolves */ }));
    const { container } = renderSummary();
    const placeholder = container.querySelector("[aria-label='크롤 요약 로딩 중']");
    expect(placeholder).toBeTruthy();
    expect(placeholder?.className).toContain("animate-pulse");
  });

  it("failed > 0 + onJumpToFailed 제공 시 클릭하면 콜백 호출", async () => {
    mockGet
      .mockResolvedValueOnce(mkResponse(0))
      .mockResolvedValueOnce(mkResponse(0))
      .mockResolvedValueOnce(mkResponse(189));

    const onJumpToFailed = vi.fn();
    render(
      <TestQueryProvider>
        <CrawlSummary token="test-token" onJumpToFailed={onJumpToFailed} />
      </TestQueryProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /실패 누적 189건/ })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /실패 누적 189건/ }));
    expect(onJumpToFailed).toHaveBeenCalledTimes(1);
  });
});
