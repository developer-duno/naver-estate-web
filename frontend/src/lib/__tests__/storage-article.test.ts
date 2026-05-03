/**
 * localStorage 매물 메모/즐겨찾기 테스트
 * 실행: npx vitest run src/lib/__tests__/storage-article.test.ts
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  getArticleNote, setArticleNote, clearArticleNote, getArticleNotes,
  ARTICLE_NOTE_MAX_LEN, ARTICLE_NOTES_MAX_COUNT,
  getFavoriteArticles, isArticleFavorite, toggleFavoriteArticle,
} from "../storage";

beforeEach(() => {
  localStorage.clear();
});

// ── 매물 메모 ──

describe("매물 메모", () => {
  /** 기본 저장 + 조회 */
  it("매물 메모를 저장하고 조회한다", () => {
    setArticleNote("2440000001", "손님 김○○ 관심");
    expect(getArticleNote("2440000001")).toBe("손님 김○○ 관심");
  });

  /** trim 후 빈 값 → 자동 삭제 */
  it("빈 값(공백만) 저장 시 자동 삭제된다", () => {
    setArticleNote("A1", "메모");
    setArticleNote("A1", "   ");
    expect(getArticleNote("A1")).toBe("");
    expect(Object.keys(getArticleNotes())).not.toContain("A1");
  });

  /** 500자 초과 → 잘림 */
  it("500자 초과 메모는 잘려서 저장된다", () => {
    const long = "가".repeat(600);
    setArticleNote("A1", long);
    expect(getArticleNote("A1")).toHaveLength(ARTICLE_NOTE_MAX_LEN);
  });

  /** 1000개 초과 시 가장 오래된 메모 정리 */
  it("최대 개수 초과 시 가장 오래된 메모가 정리된다", () => {
    // 직접 1001개를 저장하면 setArticleNote 하나당 timestamp가 같을 수 있어 timestamp를 직접 조작
    const map: Record<string, { text: string; updated_at: number }> = {};
    for (let i = 0; i < ARTICLE_NOTES_MAX_COUNT; i++) {
      map[`A${i}`] = { text: `메모${i}`, updated_at: i };
    }
    localStorage.setItem("article_notes", JSON.stringify(map));
    setArticleNote("A_NEW", "신규");
    const after = getArticleNotes();
    expect(Object.keys(after).length).toBe(ARTICLE_NOTES_MAX_COUNT);
    // 가장 오래된 A0 가 사라져야 함
    expect(after["A0"]).toBeUndefined();
    expect(after["A_NEW"]).toBeDefined();
  });

  /** clearArticleNote 개별 삭제 */
  it("개별 매물 메모를 삭제한다", () => {
    setArticleNote("A1", "메모1");
    setArticleNote("A2", "메모2");
    clearArticleNote("A1");
    expect(getArticleNote("A1")).toBe("");
    expect(getArticleNote("A2")).toBe("메모2");
  });
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
