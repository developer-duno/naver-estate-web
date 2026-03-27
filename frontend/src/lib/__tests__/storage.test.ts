/**
 * localStorage 래퍼 테스트 — 검색 히스토리 + 즐겨찾기
 * 실행: npx vitest run src/lib/__tests__/storage.test.ts
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  getSearchHistory, addSearchHistory, removeSearchHistory, clearSearchHistory,
  getFavorites, isFavorite, toggleFavorite,
} from "../storage";

beforeEach(() => {
  localStorage.clear();
});

// ── 검색 히스토리 ──

describe("검색 히스토리", () => {
  /** 키워드 히스토리 추가 + 조회 */
  it("키워드 검색 히스토리를 저장하고 조회한다", () => {
    addSearchHistory({ type: "keyword", keyword: "래미안" });
    const history = getSearchHistory();
    expect(history).toHaveLength(1);
    expect(history[0].keyword).toBe("래미안");
    expect(history[0].type).toBe("keyword");
  });

  /** 지역 검색 히스토리 추가 */
  it("지역 검색 히스토리를 저장한다", () => {
    addSearchHistory({ type: "region", sido: "서울특별시", sigungu: "강남구", dong: "삼성동" });
    const history = getSearchHistory();
    expect(history).toHaveLength(1);
    expect(history[0].sido).toBe("서울특별시");
    expect(history[0].dong).toBe("삼성동");
  });

  /** 중복 키워드 → 최신이 앞으로 */
  it("중복 키워드는 최신 것만 유지한다", () => {
    addSearchHistory({ type: "keyword", keyword: "래미안" });
    addSearchHistory({ type: "keyword", keyword: "힐스테이트" });
    addSearchHistory({ type: "keyword", keyword: "래미안" });
    const history = getSearchHistory();
    expect(history).toHaveLength(2);
    expect(history[0].keyword).toBe("래미안");
    expect(history[1].keyword).toBe("힐스테이트");
  });

  /** 최대 10개 제한 */
  it("최대 10개까지만 유지한다", () => {
    for (let i = 0; i < 15; i++) {
      addSearchHistory({ type: "keyword", keyword: `단지${i}` });
    }
    expect(getSearchHistory()).toHaveLength(10);
  });

  /** 개별 삭제 */
  it("개별 히스토리를 삭제한다", () => {
    addSearchHistory({ type: "keyword", keyword: "A" });
    addSearchHistory({ type: "keyword", keyword: "B" });
    const history = getSearchHistory();
    removeSearchHistory(history[0].timestamp);
    expect(getSearchHistory()).toHaveLength(1);
    expect(getSearchHistory()[0].keyword).toBe("A");
  });

  /** 전체 삭제 */
  it("전체 히스토리를 삭제한다", () => {
    addSearchHistory({ type: "keyword", keyword: "A" });
    addSearchHistory({ type: "keyword", keyword: "B" });
    clearSearchHistory();
    expect(getSearchHistory()).toHaveLength(0);
  });
});

// ── 즐겨찾기 ──

describe("즐겨찾기", () => {
  /** 즐겨찾기 추가 */
  it("단지를 즐겨찾기에 추가한다", () => {
    const added = toggleFavorite({ complex_no: "123", complex_name: "래미안" });
    expect(added).toBe(true);
    expect(getFavorites()).toHaveLength(1);
    expect(isFavorite("123")).toBe(true);
  });

  /** 즐겨찾기 토글 (제거) */
  it("이미 있는 단지를 토글하면 제거된다", () => {
    toggleFavorite({ complex_no: "123", complex_name: "래미안" });
    const removed = toggleFavorite({ complex_no: "123", complex_name: "래미안" });
    expect(removed).toBe(false);
    expect(getFavorites()).toHaveLength(0);
    expect(isFavorite("123")).toBe(false);
  });

  /** 여러 단지 즐겨찾기 */
  it("여러 단지를 즐겨찾기한다", () => {
    toggleFavorite({ complex_no: "1", complex_name: "A" });
    toggleFavorite({ complex_no: "2", complex_name: "B" });
    toggleFavorite({ complex_no: "3", complex_name: "C" });
    expect(getFavorites()).toHaveLength(3);
    expect(isFavorite("2")).toBe(true);
    expect(isFavorite("999")).toBe(false);
  });

  /** 빈 상태에서 조회 */
  it("즐겨찾기가 없으면 빈 배열을 반환한다", () => {
    expect(getFavorites()).toEqual([]);
  });
});
