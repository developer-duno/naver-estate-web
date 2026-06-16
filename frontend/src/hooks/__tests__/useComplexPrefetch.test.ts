/**
 * useComplexPrefetch 훅 테스트 — hover 200ms 후 complex + articles 프리페치
 * 실행: npx vitest run src/hooks/__tests__/useComplexPrefetch.test.ts
 *
 * 검증 항목 (B2 게이트 답습):
 *  1. 토큰 있음: onMouseEnter 후 200ms → getComplex + getArticles(토큰 동반) 각 1회
 *  2. localStorage pageSize 답습 (PR 4e-3 회귀 가드)
 *  3. 취소: 200ms 전 onMouseLeave → 프리페치 0회
 *  4. 토큰 없음(비로그인): complex 메타만 prefetch, articles 는 스킵 (403 캐시 오염 방지)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";

// API mock — 프리페치가 실제로 호출하는 두 함수
const mockGetComplex = vi.fn().mockResolvedValue({ complex_no: "1" });
const mockGetArticles = vi.fn().mockResolvedValue({ articles: [] });

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    getComplex: (...args: unknown[]) => mockGetComplex(...args),
    getArticles: (...args: unknown[]) => mockGetArticles(...args),
  };
});

// supabase mock — getSession 반환값을 테스트별로 제어 (B2 게이트 토큰 분기)
const getSessionMock = vi.fn();
vi.mock("@/lib/supabase", () => ({
  createClient: () => ({ auth: { getSession: getSessionMock } }),
}));

import { useComplexPrefetch } from "../useComplexPrefetch";

describe("useComplexPrefetch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockGetComplex.mockClear();
    mockGetArticles.mockClear();
    getSessionMock.mockReset();
    // 기본: 로그인 토큰 있음
    getSessionMock.mockResolvedValue({ data: { session: { access_token: "tok-1" } } });
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** 정상 케이스: 토큰 있으면 두 프리페치 함수가 호출되고 articles 는 토큰 동반 */
  it("토큰 있을 때 200ms 경과 시 getComplex·getArticles(토큰 동반)를 호출한다", async () => {
    const { result } = renderHook(() => useComplexPrefetch("12345"), {
      wrapper: TestQueryProvider,
    });

    await act(async () => {
      result.current.onMouseEnter();
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(mockGetComplex).toHaveBeenCalledTimes(1);
    expect(mockGetComplex).toHaveBeenCalledWith("12345");
    expect(mockGetArticles).toHaveBeenCalledTimes(1);
    // PR 4e-3: prefetch page_size 는 localStorage 답습 (default 10) + B2: 토큰 3번째 인자
    expect(mockGetArticles).toHaveBeenCalledWith("12345", { page: 1, page_size: 10 }, "tok-1");
  });

  /** PR 4e-3 회귀 가드: localStorage 에 박힌 사용자 pageSize 로 prefetch */
  it("localStorage 에 article_page_size=30 박혀 있으면 prefetch 도 30 으로 호출", async () => {
    localStorage.setItem("article_page_size", JSON.stringify(30));
    const { result } = renderHook(() => useComplexPrefetch("12345"), {
      wrapper: TestQueryProvider,
    });

    await act(async () => {
      result.current.onMouseEnter();
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(mockGetArticles).toHaveBeenCalledWith("12345", { page: 1, page_size: 30 }, "tok-1");
  });

  /** 취소 케이스: 200ms 전에 떠나면 프리페치하지 않는다 (빠른 스크롤 방지) */
  it("200ms 경과 전 onMouseLeave 하면 프리페치하지 않는다", async () => {
    const { result } = renderHook(() => useComplexPrefetch("12345"), {
      wrapper: TestQueryProvider,
    });

    await act(async () => {
      result.current.onMouseEnter();
      await vi.advanceTimersByTimeAsync(100);
      result.current.onMouseLeave();
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(mockGetComplex).not.toHaveBeenCalled();
    expect(mockGetArticles).not.toHaveBeenCalled();
  });

  /** B2 게이트: 비로그인(토큰 없음) → complex 메타만 prefetch, articles 는 스킵 */
  it("토큰 없으면(비로그인) complex 만 prefetch 하고 articles 는 스킵한다", async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });
    const { result } = renderHook(() => useComplexPrefetch("12345"), {
      wrapper: TestQueryProvider,
    });

    await act(async () => {
      result.current.onMouseEnter();
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(mockGetComplex).toHaveBeenCalledTimes(1);
    expect(mockGetArticles).not.toHaveBeenCalled();
  });
});
