/**
 * ErrorRateChart 컴포넌트 테스트 — 에러율 추이 차트
 * 실행: npx vitest run src/components/admin/__tests__/ErrorRateChart.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";
import ErrorRateChart from "../ErrorRateChart";

/* Recharts 는 jsdom 에서 ResponsiveContainer 폭 측정 실패 → 차트 shell 만 검증 */
vi.mock("@/lib/api", () => ({
  getAdminErrorStats: vi.fn(),
}));

import { getAdminErrorStats } from "@/lib/api";
const mockGet = vi.mocked(getAdminErrorStats);

const getToken = vi.fn().mockResolvedValue("test-token");

function renderWithProvider() {
  return render(
    <TestQueryProvider>
      <ErrorRateChart getToken={getToken} />
    </TestQueryProvider>,
  );
}

describe("ErrorRateChart 컴포넌트", () => {
  /** 기본 제목 + 7/14/30 토글 버튼 */
  it("제목과 기간 토글 버튼이 렌더된다", () => {
    mockGet.mockResolvedValueOnce({ days: 14, rows: [] });
    renderWithProvider();
    expect(screen.getByText("크롤 에러율 추이")).toBeInTheDocument();
    expect(screen.getByText("7일")).toBeInTheDocument();
    expect(screen.getByText("14일")).toBeInTheDocument();
    expect(screen.getByText("30일")).toBeInTheDocument();
  });

  /** 빈 데이터 → "데이터가 없습니다" */
  it("빈 데이터일 때 empty 메시지를 표시한다", async () => {
    mockGet.mockResolvedValueOnce({
      days: 14,
      rows: Array.from({ length: 15 }, (_, i) => ({
        date: `2026-04-${String(i + 1).padStart(2, "0")}`,
        completed: 0,
        failed: 0,
        paused: 0,
        pending: 0,
        running: 0,
        cancelled: 0,
      })),
    });
    renderWithProvider();
    await waitFor(() => {
      expect(screen.getByText("데이터가 없습니다")).toBeInTheDocument();
    });
  });

  /** 7일 버튼 클릭 시 API 재호출 */
  it("7일 버튼 클릭 시 days=7 로 API 호출", async () => {
    mockGet.mockResolvedValue({ days: 14, rows: [] });
    renderWithProvider();
    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith("test-token", 14);
    });

    mockGet.mockResolvedValueOnce({ days: 7, rows: [] });
    fireEvent.click(screen.getByText("7일"));

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith("test-token", 7);
    });
  });

  /** API 에러 → 에러 메시지 표시 */
  it("API 에러 시 에러 메시지 표시", async () => {
    mockGet.mockRejectedValueOnce(new Error("network down"));
    renderWithProvider();
    await waitFor(() => {
      expect(
        screen.getByText(/에러율 데이터를 불러오지 못했습니다.*network down/),
      ).toBeInTheDocument();
    });
  });
});
