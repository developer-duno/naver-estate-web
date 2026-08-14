/**
 * QuotaStatusCard 컴포넌트 테스트
 * 실행: npx vitest run src/components/admin/__tests__/QuotaStatusCard.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";
import QuotaStatusCard from "../QuotaStatusCard";
import type { QuotaStatus } from "@/types/admin";

vi.mock("@/lib/api", () => ({
  getAdminQuotaStatus: vi.fn(),
}));

import { getAdminQuotaStatus } from "@/lib/api";
const mockGet = vi.mocked(getAdminQuotaStatus);

function renderCard(token = "test-token") {
  return render(
    <TestQueryProvider>
      <QuotaStatusCard token={token} />
    </TestQueryProvider>,
  );
}

const fixture = (overrides: Partial<QuotaStatus> = {}): QuotaStatus => ({
  api_name: "data_go_kr",
  date: "2026-05-11",
  count: 5000,
  limit: 10000,
  remaining: 5000,
  utilization_pct: 50.0,
  ...overrides,
});

describe("QuotaStatusCard 컴포넌트", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("정상 사용률 50% — 녹색 정상 라벨 + 사용수·한도 표기", async () => {
    mockGet.mockResolvedValueOnce(fixture());
    renderCard();
    await waitFor(() => expect(screen.getByText("정상")).toBeInTheDocument());
    expect(screen.getByText("5,000")).toBeInTheDocument();
    expect(screen.getByText("/ 10,000회")).toBeInTheDocument();
    expect(screen.getByText("사용률 50%")).toBeInTheDocument();
    expect(screen.getByText("남은 호출 5,000회")).toBeInTheDocument();
  });

  it("주의 사용률 75% — 주의 라벨", async () => {
    mockGet.mockResolvedValueOnce(fixture({ count: 7500, remaining: 2500, utilization_pct: 75.0 }));
    renderCard();
    await waitFor(() => expect(screen.getByText("주의")).toBeInTheDocument());
    expect(screen.getByText("사용률 75%")).toBeInTheDocument();
  });

  it("위험 사용률 95% — 위험 라벨", async () => {
    mockGet.mockResolvedValueOnce(fixture({ count: 9500, remaining: 500, utilization_pct: 95.0 }));
    renderCard();
    await waitFor(() => expect(screen.getByText("위험")).toBeInTheDocument());
    expect(screen.getByText("사용률 95%")).toBeInTheDocument();
  });

  it("쿼터 DB 조회 실패 (count = -1) — 폴백 메시지 표시", async () => {
    mockGet.mockResolvedValueOnce(fixture({ count: -1, remaining: -1, utilization_pct: -1 }));
    renderCard();
    await waitFor(() => expect(screen.getByText(/한도 기록을 불러오지 못해 임시 집계로 표시 중이에요/)).toBeInTheDocument());
    expect(screen.queryByText("정상")).not.toBeInTheDocument();
    expect(screen.queryByText("주의")).not.toBeInTheDocument();
    expect(screen.queryByText("위험")).not.toBeInTheDocument();
  });

  it("API 에러 — 에러 메시지 표시", async () => {
    mockGet.mockRejectedValueOnce(new Error("network error"));
    renderCard();
    await waitFor(() => expect(screen.getByText(/오늘 사용량을 불러오지 못했어요/)).toBeInTheDocument());
    expect(screen.getByText(/network error/)).toBeInTheDocument();
  });
});
