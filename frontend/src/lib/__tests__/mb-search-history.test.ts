import { describe, it, expect, beforeEach } from "vitest";
import {
  getMbSearchHistory,
  addMbSearchHistory,
  removeMbSearchHistory,
  clearMbSearchHistory,
} from "../storage";

/** 미분양 검색 히스토리 localStorage 함수 테스트 */
describe("미분양 검색 히스토리 (mb-search-history)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  function makeSearch(region = "서울", gu?: string, keyword?: string) {
    return { region, gu, keyword };
  }

  /** 초기 상태: 빈 배열 반환 */
  it("초기 상태에서 빈 배열을 반환한다", () => {
    expect(getMbSearchHistory()).toEqual([]);
  });

  /** 검색 추가 */
  it("검색을 추가하면 목록에 포함된다", () => {
    addMbSearchHistory(makeSearch("서울", "강남구"));
    const history = getMbSearchHistory();
    expect(history).toHaveLength(1);
    expect(history[0].region).toBe("서울");
    expect(history[0].gu).toBe("강남구");
  });

  /** timestamp 포함 */
  it("추가 시 timestamp가 포함된다", () => {
    addMbSearchHistory(makeSearch());
    expect(getMbSearchHistory()[0].timestamp).toBeTypeOf("number");
    expect(getMbSearchHistory()[0].timestamp).toBeGreaterThan(0);
  });

  /** 최신 항목이 앞에 위치 */
  it("최신 검색이 목록 앞에 위치한다", () => {
    addMbSearchHistory(makeSearch("서울"));
    addMbSearchHistory(makeSearch("경기"));
    const history = getMbSearchHistory();
    expect(history[0].region).toBe("경기");
    expect(history[1].region).toBe("서울");
  });

  /** 중복 제거 — 같은 region+gu+keyword */
  it("같은 지역+구+키워드를 다시 검색하면 중복이 제거되고 최신으로 이동한다", () => {
    addMbSearchHistory(makeSearch("서울", "강남구"));
    addMbSearchHistory(makeSearch("경기", "수원시"));
    addMbSearchHistory(makeSearch("서울", "강남구")); // 중복
    const history = getMbSearchHistory();
    expect(history).toHaveLength(2);
    expect(history[0].region).toBe("서울");
    expect(history[0].gu).toBe("강남구");
  });

  /** gu/keyword undefined vs 빈문자열 — 동일하게 처리 */
  it("gu가 undefined와 빈문자열은 같은 검색으로 중복 제거된다", () => {
    addMbSearchHistory(makeSearch("서울", undefined));
    addMbSearchHistory(makeSearch("서울", ""));
    expect(getMbSearchHistory()).toHaveLength(1);
  });

  /** keyword가 있는 경우와 없는 경우 구분 */
  it("keyword가 다르면 별도 항목으로 저장된다", () => {
    addMbSearchHistory(makeSearch("서울", "강남구"));
    addMbSearchHistory(makeSearch("서울", "강남구", "래미안"));
    expect(getMbSearchHistory()).toHaveLength(2);
  });

  /** 최대 10개 제한 */
  it("MAX_MB_HISTORY(10개) 초과 시 오래된 항목이 잘린다", () => {
    for (let i = 0; i < 12; i++) {
      addMbSearchHistory(makeSearch(`지역${i}`));
    }
    const history = getMbSearchHistory();
    expect(history).toHaveLength(10);
    expect(history[0].region).toBe("지역11");
  });

  /** 빈 region은 무시 */
  it("빈 region은 저장하지 않는다", () => {
    addMbSearchHistory(makeSearch(""));
    addMbSearchHistory(makeSearch("  "));
    expect(getMbSearchHistory()).toHaveLength(0);
  });

  /** keyword trim 처리 */
  it("keyword 앞뒤 공백을 제거한다", () => {
    addMbSearchHistory(makeSearch("서울", "강남구", "  래미안  "));
    expect(getMbSearchHistory()[0].keyword).toBe("래미안");
  });

  /** 개별 삭제 */
  it("timestamp로 개별 항목을 삭제할 수 있다", () => {
    addMbSearchHistory(makeSearch("서울"));
    addMbSearchHistory(makeSearch("경기"));
    const ts = getMbSearchHistory()[0].timestamp;
    removeMbSearchHistory(ts);
    expect(getMbSearchHistory()).toHaveLength(1);
    expect(getMbSearchHistory()[0].region).toBe("서울");
  });

  /** 전체 삭제 */
  it("전체 삭제하면 빈 배열이 된다", () => {
    addMbSearchHistory(makeSearch("서울"));
    addMbSearchHistory(makeSearch("경기"));
    clearMbSearchHistory();
    expect(getMbSearchHistory()).toEqual([]);
  });

  /** localStorage 깨진 JSON 방어 */
  it("localStorage에 유효하지 않은 JSON이 있으면 빈 배열을 반환한다", () => {
    localStorage.setItem("mb_search_history", "not-json");
    expect(getMbSearchHistory()).toEqual([]);
  });
});
