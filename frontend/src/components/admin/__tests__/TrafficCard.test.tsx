/**
 * TrafficCard 컴포넌트 테스트
 * 실행: npx vitest run src/components/admin/__tests__/TrafficCard.test.tsx
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";
import TrafficCard from "../TrafficCard";
import type { TrafficStats, TrafficWindow } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  getAdminTraffic: vi.fn(),
}));

import { getAdminTraffic } from "@/lib/api";
const mockGet = vi.mocked(getAdminTraffic);

const getToken = vi.fn().mockResolvedValue("test-token");

function emptyWindow(): TrafficWindow {
  return {
    total_requests: 0,
    unique_visitors: 0,
    p50_ms: 0,
    p95_ms: 0,
    rate_4xx: 0,
    rate_5xx: 0,
    top_paths: [],
    top_identities: [],
  };
}

function stats(overrides: Partial<TrafficStats> = {}): TrafficStats {
  return {
    windows: { "10m": emptyWindow(), "1h": emptyWindow(), "24h": emptyWindow() },
    process_uptime_seconds: 7200,
    window_truncated: false,
    record_count: 0,
    max_records: 200000,
    ...overrides,
  };
}

function renderWithProvider() {
  return render(
    <TestQueryProvider>
      <TrafficCard getToken={getToken} />
    </TestQueryProvider>,
  );
}

describe("TrafficCard 컴포넌트", () => {
  it("제목과 표 헤더가 렌더된다", async () => {
    mockGet.mockResolvedValueOnce(stats());
    renderWithProvider();
    expect(screen.getByText("트래픽 (요청 수 · 방문자 · 속도 · 오류)")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("요청 수")).toBeInTheDocument();
    });
    expect(screen.getByText("방문자")).toBeInTheDocument();
    expect(screen.getByText("속도(중간)")).toBeInTheDocument();
    expect(screen.getByText("속도(느림)")).toBeInTheDocument();
    // 세 윈도우 행 라벨
    expect(screen.getByText("10분")).toBeInTheDocument();
    expect(screen.getByText("1시간")).toBeInTheDocument();
    expect(screen.getByText("24시간")).toBeInTheDocument();
  });

  it("윈도우별 수치를 표에 표시한다", async () => {
    mockGet.mockResolvedValueOnce(
      stats({
        windows: {
          "10m": { ...emptyWindow(), total_requests: 120, unique_visitors: 8, p50_ms: 90, p95_ms: 410 },
          "1h": { ...emptyWindow(), total_requests: 1500, unique_visitors: 42, p50_ms: 110, p95_ms: 620 },
          "24h": { ...emptyWindow(), total_requests: 30000, unique_visitors: 900, p50_ms: 100, p95_ms: 500 },
        },
      }),
    );
    renderWithProvider();
    await waitFor(() => {
      expect(screen.getByText("30,000")).toBeInTheDocument();
    });
    expect(screen.getByText("1,500")).toBeInTheDocument();
    expect(screen.getByText("120")).toBeInTheDocument();
    expect(screen.getByText("620ms")).toBeInTheDocument();
  });

  it("경로 그룹을 한글 이름 + 원본 경로로 표시한다", async () => {
    mockGet.mockResolvedValueOnce(
      stats({
        windows: {
          "10m": emptyWindow(),
          "1h": {
            ...emptyWindow(),
            total_requests: 30,
            top_paths: [
              { path: "/api/live", count: 20 },
              { path: "/api/complexes", count: 10 },
            ],
          },
          "24h": emptyWindow(),
        },
      }),
    );
    renderWithProvider();
    await waitFor(() => {
      expect(screen.getByText("실시간 검색·크롤")).toBeInTheDocument();
    });
    expect(screen.getByText("단지·매물")).toBeInTheDocument();
    expect(screen.getByText("(/api/live)")).toBeInTheDocument();
  });

  it("알 수 없는 경로 그룹은 원본 그대로 표시한다", async () => {
    mockGet.mockResolvedValueOnce(
      stats({
        windows: {
          "10m": emptyWindow(),
          "1h": { ...emptyWindow(), total_requests: 5, top_paths: [{ path: "/api/newthing", count: 5 }] },
          "24h": emptyWindow(),
        },
      }),
    );
    renderWithProvider();
    await waitFor(() => {
      expect(screen.getByText("/api/newthing")).toBeInTheDocument();
    });
  });

  it("상위 식별자(남용 감지)를 표시한다", async () => {
    mockGet.mockResolvedValueOnce(
      stats({
        windows: {
          "10m": emptyWindow(),
          "1h": {
            ...emptyWindow(),
            total_requests: 900,
            top_identities: [
              { identity: "a1b2c3d4e5f6", count: 850 },
              { identity: "0f0f0f0f0f0f", count: 50 },
            ],
          },
          "24h": emptyWindow(),
        },
      }),
    );
    renderWithProvider();
    await waitFor(() => {
      expect(screen.getByText("a1b2c3d4e5f6")).toBeInTheDocument();
    });
    expect(screen.getByText("850")).toBeInTheDocument();
    // 자동 차단을 하지 않는다는 안내가 함께 보여야 한다
    expect(screen.getByText(/자동으로 막지는 않아요/)).toBeInTheDocument();
  });

  it("집계가 없으면 안내 문구를 보여준다", async () => {
    mockGet.mockResolvedValueOnce(stats());
    renderWithProvider();
    await waitFor(() => {
      expect(screen.getAllByText("아직 집계된 요청이 없습니다")).toHaveLength(2);
    });
  });

  it("5xx 오류율이 높으면 경고색으로 표시한다", async () => {
    mockGet.mockResolvedValueOnce(
      stats({
        windows: {
          "10m": emptyWindow(),
          "1h": { ...emptyWindow(), total_requests: 100, rate_5xx: 7.5 },
          "24h": emptyWindow(),
        },
      }),
    );
    renderWithProvider();
    await waitFor(() => {
      expect(screen.getByText("7.5%")).toBeInTheDocument();
    });
    expect(screen.getByText("7.5%").className).toContain("text-red-700");
  });

  it("기록 상한에 걸리면 24시간 수치가 부정확하다고 알린다", async () => {
    mockGet.mockResolvedValueOnce(stats({ window_truncated: true, max_records: 200000 }));
    renderWithProvider();
    await waitFor(() => {
      expect(screen.getByText(/24시간\s*숫자는 실제보다 작습니다/)).toBeInTheDocument();
    });
  });

  it("API 에러 시 에러 메시지를 표시한다 (삼키지 않음)", async () => {
    mockGet.mockRejectedValueOnce(new Error("network down"));
    renderWithProvider();
    await waitFor(() => {
      expect(
        screen.getByText(/트래픽 통계를 불러오지 못했습니다.*network down/),
      ).toBeInTheDocument();
    });
  });

  it("업타임 24시간 미만이면 경고색 뱃지", async () => {
    mockGet.mockResolvedValueOnce(stats({ process_uptime_seconds: 7200 }));
    renderWithProvider();
    await waitFor(() => {
      expect(screen.getByText("가동 2시간 0분")).toBeInTheDocument();
    });
    expect(screen.getByText("가동 2시간 0분").className).toContain("bg-amber-50");
  });
});
