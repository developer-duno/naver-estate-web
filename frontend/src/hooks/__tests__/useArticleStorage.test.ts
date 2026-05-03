/**
 * useArticleNote / useArticleFavorites / useArticleFavoriteStatus 훅 테스트
 * 실행: npx vitest run src/hooks/__tests__/useArticleStorage.test.ts
 */
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useArticleNote } from "@/hooks/useArticleNote";
import {
  useArticleFavorites,
  useArticleFavoriteStatus,
} from "@/hooks/useArticleFavorites";

beforeEach(() => {
  localStorage.clear();
});

describe("useArticleNote — 매물 메모 훅", () => {
  it("초기 상태: 저장된 메모 없으면 빈 문자열 + maxLen 500", () => {
    const { result } = renderHook(() => useArticleNote("A1"));
    expect(result.current.note).toBe("");
    expect(result.current.updatedAt).toBeNull();
    expect(result.current.maxLen).toBe(500);
  });

  it("save → note 즉시 갱신 + updatedAt 채움", () => {
    const { result } = renderHook(() => useArticleNote("A1"));
    act(() => result.current.save("손님 김○○ 관심"));
    expect(result.current.note).toBe("손님 김○○ 관심");
    expect(result.current.updatedAt).not.toBeNull();
  });

  it("save 빈 문자열 → 메모 삭제", () => {
    const { result } = renderHook(() => useArticleNote("A1"));
    act(() => result.current.save("초기 메모"));
    act(() => result.current.save(""));
    expect(result.current.note).toBe("");
    expect(result.current.updatedAt).toBeNull();
  });

  it("clear → 메모 삭제 + updatedAt null", () => {
    const { result } = renderHook(() => useArticleNote("A1"));
    act(() => result.current.save("메모"));
    act(() => result.current.clear());
    expect(result.current.note).toBe("");
    expect(result.current.updatedAt).toBeNull();
  });

  it("articleNo 변경 → 해당 매물 메모로 다시 로드", () => {
    const { result, rerender } = renderHook(
      ({ no }) => useArticleNote(no),
      { initialProps: { no: "A1" } },
    );
    act(() => result.current.save("매물 A1 메모"));
    rerender({ no: "A2" });
    expect(result.current.note).toBe("");
    rerender({ no: "A1" });
    expect(result.current.note).toBe("매물 A1 메모");
  });
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
