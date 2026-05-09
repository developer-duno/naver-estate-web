/**
 * localStorage 매물 즐겨찾기 테스트
 * 실행: npx vitest run src/lib/__tests__/storage-article.test.ts
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  getFavoriteArticles, isArticleFavorite, toggleFavoriteArticle,
} from "../storage";

beforeEach(() => {
  localStorage.clear();
});

// ── 매물 즐겨찾기 ──

describe("매물 즐겨찾기", () => {
  const baseArticle = {
    article_no: "2440000001",
    complex_no: "100001",
    complex_name: "래미안 강남",
    trade_type_name: "매매",
    price: "15억",
  };

  /** 추가 후 isArticleFavorite true */
  it("매물 즐겨찾기 추가 후 isArticleFavorite 가 true 를 반환한다", () => {
    const added = toggleFavoriteArticle(baseArticle);
    expect(added).toBe(true);
    expect(isArticleFavorite("2440000001")).toBe(true);
    expect(getFavoriteArticles()).toHaveLength(1);
  });

  /** 토글로 제거 */
  it("같은 매물을 다시 토글하면 제거된다", () => {
    toggleFavoriteArticle(baseArticle);
    const removed = toggleFavoriteArticle(baseArticle);
    expect(removed).toBe(false);
    expect(isArticleFavorite("2440000001")).toBe(false);
    expect(getFavoriteArticles()).toHaveLength(0);
  });

  /** 여러 매물 즐겨찾기 */
  it("여러 매물 즐겨찾기를 동시 보관한다", () => {
    toggleFavoriteArticle(baseArticle);
    toggleFavoriteArticle({ ...baseArticle, article_no: "2440000002" });
    toggleFavoriteArticle({ ...baseArticle, article_no: "2440000003" });
    expect(getFavoriteArticles()).toHaveLength(3);
  });

  /** added_at 자동 채움 */
  it("added_at 타임스탬프가 자동으로 채워진다", () => {
    const before = Date.now();
    toggleFavoriteArticle(baseArticle);
    const fav = getFavoriteArticles()[0];
    expect(fav.added_at).toBeGreaterThanOrEqual(before);
    expect(fav.added_at).toBeLessThanOrEqual(Date.now());
  });
});
