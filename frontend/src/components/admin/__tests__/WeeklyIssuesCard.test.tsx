/**
 * WeeklyIssuesCard 컴포넌트 테스트 — 검증 대기 + 7일 실패 크롤 + 헛바퀴 종목 합산
 * 실행: npx vitest run src/components/admin/__tests__/WeeklyIssuesCard.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";
import WeeklyIssuesCard from "../WeeklyIssuesCard";
import type { DataFreshnessResponse } from "@/types/admin";

vi.mock("@/lib/api", () => ({
  getAdminVerifications: vi.fn(),
  getAdminCrawlFailures: vi.fn(),
  getDataFreshness: vi.fn(),
}));

import {
  getAdminVerifications,
  getAdminCrawlFailures,
  getDataFreshness,
} from "@/lib/api";

const mockVerifications = vi.mocked(getAdminVerifications);
const mockFailures = vi.mocked(getAdminCrawlFailures);
const mockFreshness = vi.mocked(getDataFreshness);

function renderCard(token = "test-token") {
  return render(
    <TestQueryProvider>
      <WeeklyIssuesCard token={token} />
    </TestQueryProvider>,
  );
}

const mkFreshItem = (
  overrides: Partial<DataFreshnessResponse["items"][number]>,
) => ({
  key: "x",
  label: "x",
  count: 0,
  last_updated: null,
  expected_interval_seconds: 86400,
  status: "green" as const,
  spinning: false,
  last_job: null,
  new_rows: null,
  ...overrides,
});

describe("WeeklyIssuesCard", () => {
  it("3개 카운트 모두 0 → '이번 주 챙길 일 0건' + 모든 링크 회색 톤", async () => {
    mockVerifications.mockResolvedValueOnce({ items: [], total: 0, page: 1, page_size: 20 });
    mockFailures.mockResolvedValueOnce({ window_hours: 168, total: 0, items: [] });
    mockFreshness.mockResolvedValueOnce({
      generated_at: new Date().toISOString(),
      items: [mkFreshItem({ key: "a", spinning: false })],
    });

    renderCard();
    await waitFor(() => {
      expect(screen.getByText(/이번 주 챙길 일 0건/)).toBeInTheDocument();
    });
    // 모든 행 0건 + text-gray-400 회색 톤
    const link = screen.getByRole("link", { name: /검증 대기 공인중개사 0건/ });
    expect(link.className).toContain("text-gray-400");
  });

  it("검증 대기 2건 + 실패 0 + 헛바퀴 1 → 총 3건 + 검증 대기·헛바퀴 빨간색", async () => {
    mockVerifications.mockResolvedValueOnce({ items: [], total: 2, page: 1, page_size: 20 });
    mockFailures.mockResolvedValueOnce({ window_hours: 168, total: 0, items: [] });
    mockFreshness.mockResolvedValueOnce({
      generated_at: new Date().toISOString(),
      items: [
        mkFreshItem({ key: "a", spinning: true }),
        mkFreshItem({ key: "b", spinning: false }),
      ],
    });

    renderCard();
    await waitFor(() => {
      expect(screen.getByText(/이번 주 챙길 일 3건/)).toBeInTheDocument();
    });
    const verifLink = screen.getByRole("link", { name: /검증 대기 공인중개사 2건/ });
    expect(verifLink.className).toContain("text-red-700");
    const spinBtn = screen.getByRole("button", { name: /데이터 헛바퀴 종목 1건/ });
    expect(spinBtn.className).toContain("text-red-700");
  });

  it("API 에러 1개(failures) → 다른 2개는 정상 표시, 에러난 건 0 폴백", async () => {
    mockVerifications.mockResolvedValueOnce({ items: [], total: 5, page: 1, page_size: 20 });
    mockFailures.mockRejectedValueOnce(new Error("네트워크 오류"));
    mockFreshness.mockResolvedValueOnce({
      generated_at: new Date().toISOString(),
      items: [mkFreshItem({ key: "a", spinning: true })],
    });

    renderCard();
    await waitFor(() => {
      expect(screen.getByText(/검증 대기 공인중개사/)).toBeInTheDocument();
    });
    // failures 는 ?? 0 폴백 → 5 + 0 + 1 = 6건
    await waitFor(() => {
      expect(screen.getByText(/이번 주 챙길 일 6건/)).toBeInTheDocument();
    });
  });

  it("로딩 중 → 카드 노출 + 헤더 카운트 표시 안 됨 (N건 텍스트 부재)", async () => {
    // never resolve → isLoading 유지
    mockVerifications.mockImplementationOnce(() => new Promise(() => {}));
    mockFailures.mockImplementationOnce(() => new Promise(() => {}));
    mockFreshness.mockImplementationOnce(() => new Promise(() => {}));

    renderCard();
    // 카드 자체(목록 행 텍스트)는 렌더되지만 헤더 카운트 "N건" 은 부재
    expect(screen.getByText("검증 대기 공인중개사")).toBeInTheDocument();
    expect(screen.queryByText(/이번 주 챙길 일 \d+건/)).not.toBeInTheDocument();
  });

  it("검증 대기 a 태그: href=/admin/users#verification-review + aria-label에 '사용자 관리 페이지로 이동' 동시 단언 (v3 정정)", async () => {
    mockVerifications.mockResolvedValueOnce({ items: [], total: 1, page: 1, page_size: 20 });
    mockFailures.mockResolvedValueOnce({ window_hours: 168, total: 0, items: [] });
    mockFreshness.mockResolvedValueOnce({
      generated_at: new Date().toISOString(),
      items: [],
    });

    renderCard();
    await waitFor(() => {
      const link = screen.getByRole("link", { name: /검증 대기 공인중개사 1건 — 클릭 시 사용자 관리 페이지로 이동/ });
      expect(link.getAttribute("href")).toBe("/admin/users#verification-review");
    });
  });
});
