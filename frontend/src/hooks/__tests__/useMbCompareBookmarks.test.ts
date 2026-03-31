/**
 * useMbCompareBookmarks 훅 테스트 — localStorage 기반
 * 실행: npx vitest run src/hooks/__tests__/useMbCompareBookmarks.test.ts
 */
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

describe("useMbCompareBookmarks 훅", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  /** 초기 상태: 빈 목록 */
  it("초기 상태에서 빈 북마크를 반환한다", async () => {
    const { useMbCompareBookmarks } = await import("../useMbCompareBookmarks");
    const { result } = renderHook(() => useMbCompareBookmarks());
    expect(result.current.bookmarks).toEqual([]);
  });

  /** add로 추가 */
  it("add 호출 시 북마크에 추가되고 상태에 반영된다", async () => {
    const { useMbCompareBookmarks } = await import("../useMbCompareBookmarks");
    const { result } = renderHook(() => useMbCompareBookmarks());

    act(() => {
      result.current.add({ ids: ["A1", "A2"], names: ["단지1", "단지2"], label: "내 비교" });
    });

    expect(result.current.bookmarks).toHaveLength(1);
    expect(result.current.bookmarks[0].label).toBe("내 비교");
  });

  /** label 자동 생성 */
  it("label 없이 추가하면 자동 생성된다", async () => {
    const { useMbCompareBookmarks } = await import("../useMbCompareBookmarks");
    const { result } = renderHook(() => useMbCompareBookmarks());

    act(() => {
      result.current.add({ ids: ["A1", "A2"], names: ["단지1", "단지2"] });
    });

    expect(result.current.bookmarks[0].label).toBe("단지1 vs 단지2");
  });

  /** isBookmarked — ids 순서 무관 */
  it("isBookmarked로 북마크 여부를 확인할 수 있다 (순서 무관)", async () => {
    const { useMbCompareBookmarks } = await import("../useMbCompareBookmarks");
    const { result } = renderHook(() => useMbCompareBookmarks());

    act(() => {
      result.current.add({ ids: ["A1", "A2"], names: ["단지1", "단지2"] });
    });

    expect(result.current.isBookmarked(["A1", "A2"])).toBe(true);
    expect(result.current.isBookmarked(["A2", "A1"])).toBe(true); // 역순
    expect(result.current.isBookmarked(["A1", "A3"])).toBe(false);
  });

  /** remove로 삭제 */
  it("remove 호출 시 해당 북마크가 제거된다", async () => {
    const { useMbCompareBookmarks } = await import("../useMbCompareBookmarks");
    const { result } = renderHook(() => useMbCompareBookmarks());

    act(() => {
      result.current.add({ ids: ["A1", "A2"], names: ["단지1", "단지2"] });
      result.current.add({ ids: ["A3", "A4"], names: ["단지3", "단지4"] });
    });

    const sa = result.current.bookmarks[0].saved_at;
    act(() => {
      result.current.remove(sa);
    });

    expect(result.current.bookmarks).toHaveLength(1);
  });

  /** clear로 전체 삭제 */
  it("clear 호출 시 빈 배열이 된다", async () => {
    const { useMbCompareBookmarks } = await import("../useMbCompareBookmarks");
    const { result } = renderHook(() => useMbCompareBookmarks());

    act(() => {
      result.current.add({ ids: ["A1", "A2"], names: ["단지1", "단지2"] });
    });

    act(() => {
      result.current.clear();
    });

    expect(result.current.bookmarks).toEqual([]);
  });
});
