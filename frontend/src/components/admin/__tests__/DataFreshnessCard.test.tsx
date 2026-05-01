/**
 * DataFreshnessCard 컴포넌트 테스트
 * 실행: npx vitest run src/components/admin/__tests__/DataFreshnessCard.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";
import DataFreshnessCard from "../DataFreshnessCard";
import type { DataFreshnessResponse } from "@/types/admin";

vi.mock("@/lib/api", () => ({
  getDataFreshness: vi.fn(),
}));

import { getDataFreshness } from "@/lib/api";
const mockGet = vi.mocked(getDataFreshness);

function renderCard(token = "test-token") {
  return render(
    <TestQueryProvider>
      <DataFreshnessCard token={token} />
    </TestQueryProvider>,
  );
}

const baseFixture = (): DataFreshnessResponse => {
  const now = new Date();
  return {
    generated_at: now.toISOString(),
    items: [
      { key: "complexes", label: "단지", count: 63360, last_updated: new Date(now.getTime() - 60 * 60 * 1000).toISOString(), expected_interval_seconds: 604800, status: "green" },
      { key: "articles", label: "매물", count: 620635, last_updated: new Date(now.getTime() - 30 * 60 * 1000).toISOString(), expected_interval_seconds: 43200, status: "green" },
      { key: "complex_price_history", label: "시세 이력", count: 1200000, last_updated: new Date(now.getTime() - 3 * 86400 * 1000).toISOString(), expected_interval_seconds: 604800, status: "green" },
      { key: "unsold", label: "미분양 이력", count: 8432, last_updated: new Date(now.getTime() - 50 * 86400 * 1000).toISOString(), expected_interval_seconds: 2592000, status: "yellow" },
      { key: "air_quality", label: "대기질", count: 100, last_updated: new Date(now.getTime() - 40 * 60 * 1000).toISOString(), expected_interval_seconds: 86400, status: "green" },
      { key: "childcare", label: "어린이집", count: 0, last_updated: null, expected_interval_seconds: 2592000, status: "unknown" },
      { key: "crime_stats", label: "범죄통계", count: 2001, last_updated: new Date(now.getTime() - 300 * 86400 * 1000).toISOString(), expected_interval_seconds: 7776000, status: "red" },
      { key: "public_trades", label: "공공데이터 실거래가", count: 173964, last_updated: new Date(now.getTime() - 86400 * 1000).toISOString(), expected_interval_seconds: 604800, status: "green" },
    ],
  };
};

describe("DataFreshnessCard 컴포넌트", () => {
  it("제목과 8개 종목 라벨이 모두 렌더된다", async () => {
    mockGet.mockResolvedValueOnce(baseFixture());
    renderCard();
    expect(screen.getByText("데이터 신선도")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("단지")).toBeInTheDocument();
    });
    for (const label of ["매물", "시세 이력", "미분양 이력", "대기질", "어린이집", "범죄통계", "공공데이터 실거래가"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("count 는 천단위 콤마로 표시된다", async () => {
    mockGet.mockResolvedValueOnce(baseFixture());
    renderCard();
    await waitFor(() => {
      expect(screen.getByText("63,360")).toBeInTheDocument();
    });
    expect(screen.getByText("620,635")).toBeInTheDocument();
    expect(screen.getByText("173,964")).toBeInTheDocument();
  });

  it("status 별 dot 색이 매핑된다 (green/yellow/red/unknown)", async () => {
    mockGet.mockResolvedValueOnce(baseFixture());
    const { container } = renderCard();
    await waitFor(() => {
      expect(screen.getByText("단지")).toBeInTheDocument();
    });
    const dots = container.querySelectorAll('[aria-label]');
    const classes = Array.from(dots).map((d) => d.className);
    // green/yellow/red/unknown 각각 최소 1개 존재
    expect(classes.some((c) => c.includes("bg-green-500"))).toBe(true);
    expect(classes.some((c) => c.includes("bg-yellow-400"))).toBe(true);
    expect(classes.some((c) => c.includes("bg-red-500"))).toBe(true);
    expect(classes.some((c) => c.includes("bg-gray-300"))).toBe(true);
  });

  it("last_updated=null 이면 '미수집' 표시", async () => {
    mockGet.mockResolvedValueOnce(baseFixture());
    renderCard();
    await waitFor(() => {
      expect(screen.getByText("어린이집")).toBeInTheDocument();
    });
    expect(screen.getByText("미수집")).toBeInTheDocument();
  });

  it("API 에러 시 에러 메시지 표시", async () => {
    mockGet.mockRejectedValueOnce(new Error("network down"));
    renderCard();
    await waitFor(() => {
      expect(screen.getByText(/불러오기 실패.*network down/)).toBeInTheDocument();
    });
  });

  it("토큰이 빈 문자열이면 fetch 실행하지 않음", async () => {
    mockGet.mockClear();
    mockGet.mockResolvedValue(baseFixture());
    renderCard("");
    await new Promise((r) => setTimeout(r, 50));
    expect(mockGet).not.toHaveBeenCalled();
  });
});
