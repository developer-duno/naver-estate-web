/**
 * useFavorites / useFavoriteStatus 훅 테스트 — localStorage 기반
 * 실행: npx vitest run src/hooks/__tests__/useFavorites.test.ts
 */
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

describe("useFavorites 훅", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  /** 초기 상태: 빈 목록 */
  it("초기 상태에서 빈 즐겨찾기 목록을 반환한다", async () => {
    const { useFavorites } = await import("../useFavorites");
    const { result } = renderHook(() => useFavorites());
    expect(result.current.favorites).toEqual([]);
  });

  /** 토글로 추가 */
  it("toggle 호출 시 즐겨찾기에 추가된다", async () => {
    const { useFavorites } = await import("../useFavorites");
    const { result } = renderHook(() => useFavorites());

    act(() => {
      result.current.toggle({ complex_no: "C1", complex_name: "래미안", address: "서울시" });
    });

    expect(result.current.favorites).toHaveLength(1);
    expect(result.current.isFavorite("C1")).toBe(true);
  });

  /** 토글로 제거 */
  it("이미 추가된 항목을 다시 toggle하면 제거된다", async () => {
    const { useFavorites } = await import("../useFavorites");
    const { result } = renderHook(() => useFavorites());

    act(() => {
      result.current.toggle({ complex_no: "C1", complex_name: "래미안" });
    });
    act(() => {
      result.current.toggle({ complex_no: "C1", complex_name: "래미안" });
    });

    expect(result.current.favorites).toHaveLength(0);
    expect(result.current.isFavorite("C1")).toBe(false);
  });
});

describe("useFavoriteStatus 훅", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  /** 초기 상태: starred false */
  it("초기 상태에서 starred가 false이다", async () => {
    const { useFavoriteStatus } = await import("../useFavorites");
    const { result } = renderHook(() => useFavoriteStatus("C1"));
    expect(result.current.starred).toBe(false);
  });

  /** toggle으로 starred 변경 */
  it("toggle 호출 시 starred가 true로 변경된다", async () => {
    const { useFavoriteStatus } = await import("../useFavorites");
    const { result } = renderHook(() => useFavoriteStatus("C1"));

    act(() => {
      result.current.toggle("래미안", "서울시");
    });

    expect(result.current.starred).toBe(true);
  });

  /** 해제 */
  it("starred 상태에서 다시 toggle하면 false로 변경된다", async () => {
    const { useFavoriteStatus } = await import("../useFavorites");
    const { result } = renderHook(() => useFavoriteStatus("C1"));

    act(() => result.current.toggle("래미안"));
    act(() => result.current.toggle("래미안"));

    expect(result.current.starred).toBe(false);
  });
});
