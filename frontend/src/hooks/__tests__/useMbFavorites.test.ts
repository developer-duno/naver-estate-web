/**
 * useMbFavorites / useMbFavoriteStatus 훅 테스트 — localStorage 기반
 * 실행: npx vitest run src/hooks/__tests__/useMbFavorites.test.ts
 */
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

describe("useMbFavorites 훅", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  /** 초기 상태: 빈 목록 */
  it("초기 상태에서 빈 즐겨찾기 목록을 반환한다", async () => {
    const { useMbFavorites } = await import("../useMbFavorites");
    const { result } = renderHook(() => useMbFavorites());
    expect(result.current.favorites).toEqual([]);
  });

  /** 토글로 추가 */
  it("toggle 호출 시 즐겨찾기에 추가된다", async () => {
    const { useMbFavorites } = await import("../useMbFavorites");
    const { result } = renderHook(() => useMbFavorites());

    act(() => {
      result.current.toggle({ id: "A1", name: "래미안", region: "서울" });
    });

    expect(result.current.favorites).toHaveLength(1);
    expect(result.current.isFavorite("A1")).toBe(true);
  });

  /** 토글로 제거 */
  it("이미 추가된 항목을 다시 toggle하면 제거된다", async () => {
    const { useMbFavorites } = await import("../useMbFavorites");
    const { result } = renderHook(() => useMbFavorites());

    act(() => {
      result.current.toggle({ id: "A1", name: "래미안" });
    });
    act(() => {
      result.current.toggle({ id: "A1", name: "래미안" });
    });

    expect(result.current.favorites).toHaveLength(0);
    expect(result.current.isFavorite("A1")).toBe(false);
  });
});

describe("useMbFavoriteStatus 훅", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  /** 초기 상태: starred false */
  it("초기 상태에서 starred가 false이다", async () => {
    const { useMbFavoriteStatus } = await import("../useMbFavorites");
    const { result } = renderHook(() => useMbFavoriteStatus("A1"));
    expect(result.current.starred).toBe(false);
  });

  /** toggle으로 starred 변경 */
  it("toggle 호출 시 starred가 true로 변경된다", async () => {
    const { useMbFavoriteStatus } = await import("../useMbFavorites");
    const { result } = renderHook(() => useMbFavoriteStatus("A1"));

    act(() => {
      result.current.toggle("래미안", "서울");
    });

    expect(result.current.starred).toBe(true);
  });

  /** 해제 */
  it("starred 상태에서 다시 toggle하면 false로 변경된다", async () => {
    const { useMbFavoriteStatus } = await import("../useMbFavorites");
    const { result } = renderHook(() => useMbFavoriteStatus("A1"));

    act(() => result.current.toggle("래미안"));
    act(() => result.current.toggle("래미안"));

    expect(result.current.starred).toBe(false);
  });
});
