/**
 * useCrawlProgress 훅 테스트 — React Query 기반 폴링
 * 실행: npx vitest run src/hooks/__tests__/useCrawlProgress.test.ts
 */
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";

// API mock
vi.mock("@/lib/api", () => ({
  startLiveCrawl: vi.fn().mockResolvedValue({ status: "started", complex_no: "C001" }),
  getCrawlStatus: vi.fn().mockResolvedValue({ status: "idle", complex_no: "C001" }),
  getArticles: vi.fn().mockResolvedValue({ articles: [], total: 0, page: 1, page_size: 50 }),
  getPyeongDetails: vi.fn().mockResolvedValue({ pyeong_details: [] }),
  getComplex: vi.fn().mockResolvedValue({ complex_no: "C001", complex_name: "테스트" }),

}));

describe("useCrawlProgress 모듈", () => {
  it("모듈 임포트 가능", async () => {
    const mod = await import("../../hooks/useCrawlProgress");
    expect(mod.useCrawlProgress).toBeDefined();
    expect(typeof mod.useCrawlProgress).toBe("function");
  });

  it("API mock 함수들이 정의됨", async () => {
    const api = await import("@/lib/api");
    expect(api.startLiveCrawl).toBeDefined();
    expect(api.getCrawlStatus).toBeDefined();
    expect(api.getArticles).toBeDefined();
  });
});

describe("useCrawlProgress — 반환값 검증 (React Query)", () => {
  it("반환 타입에 crawling, crawlMessage, startCrawl, clearAllPolling, isPolling 포함", async () => {
    const { useCrawlProgress } = await import("../../hooks/useCrawlProgress");
    const { result } = renderHook(() => useCrawlProgress(), {
      wrapper: TestQueryProvider,
    });
    expect(result.current).toHaveProperty("crawling");
    expect(result.current).toHaveProperty("crawlMessage");
    expect(result.current).toHaveProperty("startCrawl");
    expect(result.current).toHaveProperty("clearAllPolling");
    expect(result.current).toHaveProperty("isPolling");
  }, 15000);

  it("초기 crawling 상태는 false", async () => {
    const { useCrawlProgress } = await import("../../hooks/useCrawlProgress");
    const { result } = renderHook(() => useCrawlProgress(), {
      wrapper: TestQueryProvider,
    });
    expect(result.current.crawling).toBe(false);
  }, 15000);

  it("초기 crawlMessage는 빈 문자열", async () => {
    const { useCrawlProgress } = await import("../../hooks/useCrawlProgress");
    const { result } = renderHook(() => useCrawlProgress(), {
      wrapper: TestQueryProvider,
    });
    expect(result.current.crawlMessage).toBe("");
  }, 15000);

  it("초기 crawlProgress는 null", async () => {
    const { useCrawlProgress } = await import("../../hooks/useCrawlProgress");
    const { result } = renderHook(() => useCrawlProgress(), {
      wrapper: TestQueryProvider,
    });
    expect(result.current.crawlProgress).toBeNull();
  }, 15000);

  it("초기 isPolling은 false", async () => {
    const { useCrawlProgress } = await import("../../hooks/useCrawlProgress");
    const { result } = renderHook(() => useCrawlProgress(), {
      wrapper: TestQueryProvider,
    });
    expect(result.current.isPolling).toBe(false);
  }, 15000);

  it("startCrawl 호출 시 crawling=true, isPolling=true로 전환", async () => {
    const { useCrawlProgress } = await import("../../hooks/useCrawlProgress");
    const { result } = renderHook(() => useCrawlProgress(), {
      wrapper: TestQueryProvider,
    });

    act(() => {
      result.current.startCrawl("C001");
    });

    expect(result.current.crawling).toBe(true);
    expect(result.current.isPolling).toBe(true);
  }, 15000);
});
