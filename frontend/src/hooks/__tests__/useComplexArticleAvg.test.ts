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
    const { result } = renderHook(() => useComplexArticleAvg("C001", "t", { avgEnabled: true }), {
      wrapper: TestQueryProvider,
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await waitFor(() => expect(result.current.avgPrice).toBe(70000)); // (50000+70000+90000)/3
    expect(result.current.count).toBe(3);
    expect(result.current.isError).toBe(false);
    // 로그인 게이트: 3번째 인자 accessToken — 토큰을 읽은 뒤에만 부른다(세션 481 보완)
    expect(mockGetArticles).toHaveBeenCalledWith("C001", undefined, "t");
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
    const { result } = renderHook(() => useComplexArticleAvg("C001", "t"), {
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
    const { result } = renderHook(() => useComplexArticleAvg("C001", "t"), {
      wrapper: TestQueryProvider,
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.avgPrice).toBeNull();
    expect(result.current.count).toBe(0);
  });
});

// 세션 475 PR 6 — 평균은 매매 매물만 + 대표 면적 묶음만, "매물 N건" 은 전체 요청 그대로
describe("useComplexArticleAvg — 매매·같은 면적 평균 (세션 475)", () => {
  const ALL = {
    articles: [
      { article_no: "A1", complex_no: "C001", trade_type_name: "매매", numeric_price: 17000, area2_m2: 59.98 },
      { article_no: "A2", complex_no: "C001", trade_type_name: "전세", numeric_price: 12000, area2_m2: 59.98 },
    ],
    total: 46, page: 1, page_size: 20,
  };
  const MAEMAE = {
    articles: [
      { article_no: "A1", complex_no: "C001", trade_type_name: "매매", numeric_price: 17000, area2_m2: 59.98 },
      { article_no: "A3", complex_no: "C001", trade_type_name: "매매", numeric_price: 18000, area2_m2: 59.5 },
      { article_no: "A4", complex_no: "C001", trade_type_name: "매매", numeric_price: 30000, area2_m2: 84.97 },
    ],
    total: 3, page: 1, page_size: 20,
  };

  beforeEach(() => {
    mockGetArticles.mockReset();
    mockGetArticles.mockImplementation((_no: string, filters?: { trade_types?: string }) =>
      Promise.resolve(filters?.trade_types === "매매" ? MAEMAE : ALL));
  });

  it("59㎡ 묶음 매매만 평균(17,000·18,000 → 17,500) · 건수는 전체 요청의 46 그대로", async () => {
    const { useComplexArticleAvg } = await import("../useComplexArticleAvg");
    const { result } = renderHook(
      () => useComplexArticleAvg("C001", "tok", { avgEnabled: true, avgAreaM2: 59 }),
      { wrapper: TestQueryProvider },
    );
    await waitFor(() => expect(result.current.avgPrice).toBe(17500));
    expect(result.current.count).toBe(46);
    expect(mockGetArticles).toHaveBeenCalledWith("C001", undefined, "tok");
    // 보완 Q3: 서버가 같은 면적 묶음으로 먼저 거르게 범위를 싣는다(N 이상 N+1 미만)
    expect(mockGetArticles).toHaveBeenCalledWith(
      "C001", { trade_types: "매매", min_area_m2: 59, max_area_m2: 59.999 }, "tok",
    );
  });

  it("면적을 모르면 매매 전체 평균", async () => {
    const { useComplexArticleAvg } = await import("../useComplexArticleAvg");
    const { result } = renderHook(
      () => useComplexArticleAvg("C001", "t", { avgEnabled: true, avgAreaM2: null }),
      { wrapper: TestQueryProvider },
    );
    await waitFor(() => expect(result.current.avgPrice).toBe(21667)); // (17000+18000+30000)/3
    expect(mockGetArticles).toHaveBeenCalledWith("C001", { trade_types: "매매" }, "t");
  });

  it("avgEnabled 가 꺼져 있으면 매매 요청 0 · 건수만", async () => {
    const { useComplexArticleAvg } = await import("../useComplexArticleAvg");
    const { result } = renderHook(
      () => useComplexArticleAvg("C001", "t", { avgEnabled: false, avgAreaM2: 59 }),
      { wrapper: TestQueryProvider },
    );
    await waitFor(() => expect(result.current.count).toBe(46));
    expect(mockGetArticles).toHaveBeenCalledTimes(1);
    expect(mockGetArticles).toHaveBeenCalledWith("C001", undefined, "t");
    expect(result.current.avgPrice).toBeNull();
  });

  // 세션 481 보완: 토큰을 읽는 중엔 매물 조회를 안 보낸다(토큰 없이 401 → 로그인 회원에게 "매물 0건" 이 남던 틈)
  it("토큰 읽는 중(accessToken 없음)엔 호출 0 · isLoading true → 토큰이 오면 1번 호출", async () => {
    mockGetArticles.mockResolvedValue({ articles: [], total: 5, page: 1, page_size: 10 });
    const { useComplexArticleAvg } = await import("../useComplexArticleAvg");
    const { result, rerender } = renderHook(
      ({ token }: { token?: string }) => useComplexArticleAvg("C001", token),
      { wrapper: TestQueryProvider, initialProps: { token: undefined as string | undefined } },
    );
    expect(mockGetArticles).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(true);

    rerender({ token: "t" });
    await waitFor(() => expect(result.current.count).toBe(5));
    expect(mockGetArticles).toHaveBeenCalledTimes(1);
    expect(mockGetArticles).toHaveBeenCalledWith("C001", undefined, "t");
  });

  it("비로그인 확정(enabled=false)이면 호출 0 · isLoading false", async () => {
    const { useComplexArticleAvg } = await import("../useComplexArticleAvg");
    const { result } = renderHook(() => useComplexArticleAvg("C001", undefined, { enabled: false }), {
      wrapper: TestQueryProvider,
    });
    expect(result.current.isLoading).toBe(false);
    expect(mockGetArticles).not.toHaveBeenCalled();
  });
});
