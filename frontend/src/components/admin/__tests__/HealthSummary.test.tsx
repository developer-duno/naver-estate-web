/**
 * HealthSummary 컴포넌트 테스트 — 대시보드 최상단 한 줄 요약
 * 실행: npx vitest run src/components/admin/__tests__/HealthSummary.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";
import HealthSummary from "../HealthSummary";
import type { DataFreshnessResponse } from "@/types/admin";

vi.mock("@/lib/api", () => ({
  getDataFreshness: vi.fn(),
}));

import { getDataFreshness } from "@/lib/api";
const mockGet = vi.mocked(getDataFreshness);

function renderSummary(token = "test-token") {
  return render(
    <TestQueryProvider>
      <HealthSummary token={token} />
    </TestQueryProvider>,
  );
}

const mkItem = (overrides: Partial<DataFreshnessResponse["items"][number]>) => ({
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

describe("HealthSummary", () => {
  it("정상/주의/지연/헛바퀴 카운트가 표시된다", async () => {
    mockGet.mockResolvedValueOnce({
      generated_at: new Date().toISOString(),
      items: [
        mkItem({ key: "a", status: "green" }),
        mkItem({ key: "b", status: "green" }),
        mkItem({ key: "c", status: "green" }),
        mkItem({ key: "d", status: "green" }),
        mkItem({ key: "e", status: "green" }),
        mkItem({ key: "f", status: "green" }),
        mkItem({ key: "g", status: "yellow" }),
        mkItem({ key: "h", status: "red" }),
      ],
    });
    renderSummary();
    await waitFor(() => {
      expect(screen.getByText(/정상 6/)).toBeInTheDocument();
    });
    expect(screen.getByText(/주의 1/)).toBeInTheDocument();
    expect(screen.getByText(/지연 1/)).toBeInTheDocument();
    expect(screen.getByText(/헛바퀴 0/)).toBeInTheDocument();
  });

  it("헛바퀴 의심 종목이 1+ 이면 빨간 배경 + 강조 텍스트", async () => {
    mockGet.mockResolvedValueOnce({
      generated_at: new Date().toISOString(),
      items: [
        mkItem({ key: "a", status: "green" }),
        mkItem({ key: "b", status: "red", spinning: true }),
      ],
    });
    const { container } = renderSummary();
    await waitFor(() => {
      expect(screen.getByText(/헛바퀴 1/)).toBeInTheDocument();
    });
    const button = container.querySelector("button");
    expect(button?.className).toContain("bg-red-50");
  });

  it("클릭 시 신선도 카드로 스크롤 (scrollIntoView 호출)", async () => {
    mockGet.mockResolvedValueOnce({
      generated_at: new Date().toISOString(),
      items: [mkItem({ key: "a", status: "green" })],
    });
    // 신선도 카드 자리 확보
    const target = document.createElement("div");
    target.id = "freshness";
    const scrollSpy = vi.fn();
    target.scrollIntoView = scrollSpy;
    document.body.appendChild(target);

    renderSummary();
    await waitFor(() => {
      expect(screen.getByText(/정상 1/)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button"));
    expect(scrollSpy).toHaveBeenCalled();

    document.body.removeChild(target);
  });
});
