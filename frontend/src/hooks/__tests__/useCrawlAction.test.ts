/**
 * useCrawlAction 훅 테스트 — 수동·자동 "데이터 갱신" 로직
 * 실행: npx vitest run src/hooks/__tests__/useCrawlAction.test.ts
 *
 * 검증 항목:
 *  1. cached 응답 시 refetchQueries 호출 + "갱신됨" 문구
 *  2. started 응답 시 "불러오는 중" 메시지 진입 (force 파라미터 삭제됨)
 *  3. started 후 crawl-status 폴링 → done 순간 "갱신 완료" 표시
 *  4. cached 응답의 last_crawled_at 낙관적 주입
 *  5. 폴링 중 running 상태 → buildProgressMessage 결과 메시지 교체
 *  6. 서버 status=error → refetch 없이 빨강 배너 + 자동 사라짐 없음
 *  7. auto=true && autoEnabled=true → 마운트 시 1회 자동 실행
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TestQueryProvider } from "@/test-setup";
import { queryKeys } from "@/lib/query-keys";

// API mock
const mockStartLiveCrawl = vi.fn();
const mockGetCrawlStatus = vi.fn();

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    startLiveCrawl: (...args: unknown[]) => mockStartLiveCrawl(...args),
    getCrawlStatus: (...args: unknown[]) => mockGetCrawlStatus(...args),
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

describe("useCrawlAction — 크롤 트리거 + 폴링 + UI 상태", () => {
  beforeEach(() => {
    mockStartLiveCrawl.mockReset();
    mockGetCrawlStatus.mockReset();
  });

  it("cached 응답 시 'N분 전 갱신됨' 문구를 표시한다 (force 파라미터 없음)", async () => {
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

    await waitFor(() => {
      expect(mockStartLiveCrawl).toHaveBeenCalledTimes(1);
    });
    // 인자 2개만: complexNo + access_token (force 파라미터 삭제됨)
    expect(mockStartLiveCrawl).toHaveBeenNthCalledWith(1, "C001", "test-token");

    await waitFor(() => {
      expect(result.current.message).toContain("분 전");
      expect(result.current.message).toContain("갱신됨");
    });
    expect(result.current.message).not.toContain("강제 갱신");
    expect(result.current.messageType).toBe("success");
    expect(result.current.crawling).toBe(false);
  }, 15000);

  it("started 응답 시 '매물 목록 불러오는 중...' 메시지로 진입한다", async () => {
    mockStartLiveCrawl.mockResolvedValue({
      complex_no: "C003",
      status: "started",
    });
    mockGetCrawlStatus.mockResolvedValue({ complex_no: "C003", status: "running" });

    const { useCrawlAction } = await import("../useCrawlAction");
    const { result } = renderHook(() => useCrawlAction("C003"), {
      wrapper: TestQueryProvider,
    });

    await act(async () => {
      result.current.handleCrawl();
    });

    await waitFor(() => {
      expect(result.current.message).toContain("불러오는 중");
    });
    expect(result.current.messageType).toBe("info");
  }, 15000);

  it("started 후 crawl-status 폴링 done 감지 → '갱신 완료' 메시지", async () => {
    vi.useFakeTimers();
    mockStartLiveCrawl.mockResolvedValue({
      complex_no: "C004",
      status: "started",
    });
    mockGetCrawlStatus
      .mockResolvedValueOnce({ complex_no: "C004", status: "running", phase: "articles" })
      .mockResolvedValueOnce({ complex_no: "C004", status: "running", phase: "articles" })
      .mockResolvedValue({ complex_no: "C004", status: "done" });

    const { useCrawlAction } = await import("../useCrawlAction");
    const { result } = renderHook(() => useCrawlAction("C004"), {
      wrapper: TestQueryProvider,
    });

    await act(async () => {
      result.current.handleCrawl();
    });

    await vi.waitFor(
      () => expect(mockStartLiveCrawl).toHaveBeenCalledTimes(1),
      { timeout: 3000 },
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_100);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_100);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_100);
    });

    await vi.waitFor(
      () => expect(result.current.message).toBe("갱신 완료"),
      { timeout: 3000 },
    );
    expect(result.current.messageType).toBe("success");
    expect(result.current.crawling).toBe(false);

    vi.useRealTimers();
  }, 15000);

  it("cached 응답의 last_crawled_at 이 Complex 쿼리 캐시에 즉시 주입된다 (낙관적 업데이트)", async () => {
    const newIso = new Date(Date.now() - 3 * 60_000).toISOString();
    const oldIso = new Date(Date.now() - 5 * 24 * 60 * 60_000).toISOString();
    mockStartLiveCrawl.mockResolvedValue({
      complex_no: "C005",
      status: "cached",
      last_crawled_at: newIso,
    });

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } },
    });
    let queryFnCalls = 0;
    await client.prefetchQuery({
      queryKey: queryKeys.complex("C005"),
      queryFn: async () => {
        queryFnCalls += 1;
        return {
          complex_no: "C005",
          complex_name: "테스트",
          last_crawled_at: queryFnCalls === 1 ? oldIso : newIso,
        };
      },
    });
    const before = client.getQueryData(queryKeys.complex("C005")) as {
      last_crawled_at: string;
    };
    expect(before.last_crawled_at).toBe(oldIso);

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client }, children);

    const { useCrawlAction } = await import("../useCrawlAction");
    const { result } = renderHook(() => useCrawlAction("C005"), { wrapper });

    await act(async () => {
      result.current.handleCrawl();
    });

    await waitFor(() => {
      expect(mockStartLiveCrawl).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      const cached = client.getQueryData(queryKeys.complex("C005")) as {
        last_crawled_at: string;
        complex_name: string;
      } | undefined;
      expect(cached?.last_crawled_at).toBe(newIso);
      expect(cached?.complex_name).toBe("테스트");
    });
  }, 15000);

  it("폴링 중 running+phase=articles 이면 '매물 수집 중 N건' 진행률 문구로 교체된다", async () => {
    vi.useFakeTimers();
    mockStartLiveCrawl.mockResolvedValue({
      complex_no: "C006",
      status: "started",
    });
    mockGetCrawlStatus.mockResolvedValue({
      complex_no: "C006",
      status: "running",
      phase: "articles",
      article_count: 42,
      current_page: 3,
    });

    const { useCrawlAction } = await import("../useCrawlAction");
    const { result } = renderHook(() => useCrawlAction("C006"), {
      wrapper: TestQueryProvider,
    });

    await act(async () => {
      result.current.handleCrawl();
    });

    await vi.waitFor(
      () => expect(mockStartLiveCrawl).toHaveBeenCalledTimes(1),
      { timeout: 3000 },
    );

    // 첫 폴링(2초) 후 진행률 메시지로 갱신
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_100);
    });

    await vi.waitFor(
      () => expect(result.current.message).toContain("매물 수집 중 42건"),
      { timeout: 3000 },
    );
    expect(result.current.message).toContain("(3페이지)");
    expect(result.current.messageType).toBe("info");

    vi.useRealTimers();
  }, 15000);

  it("서버 status=error → refetchQueries 호출 없이 빨강 배너 메시지 유지", async () => {
    vi.useFakeTimers();
    mockStartLiveCrawl.mockResolvedValue({
      complex_no: "C007",
      status: "started",
    });
    mockGetCrawlStatus.mockResolvedValue({
      complex_no: "C007",
      status: "error",
      error: "naver timeout",
    });

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } },
    });
    const refetchSpy = vi.spyOn(client, "refetchQueries");

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client }, children);

    const { useCrawlAction } = await import("../useCrawlAction");
    const { result } = renderHook(() => useCrawlAction("C007"), { wrapper });

    await act(async () => {
      result.current.handleCrawl();
    });

    await vi.waitFor(
      () => expect(mockStartLiveCrawl).toHaveBeenCalledTimes(1),
      { timeout: 3000 },
    );

    // 첫 폴링(2초) 후 error 감지
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_100);
    });

    await vi.waitFor(
      () => expect(result.current.messageType).toBe("error"),
      { timeout: 3000 },
    );
    expect(result.current.message).toContain("네이버가 막아서");
    // 서버 error 필드 원문이 UI 에 노출되면 안 됨
    expect(result.current.message).not.toContain("naver timeout");
    expect(result.current.crawling).toBe(false);
    // error 분기에서는 refetchQueries 가 호출되지 않아야 함 (기존 데이터 보존)
    expect(refetchSpy).not.toHaveBeenCalled();

    // 4초 지나도 메시지 유지 (자동 사라짐 금지)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(result.current.message).toContain("네이버가 막아서");

    vi.useRealTimers();
  }, 15000);

  it("auto=true && autoEnabled=true → 마운트 시 1회 자동 실행", async () => {
    mockStartLiveCrawl.mockResolvedValue({
      complex_no: "C008",
      status: "cached",
      last_crawled_at: new Date().toISOString(),
    });

    const { useCrawlAction } = await import("../useCrawlAction");
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useCrawlAction("C008", { auto: true, autoEnabled: enabled }),
      {
        wrapper: TestQueryProvider,
        initialProps: { enabled: false },
      },
    );

    // autoEnabled=false 면 실행 안 됨
    await waitFor(() => {
      expect(mockStartLiveCrawl).not.toHaveBeenCalled();
    });

    // autoEnabled=true 로 전환 → 1회 실행
    rerender({ enabled: true });

    await waitFor(() => {
      expect(mockStartLiveCrawl).toHaveBeenCalledTimes(1);
    });

    // 재렌더 반복해도 추가 호출 없음 (autoTriggeredRef 로 1회 가드)
    rerender({ enabled: true });
    rerender({ enabled: true });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockStartLiveCrawl).toHaveBeenCalledTimes(1);
  }, 15000);

  it("already_running 응답 시 startPolling 재호출 안됨 + crawling=true 유지 + '이미 크롤링이 진행 중입니다.' 메시지", async () => {
    vi.useFakeTimers();
    mockStartLiveCrawl.mockResolvedValue({
      complex_no: "C009",
      status: "already_running",
      current_page: 2,
      article_count: 45,
    });

    const { useCrawlAction } = await import("../useCrawlAction");
    const { result } = renderHook(() => useCrawlAction("C009"), {
      wrapper: TestQueryProvider,
    });

    await act(async () => {
      result.current.handleCrawl();
    });

    await vi.waitFor(
      () => expect(mockStartLiveCrawl).toHaveBeenCalledTimes(1),
      { timeout: 3000 },
    );

    await vi.waitFor(
      () => expect(result.current.message).toBe("이미 크롤링이 진행 중입니다."),
      { timeout: 3000 },
    );
    expect(result.current.messageType).toBe("info");
    expect(result.current.crawling).toBe(true);

    // 3초 추가 대기 (POLL_INTERVAL_MS = 2000) — startPolling 재호출 안됨 검증
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(mockGetCrawlStatus).not.toHaveBeenCalled();

    vi.useRealTimers();
  }, 15000);

  it("already_running 응답 시 Complex 쿼리 캐시의 last_crawled_at 이 덮어써지지 않는다", async () => {
    const oldIso = new Date(Date.now() - 5 * 24 * 60 * 60_000).toISOString();
    mockStartLiveCrawl.mockResolvedValue({
      complex_no: "C010",
      status: "already_running",
      current_page: 0,
      article_count: 0,
    });

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } },
    });
    await client.prefetchQuery({
      queryKey: queryKeys.complex("C010"),
      queryFn: async () => ({
        complex_no: "C010",
        complex_name: "테스트",
        last_crawled_at: oldIso,
      }),
    });

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client }, children);

    const { useCrawlAction } = await import("../useCrawlAction");
    const { result: _result } = renderHook(() => useCrawlAction("C010"), { wrapper });

    await act(async () => {
      _result.current.handleCrawl();
    });

    await waitFor(() => {
      expect(mockStartLiveCrawl).toHaveBeenCalledTimes(1);
    });

    // 캐시의 last_crawled_at 은 oldIso 유지 (덮어쓰기 금지)
    const cached = client.getQueryData(queryKeys.complex("C010")) as {
      last_crawled_at: string;
    };
    expect(cached.last_crawled_at).toBe(oldIso);
  }, 15000);

  it("폴링 중 running+phase=articles 이면 progress 객체가 phase/article_count/current_page 반영한다", async () => {
    vi.useFakeTimers();
    mockStartLiveCrawl.mockResolvedValue({
      complex_no: "C012",
      status: "started",
    });
    mockGetCrawlStatus.mockResolvedValue({
      complex_no: "C012",
      status: "running",
      phase: "articles",
      article_count: 42,
      current_page: 3,
    });

    const { useCrawlAction } = await import("../useCrawlAction");
    const { result } = renderHook(() => useCrawlAction("C012"), {
      wrapper: TestQueryProvider,
    });

    await act(async () => {
      result.current.handleCrawl();
    });
    await vi.waitFor(() => expect(mockStartLiveCrawl).toHaveBeenCalledTimes(1));

    // 첫 폴링(2초) 통과 후 progress 객체 갱신
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_100);
    });

    await vi.waitFor(() =>
      expect(result.current.progress?.phase).toBe("articles"),
    );
    expect(result.current.progress?.article_count).toBe(42);
    expect(result.current.progress?.current_page).toBe(3);
    vi.useRealTimers();
  }, 15000);

  it("terminal status 수신 시 progress 가 null 로 리셋된다", async () => {
    vi.useFakeTimers();
    mockStartLiveCrawl.mockResolvedValue({
      complex_no: "C013",
      status: "started",
    });
    // 첫 폴링은 running, 두 번째 폴링은 done
    mockGetCrawlStatus
      .mockResolvedValueOnce({
        complex_no: "C013",
        status: "running",
        phase: "details",
        detail_crawled_count: 10,
        detail_total: 20,
      })
      .mockResolvedValue({
        complex_no: "C013",
        status: "done",
      });

    const { useCrawlAction } = await import("../useCrawlAction");
    const { result } = renderHook(() => useCrawlAction("C013"), {
      wrapper: TestQueryProvider,
    });

    await act(async () => {
      result.current.handleCrawl();
    });
    await vi.waitFor(() => expect(mockStartLiveCrawl).toHaveBeenCalledTimes(1));

    // 첫 폴링 → running 수신, progress 세팅
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_100);
    });
    await vi.waitFor(() =>
      expect(result.current.progress?.phase).toBe("details"),
    );

    // 두 번째 폴링 → done 수신, progress null 리셋
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_100);
    });
    await vi.waitFor(() => expect(result.current.progress).toBeNull());
    expect(result.current.crawling).toBe(false);
    vi.useRealTimers();
  }, 15000);

  it("getCrawlStatus 3회 연속 throw 시 progress=null + '서버 응답 확인 중...' 메시지 전환", async () => {
    vi.useFakeTimers();
    mockStartLiveCrawl.mockResolvedValue({
      complex_no: "C014",
      status: "started",
    });
    // 첫 폴링 성공 (progress 세팅) → 이후 3회 연속 throw
    mockGetCrawlStatus
      .mockResolvedValueOnce({
        complex_no: "C014",
        status: "running",
        phase: "articles",
        article_count: 7,
        current_page: 1,
      })
      .mockRejectedValue(new Error("network down"));

    const { useCrawlAction } = await import("../useCrawlAction");
    const { result } = renderHook(() => useCrawlAction("C014"), {
      wrapper: TestQueryProvider,
    });

    await act(async () => {
      result.current.handleCrawl();
    });
    await vi.waitFor(() => expect(mockStartLiveCrawl).toHaveBeenCalledTimes(1));

    // 첫 폴링(2초) → 성공, progress 세팅됨
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_100);
    });
    await vi.waitFor(() =>
      expect(result.current.progress?.article_count).toBe(7),
    );

    // 이후 3회 폴링 (총 6초) → 전부 throw
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_100);
      await vi.advanceTimersByTimeAsync(2_100);
      await vi.advanceTimersByTimeAsync(2_100);
    });

    await vi.waitFor(() => {
      expect(result.current.progress).toBeNull();
      expect(result.current.message).toContain("서버 응답 확인 중");
    });
    expect(result.current.messageType).toBe("info");
    vi.useRealTimers();
  }, 15000);

  it("details phase 에서도 3번째 폴링(6초)에 articles 를 invalidate 한다", async () => {
    vi.useFakeTimers();
    mockStartLiveCrawl.mockResolvedValue({
      complex_no: "C015",
      status: "started",
    });
    // 모든 폴링이 details phase running 상태
    mockGetCrawlStatus.mockResolvedValue({
      complex_no: "C015",
      status: "running",
      phase: "details",
      detail_crawled_count: 3,
      detail_total: 10,
    });

    // QueryClient 를 직접 만들어 invalidateQueries spy
    const qc = new QueryClient();
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children);

    const { useCrawlAction } = await import("../useCrawlAction");
    const { result } = renderHook(() => useCrawlAction("C015"), { wrapper });

    await act(async () => {
      result.current.handleCrawl();
    });
    await vi.waitFor(() => expect(mockStartLiveCrawl).toHaveBeenCalledTimes(1));

    // 3회 폴링(약 6초) 진행 — attempts % 3 === 0 도달
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_100);
      await vi.advanceTimersByTimeAsync(2_100);
      await vi.advanceTimersByTimeAsync(2_100);
    });

    // details phase 에서도 articlesAll 키로 invalidate 호출됨
    await vi.waitFor(() => {
      const calledWithArticlesAll = invalidateSpy.mock.calls.some(
        ([arg]) => {
          const key = (arg as { queryKey?: unknown[] })?.queryKey;
          return Array.isArray(key) && key[0] === "articles" && key[1] === "C015";
        },
      );
      expect(calledWithArticlesAll).toBe(true);
    });

    vi.useRealTimers();
  }, 15000);
});
