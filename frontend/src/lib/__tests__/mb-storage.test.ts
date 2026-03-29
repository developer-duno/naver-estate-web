import { describe, it, expect, beforeEach } from "vitest";
import {
  getMbFavorites,
  isMbFavorite,
  toggleMbFavorite,
} from "../storage";

/** 미분양 즐겨찾기 localStorage 함수 테스트 */
describe("미분양 즐겨찾기 (mb-storage)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  function makeFav(id = "APT001", name = "테스트단지") {
    return { id, name, region: "서울" };
  }

  /** 초기 상태: 빈 배열 반환 */
  it("초기 상태에서 빈 배열을 반환한다", () => {
    expect(getMbFavorites()).toEqual([]);
  });

  /** 즐겨찾기 추가 */
  it("즐겨찾기를 추가하면 true를 반환하고 목록에 포함된다", () => {
    const added = toggleMbFavorite(makeFav());
    expect(added).toBe(true);
    expect(getMbFavorites()).toHaveLength(1);
    expect(getMbFavorites()[0].id).toBe("APT001");
  });

  /** 즐겨찾기 제거 */
  it("이미 추가된 항목을 토글하면 false를 반환하고 제거된다", () => {
    toggleMbFavorite(makeFav());
    const removed = toggleMbFavorite(makeFav());
    expect(removed).toBe(false);
    expect(getMbFavorites()).toHaveLength(0);
  });

  /** isMbFavorite 확인 */
  it("isMbFavorite로 즐겨찾기 여부를 확인할 수 있다", () => {
    expect(isMbFavorite("APT001")).toBe(false);
    toggleMbFavorite(makeFav());
    expect(isMbFavorite("APT001")).toBe(true);
  });

  /** 여러 항목 추가 */
  it("여러 아파트를 즐겨찾기에 추가할 수 있다", () => {
    toggleMbFavorite(makeFav("A1", "단지1"));
    toggleMbFavorite(makeFav("A2", "단지2"));
    toggleMbFavorite(makeFav("A3", "단지3"));
    expect(getMbFavorites()).toHaveLength(3);
    // 최신 항목이 앞에 위치
    expect(getMbFavorites()[0].id).toBe("A3");
  });

  /** 중복 추가 방지 — 토글로 제거됨 */
  it("같은 항목을 다시 추가하면 제거된다 (토글)", () => {
    toggleMbFavorite(makeFav());
    toggleMbFavorite(makeFav());
    expect(getMbFavorites()).toHaveLength(0);
  });

  /** 최대 200개 제한 */
  it("MAX_MB_FAVORITES(200개) 초과 시 오래된 항목이 잘린다", () => {
    for (let i = 0; i < 210; i++) {
      toggleMbFavorite(makeFav(`APT${i}`, `단지${i}`));
    }
    expect(getMbFavorites()).toHaveLength(200);
    // 가장 최근 추가된 항목이 앞에 위치
    expect(getMbFavorites()[0].id).toBe("APT209");
  });

  /** added_at 타임스탬프 포함 */
  it("추가 시 added_at 타임스탬프가 포함된다", () => {
    toggleMbFavorite(makeFav());
    const fav = getMbFavorites()[0];
    expect(fav.added_at).toBeTypeOf("number");
    expect(fav.added_at).toBeGreaterThan(0);
  });

  /** localStorage 깨진 JSON 방어 */
  it("localStorage에 유효하지 않은 JSON이 있으면 빈 배열을 반환한다", () => {
    localStorage.setItem("mb_favorites", "not-json");
    expect(getMbFavorites()).toEqual([]);
  });
});
