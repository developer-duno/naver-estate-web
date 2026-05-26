/**
 * useComplexPrefetch 훅 테스트 — hover 200ms 후 complex + articles 프리페치
 * 실행: npx vitest run src/hooks/__tests__/useComplexPrefetch.test.ts
 *
 * 검증 항목:
 *  1. 정상: onMouseEnter 후 200ms 경과 → getComplex + getArticles 각 1회 호출
 *  2. 취소: 200ms 전에 onMouseLeave → 프리페치 호출 0회 (빠른 스크롤 방지)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";
import { useComplexPrefetch } from "../useComplexPrefetch";

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

describe("useComplexPrefetch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockGetComplex.mockClear();
    mockGetArticles.mockClear();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** 정상 케이스: hover 200ms 유지 시 두 프리페치 함수가 호출된다 */
  it("onMouseEnter 후 200ms 경과 시 getComplex·getArticles 를 호출한다", () => {
    const { result } = renderHook(() => useComplexPrefetch("12345"), {
      wrapper: TestQueryProvider,
    });

    act(() => {
      result.current.onMouseEnter();
      vi.advanceTimersByTime(200);
    });

    expect(mockGetComplex).toHaveBeenCalledTimes(1);
    expect(mockGetComplex).toHaveBeenCalledWith("12345");
    expect(mockGetArticles).toHaveBeenCalledTimes(1);
    // PR 4e-3: prefetch page_size 는 localStorage 의 article_page_size 답습 (default 10)
    expect(mockGetArticles).toHaveBeenCalledWith("12345", { page: 1, page_size: 10 });
  });

  /** PR 4e-3 회귀 가드: localStorage 에 박힌 사용자 pageSize 로 prefetch */
  it("localStorage 에 article_page_size=30 박혀 있으면 prefetch 도 30 으로 호출", () => {
    localStorage.setItem("article_page_size", JSON.stringify(30));
    const { result } = renderHook(() => useComplexPrefetch("12345"), {
      wrapper: TestQueryProvider,
    });

    act(() => {
      result.current.onMouseEnter();
      vi.advanceTimersByTime(200);
    });

    expect(mockGetArticles).toHaveBeenCalledWith("12345", { page: 1, page_size: 30 });
  });

  /** 취소 케이스: 200ms 전에 떠나면 프리페치하지 않는다 (빠른 스크롤 방지) */
  it("200ms 경과 전 onMouseLeave 하면 프리페치하지 않는다", () => {
    const { result } = renderHook(() => useComplexPrefetch("12345"), {
      wrapper: TestQueryProvider,
    });

    act(() => {
      result.current.onMouseEnter();
      vi.advanceTimersByTime(100);
      result.current.onMouseLeave();
      vi.advanceTimersByTime(200);
    });

    expect(mockGetComplex).not.toHaveBeenCalled();
    expect(mockGetArticles).not.toHaveBeenCalled();
  });
});
