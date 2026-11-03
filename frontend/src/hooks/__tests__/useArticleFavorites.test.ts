/**
 * 로그아웃으로 즐겨찾기 매물이 비워지면 이미 열린 화면(목록·별표)도 비워진다 (세션 496 · B31 검사관 🟡).
 * 실행: npx vitest run src/hooks/__tests__/useArticleFavorites.test.ts
 */
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useArticleFavorites, useArticleFavoriteStatus } from "../useArticleFavorites";
import { clearFavoriteArticles, getFavoriteArticles, toggleFavoriteArticle } from "@/lib/storage";

const ARTICLE = { article_no: "2440000001", complex_no: "100001", complex_name: "래미안 강남", price: "15억" };

beforeEach(() => {
  localStorage.clear();
});

describe("useArticleFavorites — 비우기 알림", () => {
  it("열린 목록이 비우기 뒤 빈 목록이 된다(옛 목록에서 제거를 눌러 다시 저장되는 길 막기)", () => {
    toggleFavoriteArticle(ARTICLE);
    const { result } = renderHook(() => useArticleFavorites());
    expect(result.current.favorites).toHaveLength(1);
    act(() => clearFavoriteArticles());
    expect(result.current.favorites).toEqual([]);
    expect(result.current.isFavorite(ARTICLE.article_no)).toBe(false);
  });
});

describe("useArticleFavoriteStatus — 비우기 알림", () => {
  it("별표가 켜져 있던 매물이 비우기 뒤 꺼진다", () => {
    toggleFavoriteArticle(ARTICLE);
    const { result } = renderHook(() => useArticleFavoriteStatus(ARTICLE.article_no));
    expect(result.current.starred).toBe(true);
    act(() => clearFavoriteArticles());
    expect(result.current.starred).toBe(false);
    expect(getFavoriteArticles()).toEqual([]);
  });
});
