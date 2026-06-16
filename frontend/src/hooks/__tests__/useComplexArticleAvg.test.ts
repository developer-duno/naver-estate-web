/**
 * useComplexArticleAvg 훅 회귀 가드 (PR 6c §단계 A)
 *
 * 검증 항목:
 *  1. 정상: numeric_price 있는 매물 3건 → avgPrice 평균 + count 반환
 *  2. 전부 null: numeric_price 모두 null → avgPrice null, count 유지
 *  3. 빈 complexNo: enabled false → isLoading false, isError false
 *  4. useQuery error: getArticles reject → isError true, avgPrice null
 *
 * 실행: npx vitest run src/hooks/__tests__/useComplexArticleAvg.test.ts
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";

const mockGetArticles = vi.fn();

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    getArticles: (...args: unknown[]) => mockGetArticles(...args),
  };
});

describe("useComplexArticleAvg — 매물 평균 호가 + 건수", () => {
  beforeEach(() => {
    mockGetArticles.mockReset();
  });

  it("정상: numeric_price 3건 평균 + total 반환", async () => {
    mockGetArticles.mockResolvedValue({
      articles: [
        { article_no: "A1", complex_no: "C001", numeric_price: 50000 },
        { article_no: "A2", complex_no: "C001", numeric_price: 70000 },
        { article_no: "A3", complex_no: "C001", numeric_price: 90000 },
      ],
      total: 3,
      page: 1,
      page_size: 10,
    });

    const { useComplexArticleAvg } = await import("../useComplexArticleAvg");
    const { result } = renderHook(() => useComplexArticleAvg("C001"), {
      wrapper: TestQueryProvider,
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.avgPrice).toBe(70000); // (50000+70000+90000)/3
    expect(result.current.count).toBe(3);
    expect(result.current.isError).toBe(false);
    // B2 게이트: 3번째 인자 accessToken (미전달 시 undefined)
    expect(mockGetArticles).toHaveBeenCalledWith("C001", undefined, undefined);
  });

  it("numeric_price 전부 null → avgPrice null, count 유지", async () => {
    mockGetArticles.mockResolvedValue({
      articles: [
        { article_no: "A1", complex_no: "C001", numeric_price: null },
        { article_no: "A2", complex_no: "C001", numeric_price: null },
      ],
      total: 5,
      page: 1,
      page_size: 10,
    });

    const { useComplexArticleAvg } = await import("../useComplexArticleAvg");
    const { result } = renderHook(() => useComplexArticleAvg("C001"), {
      wrapper: TestQueryProvider,
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.avgPrice).toBeNull();
    expect(result.current.count).toBe(5);
  });

  it("빈 complexNo → enabled false, 호출 0", async () => {
    const { useComplexArticleAvg } = await import("../useComplexArticleAvg");
    const { result } = renderHook(() => useComplexArticleAvg(""), {
      wrapper: TestQueryProvider,
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(false);
    expect(result.current.avgPrice).toBeNull();
    expect(result.current.count).toBe(0);
    expect(mockGetArticles).not.toHaveBeenCalled();
  });

  it("getArticles reject → isError true, avgPrice null (F10 가드)", async () => {
    mockGetArticles.mockRejectedValue(new Error("network error"));

    const { useComplexArticleAvg } = await import("../useComplexArticleAvg");
    const { result } = renderHook(() => useComplexArticleAvg("C001"), {
      wrapper: TestQueryProvider,
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.avgPrice).toBeNull();
    expect(result.current.count).toBe(0);
  });
});
