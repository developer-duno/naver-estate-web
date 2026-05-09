/**
 * useArticleFavorites / useArticleFavoriteStatus 훅 테스트
 * 실행: npx vitest run src/hooks/__tests__/useArticleStorage.test.ts
 */
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useArticleFavorites,
  useArticleFavoriteStatus,
} from "@/hooks/useArticleFavorites";

beforeEach(() => {
  localStorage.clear();
});

describe("useArticleFavorites 훅", () => {
  it("초기 상태에서 빈 즐겨찾기 목록을 반환한다", () => {
    const { result } = renderHook(() => useArticleFavorites());
    expect(result.current.favorites).toEqual([]);
  });

  it("toggle 호출 시 즐겨찾기에 추가된다", () => {
    const { result } = renderHook(() => useArticleFavorites());
    act(() => {
      result.current.toggle({
        article_no: "A1",
        complex_no: "C1",
        complex_name: "래미안",
      });
    });
    expect(result.current.favorites).toHaveLength(1);
    expect(result.current.isFavorite("A1")).toBe(true);
  });

  it("이미 추가된 매물을 다시 toggle하면 제거된다", () => {
    const { result } = renderHook(() => useArticleFavorites());
    const article = { article_no: "A1", complex_no: "C1", complex_name: "래미안" };
    act(() => result.current.toggle(article));
    act(() => result.current.toggle(article));
    expect(result.current.favorites).toHaveLength(0);
  });
});

describe("useArticleFavoriteStatus 훅", () => {
  it("초기 상태에서 starred 가 false 이다", () => {
    const { result } = renderHook(() => useArticleFavoriteStatus("A1"));
    expect(result.current.starred).toBe(false);
  });

  it("toggle 호출 시 starred 가 true 로 변경된다", () => {
    const { result } = renderHook(() => useArticleFavoriteStatus("A1"));
    act(() => {
      result.current.toggle({ complex_no: "C1", complex_name: "래미안", price: "15억" });
    });
    expect(result.current.starred).toBe(true);
  });

  it("starred 상태에서 다시 toggle 하면 false 로 변경된다", () => {
    const { result } = renderHook(() => useArticleFavoriteStatus("A1"));
    act(() => result.current.toggle({ complex_no: "C1" }));
    act(() => result.current.toggle({ complex_no: "C1" }));
    expect(result.current.starred).toBe(false);
  });
});
