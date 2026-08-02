/**
 * localStorage 래퍼 테스트 — 검색 히스토리 + 즐겨찾기
 * 실행: npx vitest run src/lib/__tests__/storage.test.ts
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  getSearchHistory, addSearchHistory, removeSearchHistory, clearSearchHistory,
  getFavorites, isFavorite, toggleFavorite,
  getArticleViewMode, setArticleViewMode,
  getArticlePageSize, setArticlePageSize,
  getMbViewMode, setMbViewMode,
  getSearchViewMode, setSearchViewMode,
  safeSetItem,
} from "../storage";

beforeEach(() => {
  localStorage.clear();
});

// ── safeSetItem 공통 쓰기 헬퍼 (세션 287) ──

describe("safeSetItem", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** 정상 저장: true 반환 + 값 일치 */
  it("정상 저장 시 true 반환 + localStorage 값 일치", () => {
    const ok = safeSetItem("test_key", "hello", "TestCtx");
    expect(ok).toBe(true);
    expect(localStorage.getItem("test_key")).toBe("hello");
  });

  /** quota 초과(throw) 시: throw 전파 없이 false 반환 — 호출자 crash 방지 */
  it("setItem 이 throw 하면 throw 전파 없이 false 반환", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError", "QuotaExceededError");
    });
    let result: boolean | undefined;
    expect(() => { result = safeSetItem("k", "v", "TestCtx"); }).not.toThrow();
    expect(result).toBe(false);
    expect(warn).toHaveBeenCalled();
  });
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

// ── 매물 카드 보기 모양 ──

describe("매물 카드 보기 모양 (article_view_mode)", () => {
  it("compact/medium/large 셋 다 round-trip", () => {
    setArticleViewMode("compact");
    expect(getArticleViewMode()).toBe("compact");
    setArticleViewMode("medium");
    expect(getArticleViewMode()).toBe("medium");
    setArticleViewMode("large");
    expect(getArticleViewMode()).toBe("large");
  });

  it("localStorage 에 잘못된 값이 박혀 있어도 medium fallback (type guard)", () => {
    localStorage.setItem("article_view_mode", JSON.stringify("xyz"));
    expect(getArticleViewMode()).toBe("medium");
    // 미설정 (raw=null) 도 medium fallback
    localStorage.removeItem("article_view_mode");
    expect(getArticleViewMode()).toBe("medium");
  });
});

// ── 미분양 탭 보기 방식 (mb_view_mode) ──

describe("미분양 탭 보기 방식 (mb_view_mode)", () => {
  it("기본값은 list (키 없을 때)", () => {
    expect(getMbViewMode()).toBe("list");
  });

  it("list/map round-trip", () => {
    setMbViewMode("map");
    expect(getMbViewMode()).toBe("map");
    setMbViewMode("list");
    expect(getMbViewMode()).toBe("list");
  });

  it("localStorage 에 잘못된 값이 박혀 있어도 list fallback (type guard)", () => {
    localStorage.setItem("mb_view_mode", JSON.stringify("satellite"));
    expect(getMbViewMode()).toBe("list");
    localStorage.removeItem("mb_view_mode");
    expect(getMbViewMode()).toBe("list");
  });
});

// ── 매물 검색 결과 보기 방식 (search_view_mode) ──

describe("매물 검색 결과 보기 방식 (search_view_mode)", () => {
  it("기본값은 list (키 없을 때)", () => {
    expect(getSearchViewMode()).toBe("list");
  });

  it("list/map round-trip", () => {
    setSearchViewMode("map");
    expect(getSearchViewMode()).toBe("map");
    setSearchViewMode("list");
    expect(getSearchViewMode()).toBe("list");
  });

  it("localStorage 에 잘못된 값이 박혀 있어도 list fallback (type guard)", () => {
    localStorage.setItem("search_view_mode", JSON.stringify("satellite"));
    expect(getSearchViewMode()).toBe("list");
    localStorage.removeItem("search_view_mode");
    expect(getSearchViewMode()).toBe("list");
  });

  /** mb_view_mode 와 물리적으로 분리된 키인지 회귀 가드 — 한쪽을 설정해도
   * 다른 쪽 값이 바뀌지 않아야 한다(탭 간 의도치 않은 상태 결합 방지). */
  it("mb_view_mode 와 물리적으로 분리되어 서로 영향을 주지 않는다", () => {
    setMbViewMode("map");
    expect(getSearchViewMode()).toBe("list");
    setSearchViewMode("map");
    setMbViewMode("list");
    expect(getSearchViewMode()).toBe("map");
  });
});

// ── 한 페이지당 매물 개수 ──

describe("한 페이지당 매물 개수 (article_page_size)", () => {
  it("기본값은 10 (키 없을 때)", () => {
    expect(getArticlePageSize()).toBe(10);
  });

  it("10/20/30/50 4단계 round-trip", () => {
    setArticlePageSize(10);
    expect(getArticlePageSize()).toBe(10);
    setArticlePageSize(20);
    expect(getArticlePageSize()).toBe(20);
    setArticlePageSize(30);
    expect(getArticlePageSize()).toBe(30);
    setArticlePageSize(50);
    expect(getArticlePageSize()).toBe(50);
  });

  it("화이트리스트 외 값 (99) 박혀 있으면 10 fallback (type guard)", () => {
    localStorage.setItem("article_page_size", JSON.stringify(99));
    expect(getArticlePageSize()).toBe(10);
  });

  it("문자열 값이 박혀 있어도 10 fallback (type guard)", () => {
    localStorage.setItem("article_page_size", JSON.stringify("abc"));
    expect(getArticlePageSize()).toBe(10);
  });

  it("setArticlePageSize 가 localStorage 에 number 로 저장", () => {
    setArticlePageSize(30);
    expect(localStorage.getItem("article_page_size")).toBe("30");
  });
});
