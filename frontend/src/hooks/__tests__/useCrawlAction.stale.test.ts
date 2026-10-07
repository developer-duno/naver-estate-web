/**
 * useCrawlAction — 저장본 나이로 나누기 (세션 447)
 *
 * 기준 = 크롤 시작 순간의 complex.articles_crawled_at(매물 목록을 끝까지 받은 시각, 세션 448).
 *   24시간 이하 = 새 자료 / 초과·없음 = 낡은 자료. last_crawled_at 은 다른 수집기도 찍어 기준이 아니다.
 *  - 새 자료: 끝나도 표 쿼리는 다시 받지 않고, 같은 조건으로 따로 받아 비교 → 바뀌었으면 "새 매물 반영" 대기
 *  - 낡은 자료: 받는 동안 나이 안내(staleLabel), 끝나면 표까지 자동 교체, 실패하면 나이 + "지금은 새로 못 받았어요"
 * 시각은 vi.setSystemTime 으로 고정한다 (실제 흐른 시간에 기대지 않음).
 *
 * 실행: npx vitest run src/hooks/__tests__/useCrawlAction.stale.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import type { Article } from "@/types";
import { useComplexArticleAvg } from "@/hooks/useComplexArticleAvg";

const mockStartLiveCrawl = vi.fn();
const mockGetCrawlStatus = vi.fn();
const mockGetArticles = vi.fn();

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    startLiveCrawl: (...args: unknown[]) => mockStartLiveCrawl(...args),
    getCrawlStatus: (...args: unknown[]) => mockGetCrawlStatus(...args),
    getArticles: (...args: unknown[]) => mockGetArticles(...args),
  };
});

vi.mock("@/lib/supabase", () => ({
  createClient: () => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: "test-token" } },
      }),
    },
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const NOW = new Date("2026-10-08T12:00:00+09:00").getTime();
const HOUR = 60 * 60 * 1000;
const NO = "C900";
const TABLE_KEY = queryKeys.articles(NO, { page: 1, page_size: 10 });

function art(no: string, over: Partial<Article> = {}): Article {
  return { article_no: no, complex_no: NO, deal_or_warrant_prc: "5억", numeric_price: 50000, ...over };
}

const CURRENT = { articles: [art("1"), art("2"), art("3")], total: 3, page: 1, page_size: 10 };

function setup(articlesCrawledAt: string | undefined, fetchTable = vi.fn(), lastCrawledAt?: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(queryKeys.complex(NO), {
    complex_no: NO, complex_name: "단지", articles_crawled_at: articlesCrawledAt, last_crawled_at: lastCrawledAt,
  });
  qc.setQueryData(TABLE_KEY, CURRENT);
  const refetchSpy = vi.spyOn(qc, "refetchQueries");
  const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
  return { qc, refetchSpy, invalidateSpy, wrapper, fetchTable };
}

/** spy 호출 중 표 쿼리까지 닿는 것(articlesAll 접두 + exact 아님, 또는 표 키 자체)이 있나 */
function touchedTable(spy: { mock: { calls: unknown[][] } }, opts: { ignoreNone?: boolean } = {}): boolean {
  return spy.mock.calls.some(([arg]) => {
    const f = arg as { queryKey?: unknown[]; exact?: boolean; refetchType?: string };
    if (opts.ignoreNone && f.refetchType === "none") return false;
    const key = f.queryKey ?? [];
    if (key[0] !== "articles" || key[1] !== NO) return false;
    if (key.length === 2) return true; // articlesAll 접두 = 표까지 포함
    return JSON.stringify(key) === JSON.stringify(TABLE_KEY);
  });
}

async function runCrawl(
  result: { current: { handleCrawl: () => void } },
  ticks: number,
) {
  await act(async () => {
    result.current.handleCrawl();
  });
  await vi.waitFor(() => expect(mockStartLiveCrawl).toHaveBeenCalledTimes(1));
  for (let i = 0; i < ticks; i += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_100);
    });
  }
}

describe("staleLabelFor — 24시간 기준", () => {
  it("24시간 이하 = 새 자료(null), 초과 = 나이 안내, 값 없음 = 오래됐어요", async () => {
    const { staleLabelFor } = await import("../useCrawlAction");
    expect(staleLabelFor(new Date(NOW - 24 * HOUR).toISOString(), NOW)).toBeNull();
    expect(staleLabelFor(new Date(NOW - HOUR).toISOString(), NOW)).toBeNull();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    expect(staleLabelFor(new Date(NOW - 5 * 24 * HOUR).toISOString(), NOW)).toBe("5일 전 자료예요");
    expect(staleLabelFor(new Date(NOW - 30 * HOUR).toISOString(), NOW)).toBe("1일 전 자료예요");
    vi.useRealTimers();
    expect(staleLabelFor(new Date(NOW - 24 * HOUR - 1).toISOString(), NOW)).not.toBeNull();
    expect(staleLabelFor(undefined, NOW)).toBe("저장된 자료가 오래됐어요");
    expect(staleLabelFor(null, NOW)).toBe("저장된 자료가 오래됐어요");
  });
});

describe("useCrawlAction — 저장본 나이로 나누기", () => {
  beforeEach(() => {
    mockStartLiveCrawl.mockReset();
    mockGetCrawlStatus.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("새 자료 + 순서만 다른 목록 → 표 그대로, 버튼 없음, '갱신 완료' (2-3)", async () => {
    const fetchTable = vi.fn().mockResolvedValue({
      ...CURRENT,
      articles: [art("3"), art("1"), art("2")],
    });
    const { qc, refetchSpy, invalidateSpy, wrapper } = setup(new Date(NOW - 2 * HOUR).toISOString());
    mockStartLiveCrawl.mockResolvedValue({ complex_no: NO, status: "started" });
    mockGetCrawlStatus
      .mockResolvedValueOnce({ complex_no: NO, status: "running", phase: "articles", article_count: 3 })
      .mockResolvedValueOnce({ complex_no: NO, status: "running", phase: "articles", article_count: 3 })
      .mockResolvedValueOnce({ complex_no: NO, status: "running", phase: "details", detail_total: 3 })
      .mockResolvedValue({ complex_no: NO, status: "done" });

    const { useCrawlAction } = await import("../useCrawlAction");
    const { result } = renderHook(
      () => useCrawlAction(NO, { table: { queryKey: TABLE_KEY, fetch: fetchTable } }),
      { wrapper },
    );
    await runCrawl(result, 4);

    await vi.waitFor(() => expect(result.current.message).toBe("갱신 완료"));
    expect(result.current.staleLabel).toBeNull();
    expect(result.current.crawling).toBe(false);
    expect(fetchTable).toHaveBeenCalledTimes(1);
    expect(result.current.pendingRefresh).toBeNull();
    // 표 캐시는 그대로(순서도 그대로)
    expect(qc.getQueryData(TABLE_KEY)).toBe(CURRENT);
    // 받는 동안(3번째 폴링)·끝날 때 모두 표 쿼리를 다시 받지 않는다 — 카드 키(exact)만
    expect(touchedTable(refetchSpy)).toBe(false);
    expect(touchedTable(invalidateSpy, { ignoreNone: true })).toBe(false);
    const cardInvalidated = invalidateSpy.mock.calls.some(([arg]) => {
      const f = arg as { queryKey?: unknown[]; exact?: boolean };
      return f.exact === true && JSON.stringify(f.queryKey) === JSON.stringify(queryKeys.articles(NO, undefined));
    });
    expect(cardInvalidated).toBe(true);
    // 카드·배지·평형·시세는 지금처럼 다시 받는다
    const refetched = refetchSpy.mock.calls.map(([arg]) => JSON.stringify((arg as { queryKey: unknown[] }).queryKey));
    expect(refetched).toEqual(expect.arrayContaining([
      JSON.stringify(queryKeys.articles(NO, undefined)),
      JSON.stringify(queryKeys.complex(NO)),
      JSON.stringify(queryKeys.pyeongDetails(NO)),
      JSON.stringify(queryKeys.priceStats(NO)),
    ]));
  }, 15000);

  it("새 자료 + 달라진 목록 → 표 그대로 두고 '새 매물 반영 (N건)' 대기, 누르면 반영 (2-4)", async () => {
    const NEXT = {
      ...CURRENT,
      articles: [art("1", { numeric_price: 49000, deal_or_warrant_prc: "4억 9,000" }), art("3"), art("8")],
      total: 3,
    };
    const fetchTable = vi.fn().mockResolvedValue(NEXT);
    const { qc, wrapper } = setup(new Date(NOW - 3 * HOUR).toISOString());
    mockStartLiveCrawl.mockResolvedValue({ complex_no: NO, status: "started" });
    mockGetCrawlStatus.mockResolvedValue({ complex_no: NO, status: "done" });

    const { useCrawlAction } = await import("../useCrawlAction");
    const { result } = renderHook(
      () => useCrawlAction(NO, { table: { queryKey: TABLE_KEY, fetch: fetchTable } }),
      { wrapper },
    );
    await runCrawl(result, 1);

    // 8 새로 + 2 빠짐 + 1 가격 = 3
    await vi.waitFor(() => expect(result.current.pendingRefresh).toEqual({ count: 3 }));
    expect(qc.getQueryData(TABLE_KEY)).toBe(CURRENT);

    act(() => {
      result.current.applyPendingRefresh();
    });
    expect(qc.getQueryData(TABLE_KEY)).toEqual(NEXT);
    expect(result.current.pendingRefresh).toBeNull();
  }, 15000);

  it("표 조건이 바뀌면 받아 둔 새 목록은 버린다", async () => {
    const fetchTable = vi.fn().mockResolvedValue({ ...CURRENT, articles: [art("9")], total: 1 });
    const { wrapper } = setup(new Date(NOW - HOUR).toISOString());
    mockStartLiveCrawl.mockResolvedValue({ complex_no: NO, status: "started" });
    mockGetCrawlStatus.mockResolvedValue({ complex_no: NO, status: "done" });

    const { useCrawlAction } = await import("../useCrawlAction");
    const { result, rerender } = renderHook(
      ({ key }) => useCrawlAction(NO, { table: { queryKey: key, fetch: fetchTable } }),
      { wrapper, initialProps: { key: TABLE_KEY as readonly unknown[] } },
    );
    await runCrawl(result, 1);
    await vi.waitFor(() => expect(result.current.pendingRefresh).not.toBeNull());

    rerender({ key: queryKeys.articles(NO, { page: 2, page_size: 10 }) });
    expect(result.current.pendingRefresh).toBeNull();
  }, 15000);

  it("낡은 자료(5일 전) — 받는 동안 나이 안내, 끝나면 표까지 자동 교체 (2-5·2-6)", async () => {
    const fetchTable = vi.fn();
    const { refetchSpy, wrapper } = setup(new Date(NOW - 5 * 24 * HOUR).toISOString());
    mockStartLiveCrawl.mockResolvedValue({ complex_no: NO, status: "started" });
    mockGetCrawlStatus
      .mockResolvedValueOnce({ complex_no: NO, status: "running", phase: "articles", article_count: 12 })
      .mockResolvedValue({ complex_no: NO, status: "done" });

    const { useCrawlAction } = await import("../useCrawlAction");
    const { result } = renderHook(
      () => useCrawlAction(NO, { table: { queryKey: TABLE_KEY, fetch: fetchTable } }),
      { wrapper },
    );
    await runCrawl(result, 1);
    expect(result.current.crawling).toBe(true);
    expect(result.current.staleLabel).toBe("5일 전 자료예요");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_100);
    });
    await vi.waitFor(() => expect(result.current.message).toBe("갱신 완료"));
    expect(result.current.staleLabel).toBeNull();
    expect(result.current.pendingRefresh).toBeNull();
    expect(fetchTable).not.toHaveBeenCalled();
    // 표까지 다시 받는다(articlesAll 접두)
    expect(touchedTable(refetchSpy)).toBe(true);
  }, 15000);

  it("낡은 자료 — 서버 status=error 면 '5일 전 자료예요 — 지금은 새로 못 받았어요' (2-7)", async () => {
    const { refetchSpy, wrapper } = setup(new Date(NOW - 5 * 24 * HOUR).toISOString());
    mockStartLiveCrawl.mockResolvedValue({ complex_no: NO, status: "started" });
    mockGetCrawlStatus.mockResolvedValue({ complex_no: NO, status: "error" });

    const { useCrawlAction } = await import("../useCrawlAction");
    const { result } = renderHook(() => useCrawlAction(NO), { wrapper });
    await runCrawl(result, 1);

    await vi.waitFor(() => expect(result.current.message).toBe("5일 전 자료예요 — 지금은 새로 못 받았어요"));
    expect(result.current.messageType).toBe("error");
    expect(result.current.staleLabel).toBeNull();
    expect(result.current.crawling).toBe(false);
    expect(refetchSpy).not.toHaveBeenCalled();
  }, 15000);

  it("낡은 자료 — 시작 요청이 500 이면 같은 문구, 429 는 기존 문구 (2-7)", async () => {
    const { ApiError } = await import("@/lib/api");
    const { useCrawlAction } = await import("../useCrawlAction");

    const first = setup(undefined);
    mockStartLiveCrawl.mockRejectedValue(new ApiError("boom", 500));
    const r1 = renderHook(() => useCrawlAction(NO), { wrapper: first.wrapper });
    await act(async () => {
      r1.result.current.handleCrawl();
    });
    await vi.waitFor(() =>
      expect(r1.result.current.message).toBe("저장된 자료가 오래됐어요 — 지금은 새로 못 받았어요"),
    );

    const second = setup(new Date(NOW - 5 * 24 * HOUR).toISOString());
    mockStartLiveCrawl.mockRejectedValue(new ApiError("limit", 429));
    const r2 = renderHook(() => useCrawlAction(NO), { wrapper: second.wrapper });
    await act(async () => {
      r2.result.current.handleCrawl();
    });
    await vi.waitFor(() => expect(r2.result.current.message).toBe("일일 크롤링 한도를 초과했습니다."));
  }, 15000);

  it("판정은 시작 순간 값으로 고정 — 시작 응답이 캐시를 '방금 전'으로 덮어도 낡은 자료로 끝난다", async () => {
    const fetchTable = vi.fn();
    const { qc, refetchSpy, wrapper } = setup(new Date(NOW - 30 * HOUR).toISOString());
    mockStartLiveCrawl.mockResolvedValue({
      complex_no: NO,
      status: "started",
      last_crawled_at: new Date(NOW - 60_000).toISOString(),
      articles_crawled_at: new Date(NOW - 60_000).toISOString(),
    });
    mockGetCrawlStatus.mockResolvedValue({ complex_no: NO, status: "done" });

    const { useCrawlAction } = await import("../useCrawlAction");
    const { result } = renderHook(
      () => useCrawlAction(NO, { table: { queryKey: TABLE_KEY, fetch: fetchTable } }),
      { wrapper },
    );
    await act(async () => {
      result.current.handleCrawl();
    });
    await vi.waitFor(() => expect(mockStartLiveCrawl).toHaveBeenCalledTimes(1));
    // 캐시는 덮였다 (두 시각 모두 주입)
    await vi.waitFor(() =>
      expect(qc.getQueryData(queryKeys.complex(NO))).toMatchObject({
        last_crawled_at: new Date(NOW - 60_000).toISOString(),
        articles_crawled_at: new Date(NOW - 60_000).toISOString(),
      }),
    );
    expect(result.current.staleLabel).toBe("1일 전 자료예요");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_100);
    });
    await vi.waitFor(() => expect(result.current.message).toBe("갱신 완료"));
    expect(fetchTable).not.toHaveBeenCalled();
    expect(touchedTable(refetchSpy)).toBe(true);
  }, 15000);

  it("판정 칸은 articles_crawled_at — last_crawled_at 이 1시간 전이어도 매물 받은 지 5일이면 낡은 자료 (F-1)", async () => {
    const fetchTable = vi.fn();
    const { refetchSpy, wrapper } = setup(
      new Date(NOW - 5 * 24 * HOUR).toISOString(),
      fetchTable,
      new Date(NOW - HOUR).toISOString(),
    );
    mockStartLiveCrawl.mockResolvedValue({ complex_no: NO, status: "started" });
    mockGetCrawlStatus.mockResolvedValue({ complex_no: NO, status: "done" });

    const { useCrawlAction } = await import("../useCrawlAction");
    const { result } = renderHook(
      () => useCrawlAction(NO, { table: { queryKey: TABLE_KEY, fetch: fetchTable } }),
      { wrapper },
    );
    await act(async () => {
      result.current.handleCrawl();
    });
    expect(result.current.staleLabel).toBe("5일 전 자료예요");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_100);
    });
    await vi.waitFor(() => expect(result.current.message).toBe("갱신 완료"));
    expect(fetchTable).not.toHaveBeenCalled();
    expect(touchedTable(refetchSpy)).toBe(true);
  }, 15000);

  it("cached + 매물 받은 지 2시간 = 새 자료 → 'N시간 전 갱신됨' + 다시 받기 (F-4)", async () => {
    const { qc, refetchSpy, wrapper } = setup(new Date(NOW - 5 * 24 * HOUR).toISOString());
    mockStartLiveCrawl.mockResolvedValue({
      complex_no: NO,
      status: "cached",
      last_crawled_at: new Date(NOW - 10 * 60_000).toISOString(),
      articles_crawled_at: new Date(NOW - 2 * HOUR).toISOString(),
    });

    const { useCrawlAction } = await import("../useCrawlAction");
    const { result } = renderHook(() => useCrawlAction(NO), { wrapper });
    await act(async () => {
      result.current.handleCrawl();
    });

    await vi.waitFor(() => expect(result.current.message).toBe("2시간 전 갱신됨"));
    expect(result.current.messageType).toBe("success");
    expect(result.current.staleLabel).toBeNull();
    expect(result.current.crawling).toBe(false);
    expect(touchedTable(refetchSpy)).toBe(true);
    expect(qc.getQueryData(queryKeys.complex(NO))).toMatchObject({
      articles_crawled_at: new Date(NOW - 2 * HOUR).toISOString(),
    });
  }, 15000);

  it("cached + 매물 받은 지 5일 = 낡은 자료 → 빨강 나이 안내, 표·카드 다시 안 받음, '갱신됨' 없음 (F-4)", async () => {
    const { refetchSpy, invalidateSpy, wrapper } = setup(new Date(NOW - 2 * HOUR).toISOString());
    mockStartLiveCrawl.mockResolvedValue({
      complex_no: NO,
      status: "cached",
      // last_crawled_at 은 방금이어도(다른 수집기) 판정은 articles_crawled_at
      last_crawled_at: new Date(NOW - 60_000).toISOString(),
      articles_crawled_at: new Date(NOW - 5 * 24 * HOUR).toISOString(),
    });

    const { useCrawlAction } = await import("../useCrawlAction");
    const { result } = renderHook(() => useCrawlAction(NO), { wrapper });
    await act(async () => {
      result.current.handleCrawl();
    });

    await vi.waitFor(() => expect(result.current.message).toBe("5일 전 자료예요 — 지금은 새로 못 받았어요"));
    expect(result.current.messageType).toBe("error");
    expect(result.current.staleLabel).toBeNull();
    expect(result.current.crawling).toBe(false);
    expect(refetchSpy).not.toHaveBeenCalled();
    expect(invalidateSpy).not.toHaveBeenCalled();
    // × 로 닫을 때까지 남는다
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(result.current.message).toBe("5일 전 자료예요 — 지금은 새로 못 받았어요");
  }, 15000);

  it("새로 열어 already_running 을 만나면 폴링을 시작해 done 뒤 흐림이 풀리고 '갱신 완료' (F-3)", async () => {
    const { wrapper } = setup(new Date(NOW - 5 * 24 * HOUR).toISOString());
    mockStartLiveCrawl.mockResolvedValue({ complex_no: NO, status: "already_running", current_page: 1, article_count: 5 });
    mockGetCrawlStatus
      .mockResolvedValueOnce({ complex_no: NO, status: "running", phase: "articles", article_count: 8 })
      .mockResolvedValue({ complex_no: NO, status: "done" });

    const { useCrawlAction } = await import("../useCrawlAction");
    const { result } = renderHook(() => useCrawlAction(NO), { wrapper });
    await act(async () => {
      result.current.handleCrawl();
    });
    await vi.waitFor(() => expect(result.current.message).toBe("이미 크롤링이 진행 중입니다."));
    expect(result.current.crawling).toBe(true);
    expect(result.current.staleLabel).toBe("5일 전 자료예요");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_100);
    });
    // 2초에 폴링 1회 — interval 이 겹치지 않는다
    expect(mockGetCrawlStatus).toHaveBeenCalledTimes(1);
    expect(result.current.staleLabel).toBe("5일 전 자료예요");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_100);
    });
    await vi.waitFor(() => expect(result.current.message).toBe("갱신 완료"));
    expect(mockGetCrawlStatus).toHaveBeenCalledTimes(2);
    expect(result.current.staleLabel).toBeNull();
    expect(result.current.crawling).toBe(false);
  }, 15000);

  it("새 자료 — 카드 쿼리(articles(no, undefined))가 폴링 3회째·완료 때 실제로 다시 받아진다 (F-6)", async () => {
    const fetchTable = vi.fn().mockResolvedValue(CURRENT);
    const { wrapper } = setup(new Date(NOW - 2 * HOUR).toISOString());
    mockGetArticles.mockReset();
    mockGetArticles.mockResolvedValue({ articles: [art("1")], total: 1, page: 1, page_size: 20 });
    mockStartLiveCrawl.mockResolvedValue({ complex_no: NO, status: "started" });
    mockGetCrawlStatus
      .mockResolvedValueOnce({ complex_no: NO, status: "running", phase: "articles", article_count: 1 })
      .mockResolvedValueOnce({ complex_no: NO, status: "running", phase: "articles", article_count: 1 })
      .mockResolvedValueOnce({ complex_no: NO, status: "running", phase: "details", detail_total: 1 })
      .mockResolvedValue({ complex_no: NO, status: "done" });

    const { useCrawlAction } = await import("../useCrawlAction");
    // 실제 카드 훅을 같은 QueryClient 에 붙인다 — 활성 쿼리가 있어야 refetch 가 실제로 일어난다
    const { result } = renderHook(
      () => ({
        crawl: useCrawlAction(NO, { table: { queryKey: TABLE_KEY, fetch: fetchTable } }),
        card: useComplexArticleAvg(NO),
      }),
      { wrapper },
    );
    await vi.waitFor(() => expect(mockGetArticles).toHaveBeenCalledTimes(1));
    await act(async () => {
      result.current.crawl.handleCrawl();
    });
    await vi.waitFor(() => expect(mockStartLiveCrawl).toHaveBeenCalledTimes(1));
    for (let i = 0; i < 3; i += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_100);
      });
    }
    // 폴링 3회째 invalidate(exact) → 활성 카드 쿼리 재요청
    await vi.waitFor(() => expect(mockGetArticles).toHaveBeenCalledTimes(2));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_100);
    });
    await vi.waitFor(() => expect(result.current.crawl.message).toBe("갱신 완료"));
    // 완료 때 refetchNonTableQueries 의 카드 키(exact) refetch → 한 번 더
    await vi.waitFor(() => expect(mockGetArticles).toHaveBeenCalledTimes(3));
    for (const [no, filters] of mockGetArticles.mock.calls) {
      expect(no).toBe(NO);
      expect(filters).toBeUndefined();
    }
  }, 15000);
});
