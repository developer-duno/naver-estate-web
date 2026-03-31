/**
 * 미분양 비교 히스토리/북마크 storage 함수 테스트
 * 실행: npx vitest run src/lib/__tests__/storage.compareHistory.test.ts
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getMbCompareHistory,
  addMbCompareHistory,
  removeMbCompareHistory,
  clearMbCompareHistory,
  getMbCompareBookmarks,
  addMbCompareBookmark,
  removeMbCompareBookmark,
  clearMbCompareBookmarks,
} from "../storage";

describe("미분양 비교 히스토리 (storage)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  /** 초기 상태: 빈 배열 */
  it("초기 상태에서 빈 배열을 반환한다", () => {
    expect(getMbCompareHistory()).toEqual([]);
  });

  /** 추가 */
  it("비교 히스토리를 추가할 수 있다", () => {
    addMbCompareHistory({ ids: ["A1", "A2"], names: ["단지1", "단지2"] });
    const history = getMbCompareHistory();
    expect(history).toHaveLength(1);
    expect(history[0].ids).toEqual(["A1", "A2"]);
    expect(history[0].names).toEqual(["단지1", "단지2"]);
    expect(history[0].timestamp).toBeGreaterThan(0);
  });

  /** ids 2개 미만이면 무시 */
  it("ids가 2개 미만이면 추가하지 않는다", () => {
    addMbCompareHistory({ ids: ["A1"], names: ["단지1"] });
    expect(getMbCompareHistory()).toHaveLength(0);
  });

  /** 중복 제거 — ids 순서 무관 */
  it("같은 ids(순서 무관)를 다시 추가하면 중복 제거 후 최신으로 이동한다", () => {
    addMbCompareHistory({ ids: ["A1", "A2"], names: ["단지1", "단지2"] });
    addMbCompareHistory({ ids: ["A3", "A4"], names: ["단지3", "단지4"] });
    addMbCompareHistory({ ids: ["A2", "A1"], names: ["단지2", "단지1"] }); // 역순 중복
    const history = getMbCompareHistory();
    expect(history).toHaveLength(2);
    expect(history[0].ids).toEqual(["A2", "A1"]); // 최신
    expect(history[1].ids).toEqual(["A3", "A4"]);
  });

  /** 최대 10개 제한 */
  it("최대 10개까지만 유지한다", () => {
    for (let i = 0; i < 12; i++) {
      addMbCompareHistory({ ids: [`A${i}`, `B${i}`], names: [`단지A${i}`, `단지B${i}`] });
    }
    expect(getMbCompareHistory()).toHaveLength(10);
  });

  /** remove로 삭제 */
  it("timestamp로 삭제할 수 있다", () => {
    addMbCompareHistory({ ids: ["A1", "A2"], names: ["단지1", "단지2"] });
    addMbCompareHistory({ ids: ["A3", "A4"], names: ["단지3", "단지4"] });
    const ts = getMbCompareHistory()[0].timestamp;
    removeMbCompareHistory(ts);
    expect(getMbCompareHistory()).toHaveLength(1);
  });

  /** clear로 전체 삭제 */
  it("전체 삭제할 수 있다", () => {
    addMbCompareHistory({ ids: ["A1", "A2"], names: ["단지1", "단지2"] });
    clearMbCompareHistory();
    expect(getMbCompareHistory()).toEqual([]);
  });

  /** 깨진 JSON 방어 */
  it("깨진 JSON이 저장되어 있으면 빈 배열을 반환한다", () => {
    localStorage.setItem("mb_compare_history", "{invalid json");
    expect(getMbCompareHistory()).toEqual([]);
  });

  /** quota 에러 방어 */
  it("localStorage quota 에러 시 크래시하지 않는다", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => addMbCompareHistory({ ids: ["A1", "A2"], names: ["단지1", "단지2"] })).not.toThrow();
    spy.mockRestore();
  });
});

describe("미분양 비교 북마크 (storage)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  /** 초기 상태: 빈 배열 */
  it("초기 상태에서 빈 배열을 반환한다", () => {
    expect(getMbCompareBookmarks()).toEqual([]);
  });

  /** 추가 + 자동 라벨 생성 */
  it("label 없이 추가하면 names.join(' vs ')로 자동 생성된다", () => {
    addMbCompareBookmark({ ids: ["A1", "A2"], names: ["단지1", "단지2"] });
    const bookmarks = getMbCompareBookmarks();
    expect(bookmarks).toHaveLength(1);
    expect(bookmarks[0].label).toBe("단지1 vs 단지2");
    expect(bookmarks[0].saved_at).toBeGreaterThan(0);
  });

  /** 사용자 지정 라벨 */
  it("label을 지정하면 해당 라벨이 저장된다", () => {
    addMbCompareBookmark({ ids: ["A1", "A2"], names: ["단지1", "단지2"], label: "내 비교" });
    expect(getMbCompareBookmarks()[0].label).toBe("내 비교");
  });

  /** ids 2개 미만이면 무시 */
  it("ids가 2개 미만이면 추가하지 않는다", () => {
    addMbCompareBookmark({ ids: ["A1"], names: ["단지1"] });
    expect(getMbCompareBookmarks()).toHaveLength(0);
  });

  /** 동일 세트 업데이트 */
  it("같은 ids 세트가 이미 있으면 라벨만 업데이트한다", () => {
    addMbCompareBookmark({ ids: ["A1", "A2"], names: ["단지1", "단지2"], label: "v1" });
    addMbCompareBookmark({ ids: ["A2", "A1"], names: ["단지2", "단지1"], label: "v2" });
    const bookmarks = getMbCompareBookmarks();
    expect(bookmarks).toHaveLength(1);
    expect(bookmarks[0].label).toBe("v2");
  });

  /** 최대 20개 제한 */
  it("최대 20개까지만 유지한다", () => {
    for (let i = 0; i < 22; i++) {
      addMbCompareBookmark({ ids: [`A${i}`, `B${i}`], names: [`단지A${i}`, `단지B${i}`] });
    }
    expect(getMbCompareBookmarks()).toHaveLength(20);
  });

  /** remove */
  it("saved_at으로 삭제할 수 있다", () => {
    addMbCompareBookmark({ ids: ["A1", "A2"], names: ["단지1", "단지2"] });
    addMbCompareBookmark({ ids: ["A3", "A4"], names: ["단지3", "단지4"] });
    const sa = getMbCompareBookmarks()[0].saved_at;
    removeMbCompareBookmark(sa);
    expect(getMbCompareBookmarks()).toHaveLength(1);
  });

  /** clear */
  it("전체 삭제할 수 있다", () => {
    addMbCompareBookmark({ ids: ["A1", "A2"], names: ["단지1", "단지2"] });
    clearMbCompareBookmarks();
    expect(getMbCompareBookmarks()).toEqual([]);
  });

  /** 깨진 JSON 방어 */
  it("깨진 JSON이 저장되어 있으면 빈 배열을 반환한다", () => {
    localStorage.setItem("mb_compare_bookmarks", "{invalid json");
    expect(getMbCompareBookmarks()).toEqual([]);
  });

  /** quota 에러 방어 */
  it("localStorage quota 에러 시 크래시하지 않는다", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => addMbCompareBookmark({ ids: ["A1", "A2"], names: ["단지1", "단지2"] })).not.toThrow();
    spy.mockRestore();
  });
}
);
