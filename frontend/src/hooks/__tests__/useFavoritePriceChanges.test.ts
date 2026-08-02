/**
 * useFavoritePriceChanges 훅 테스트 — 즐겨찾기 단지 가격 변동 배지(최소버전)
 * 실행: npx vitest run src/hooks/__tests__/useFavoritePriceChanges.test.ts
 *
 * 검증 항목 (B2 게이트 답습 — compare/page.tsx enabled:tokenReady 패턴과 동일 결):
 *  1. 이전 스냅샷과 대표가가 다르면 changedIds 에 포함된다.
 *  2. 이전 스냅샷과 대표가가 같으면 changedIds 에 안 들어간다.
 *  3. tokenReady=false(비승인/비로그인)면 getPriceStats 자체를 호출하지 않는다 — 401 방지.
 *  4. 조회 후 localStorage 스냅샷이 최신 대표가로 갱신된다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { TestQueryProvider } from "@/test-setup";
import { getFavoritePriceSnapshot } from "@/lib/storage";

const mockGetPriceStats = vi.fn();

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    getPriceStats: (...args: unknown[]) => mockGetPriceStats(...args),
  };
});

import { useFavoritePriceChanges } from "../useFavoritePriceChanges";

describe("useFavoritePriceChanges", () => {
  beforeEach(() => {
    mockGetPriceStats.mockReset();
    localStorage.clear();
  });

  it("이전 스냅샷과 대표가가 다르면 changedIds 에 포함된다", async () => {
    localStorage.setItem(
      "favorite_price_snapshot",
      JSON.stringify({ C1: 50000 }),
    );
    mockGetPriceStats.mockResolvedValue({
      complex_no: "C1",
      by_area: [{ label: "84A", maemae: 55000 }],
    });

    const { result } = renderHook(
      () => useFavoritePriceChanges(["C1"], "tok-1", true),
      { wrapper: TestQueryProvider },
    );

    await waitFor(() => expect(result.current.changedIds.has("C1")).toBe(true));
  });

  it("이전 스냅샷과 대표가가 같으면 changedIds 에 안 들어간다", async () => {
    localStorage.setItem(
      "favorite_price_snapshot",
      JSON.stringify({ C1: 50000 }),
    );
    mockGetPriceStats.mockResolvedValue({
      complex_no: "C1",
      by_area: [{ label: "84A", maemae: 50000 }],
    });

    const { result } = renderHook(
      () => useFavoritePriceChanges(["C1"], "tok-1", true),
      { wrapper: TestQueryProvider },
    );

    await waitFor(() => expect(mockGetPriceStats).toHaveBeenCalled());
    expect(result.current.changedIds.has("C1")).toBe(false);
  });

  it("tokenReady=false 면 getPriceStats 를 호출하지 않는다 (비승인/비로그인 401 방지)", async () => {
    const { result } = renderHook(
      () => useFavoritePriceChanges(["C1"], undefined, false),
      { wrapper: TestQueryProvider },
    );

    await new Promise((r) => setTimeout(r, 50));
    expect(mockGetPriceStats).not.toHaveBeenCalled();
    expect(result.current.changedIds.size).toBe(0);
  });

  it("조회 후 localStorage 스냅샷이 최신 대표가로 갱신된다", async () => {
    mockGetPriceStats.mockResolvedValue({
      complex_no: "C1",
      by_area: [{ label: "84A", maemae: 62000 }],
    });

    renderHook(() => useFavoritePriceChanges(["C1"], "tok-1", true), {
      wrapper: TestQueryProvider,
    });

    await waitFor(() => {
      expect(getFavoritePriceSnapshot()).toEqual({ C1: 62000 });
    });
  });
});
