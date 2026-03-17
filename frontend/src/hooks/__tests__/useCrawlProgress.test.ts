/**
 * useCrawlProgress 훅 테스트 — 초기 상태, 폴링 정리
 * 실행: npx vitest run src/hooks/__tests__/useCrawlProgress.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// API mock
vi.mock("@/lib/api", () => ({
  startLiveCrawl: vi.fn().mockResolvedValue({ status: "started", complex_no: "C001" }),
  getCrawlStatus: vi.fn().mockResolvedValue({ status: "idle", complex_no: "C001" }),
  getArticles: vi.fn().mockResolvedValue({ articles: [], total: 0, page: 1, page_size: 50 }),
  getPyeongDetails: vi.fn().mockResolvedValue({ pyeong_details: [] }),
  getComplex: vi.fn().mockResolvedValue({ complex_no: "C001", complex_name: "테스트" }),
  liveArticles: vi.fn().mockResolvedValue({ articles: [], total: 0, page: 1, page_size: 50, complex: null }),
}));

describe("useCrawlProgress 모듈", () => {
  it("모듈 임포트 가능", async () => {
    const mod = await import("../../hooks/useCrawlProgress");
    expect(mod.useCrawlProgress).toBeDefined();
    expect(typeof mod.useCrawlProgress).toBe("function");
  });

describe("useCrawlProgress — 반환값 검증", () => {
  it("반환 타입에 crawling, crawlMessage, startCrawl, clearAllPolling 포함", async () => {
    const { renderHook } = await import("@testing-library/react");
    const { useCrawlProgress } = await import("../../hooks/useCrawlProgress");
    const { result } = renderHook(() => useCrawlProgress());
    expect(result.current).toHaveProperty("crawling");
    expect(result.current).toHaveProperty("crawlMessage");
    expect(result.current).toHaveProperty("startCrawl");
    expect(result.current).toHaveProperty("clearAllPolling");
  });

  it("초기 crawling 상태는 false", async () => {
    const { renderHook } = await import("@testing-library/react");
    const { useCrawlProgress } = await import("../../hooks/useCrawlProgress");
    const { result } = renderHook(() => useCrawlProgress());
    expect(result.current.crawling).toBe(false);
  });

  it("초기 crawlMessage는 빈 문자열", async () => {
    const { renderHook } = await import("@testing-library/react");
    const { useCrawlProgress } = await import("../../hooks/useCrawlProgress");
    const { result } = renderHook(() => useCrawlProgress());
    expect(result.current.crawlMessage).toBe("");
  });

  it("crawlProgress 초기값은 null", async () => {
    const { renderHook } = await import("@testing-library/react");
    const { useCrawlProgress } = await import("../../hooks/useCrawlProgress");
    const { result } = renderHook(() => useCrawlProgress());
    expect(result.current.crawlProgress).toBeNull();
  });
});


  it("API mock 함수들이 정의됨", async () => {
    const api = await import("@/lib/api");
    expect(api.startLiveCrawl).toBeDefined();
    expect(api.getCrawlStatus).toBeDefined();
    expect(api.getArticles).toBeDefined();
  });
});
