/**
 * useCrawlAction 훅 테스트 — 수동 "데이터 갱신" 버튼 로직
 * 실행: npx vitest run src/hooks/__tests__/useCrawlAction.test.ts
 *
 * 검증 항목:
 *  1. cached 응답 시 invalidateQueries 호출 + force=false 전달
 *  2. cached 직후 10초 내 재클릭 → force=true 전달
 *  3. started 응답 시 기존 10/20/30 초 invalidate 체인
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";

// API mock
const mockStartLiveCrawl = vi.fn();

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    startLiveCrawl: (...args: unknown[]) => mockStartLiveCrawl(...args),
  };
});

// Supabase session 주입
vi.mock("@/lib/supabase", () => ({
  createClient: () => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: "test-token" } },
      }),
    },
  }),
}));

// next/navigation router stub
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("useCrawlAction — 수동 갱신 로직", () => {
  beforeEach(() => {
    mockStartLiveCrawl.mockReset();
  });

  it("첫 클릭에 force=false 로 호출하고, cached 응답 시 invalidateQueries 를 호출한다", async () => {
    mockStartLiveCrawl.mockResolvedValue({
      complex_no: "C001",
      status: "cached",
      last_crawled_at: new Date(Date.now() - 12 * 60_000).toISOString(),
    });

    const { useCrawlAction } = await import("../useCrawlAction");
    const { result } = renderHook(() => useCrawlAction("C001"), {
      wrapper: TestQueryProvider,
    });

    await act(async () => {
      result.current.handleCrawl();
    });

    // 첫 클릭은 force=false
    await waitFor(() => {
      expect(mockStartLiveCrawl).toHaveBeenCalledTimes(1);
    });
    expect(mockStartLiveCrawl).toHaveBeenNthCalledWith(1, "C001", "test-token", false);

    // cached 분기: 메시지에 "N분 전 갱신됨" + 강제 갱신 안내 포함
    await waitFor(() => {
      expect(result.current.message).toContain("분 전");
      expect(result.current.message).toContain("강제 갱신");
    });
    expect(result.current.messageType).toBe("success");
    expect(result.current.crawling).toBe(false);
  }, 15000);

  it("cached 직후 10초 내 재클릭은 force=true 로 호출한다", async () => {
    mockStartLiveCrawl
      .mockResolvedValueOnce({
        complex_no: "C002",
        status: "cached",
        last_crawled_at: new Date().toISOString(),
      })
      .mockResolvedValueOnce({
        complex_no: "C002",
        status: "started",
      });

    const { useCrawlAction } = await import("../useCrawlAction");
    const { result } = renderHook(() => useCrawlAction("C002"), {
      wrapper: TestQueryProvider,
    });

    // 1차 클릭 (cached)
    await act(async () => {
      result.current.handleCrawl();
    });
    await waitFor(() => {
      expect(mockStartLiveCrawl).toHaveBeenCalledTimes(1);
    });

    // 2차 클릭 (즉시) → force=true 기대
    await act(async () => {
      result.current.handleCrawl();
    });
    await waitFor(() => {
      expect(mockStartLiveCrawl).toHaveBeenCalledTimes(2);
    });

    expect(mockStartLiveCrawl).toHaveBeenNthCalledWith(1, "C002", "test-token", false);
    expect(mockStartLiveCrawl).toHaveBeenNthCalledWith(2, "C002", "test-token", true);
  }, 15000);

  it("started 응답 시 '데이터 갱신 중...' 메시지로 진입한다", async () => {
    mockStartLiveCrawl.mockResolvedValue({
      complex_no: "C003",
      status: "started",
    });

    const { useCrawlAction } = await import("../useCrawlAction");
    const { result } = renderHook(() => useCrawlAction("C003"), {
      wrapper: TestQueryProvider,
    });

    await act(async () => {
      result.current.handleCrawl();
    });

    await waitFor(() => {
      expect(result.current.message).toBe("데이터 갱신 중...");
    });
    expect(result.current.messageType).toBe("info");
    expect(mockStartLiveCrawl).toHaveBeenCalledWith("C003", "test-token", false);
  }, 15000);
});
