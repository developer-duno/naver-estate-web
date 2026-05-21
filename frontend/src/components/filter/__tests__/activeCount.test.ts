import { describe, it, expect } from "vitest";
import { DEFAULT_STATE, type FilterState } from "../reducer";
import {
  calcDetailActive,
  activeFilterCount,
  activeFilterCountImmediate,
} from "../activeCount";

function makeState(overrides: Partial<FilterState> = {}): FilterState {
  return { ...DEFAULT_STATE, ...overrides };
}

describe("activeCount — calcDetailActive (상세 dropdown 활성 개수)", () => {
  it("DEFAULT_STATE 는 0", () => {
    expect(calcDetailActive(DEFAULT_STATE)).toBe(0);
  });

  it("6개 항목 각각 활성 시 1씩 증가, 모두 활성 시 6", () => {
    expect(calcDetailActive(makeState({ buildingName: "101동" }))).toBe(1);
    expect(calcDetailActive(makeState({ direction: "남향" }))).toBe(1);
    expect(calcDetailActive(makeState({ buildingAge: "10" }))).toBe(1);
    expect(calcDetailActive(makeState({ verifiedOnly: "true" }))).toBe(1);
    expect(calcDetailActive(makeState({ tags: "복층" }))).toBe(1);
    expect(calcDetailActive(makeState({ sortBy: "price_asc" }))).toBe(1);

    expect(
      calcDetailActive(
        makeState({
          buildingName: "101동",
          direction: "남향",
          buildingAge: "10",
          verifiedOnly: "true",
          tags: "복층,테라스",
          sortBy: "price_asc",
        }),
      ),
    ).toBe(6);
  });

  it("tags 빈 문자열·콤마만 있는 케이스는 0", () => {
    expect(calcDetailActive(makeState({ tags: "" }))).toBe(0);
    expect(calcDetailActive(makeState({ tags: ",," }))).toBe(0);
  });

  it("sortBy 가 SORT_OPTIONS 화이트리스트 밖이면 카운트 안 함", () => {
    expect(calcDetailActive(makeState({ sortBy: "rank" }))).toBe(0);
    expect(calcDetailActive(makeState({ sortBy: "invalid_value" }))).toBe(0);
  });
});

describe("activeCount — activeFilterCount (7 dropdown 활성 합산)", () => {
  it("DEFAULT_STATE 는 0", () => {
    expect(activeFilterCount(DEFAULT_STATE)).toBe(0);
  });

  it("거래유형만 변경 → 1", () => {
    expect(activeFilterCount(makeState({ tradeType: "매매" }))).toBe(1);
  });

  it("가격 필드 6종 (minPrice/maxPrice/minRent/maxRent/minPpyeong/maxPpyeong) 은 dropdown 1개로 묶여 1", () => {
    expect(activeFilterCount(makeState({ minPrice: "10000" }))).toBe(1);
    expect(
      activeFilterCount(
        makeState({ minPrice: "10000", maxPrice: "50000", minRent: "30" }),
      ),
    ).toBe(1);
  });

  it("면적 dropdown — minArea/maxArea 둘 다 있어도 1", () => {
    expect(activeFilterCount(makeState({ minArea: "60", maxArea: "100" }))).toBe(
      1,
    );
  });

  it("방/욕실 dropdown — minRooms/minBaths 둘 다 변경해도 1", () => {
    expect(
      activeFilterCount(makeState({ minRooms: "2", minBaths: "1" })),
    ).toBe(1);
  });

  it("층수·입주 dropdown 각각 1씩 증가", () => {
    expect(
      activeFilterCount(makeState({ floorPreset: "저층" })),
    ).toBe(1);
    expect(
      activeFilterCount(makeState({ moveInType: "즉시입주" })),
    ).toBe(1);
  });

  it("상세 dropdown 1 (calcDetailActive 가 6이어도 dropdown 1로 안 묶고 합산 — FilterBar 답습)", () => {
    expect(
      activeFilterCount(
        makeState({
          buildingName: "101동",
          direction: "남향",
          buildingAge: "10",
        }),
      ),
    ).toBe(3);
  });

  it("전체 7 dropdown + 상세 6개 모두 활성 → 6(dropdown) + 6(detail) = 12", () => {
    expect(
      activeFilterCount(
        makeState({
          tradeType: "매매",
          minPrice: "10000",
          minArea: "60",
          floorPreset: "저층",
          moveInType: "즉시입주",
          minRooms: "2",
          buildingName: "101동",
          direction: "남향",
          buildingAge: "10",
          verifiedOnly: "true",
          tags: "복층",
          sortBy: "price_asc",
        }),
      ),
    ).toBe(12);
  });
});

describe("activeCount — activeFilterCountImmediate (디바운스 필드 제외)", () => {
  it("DEFAULT_STATE 는 0", () => {
    expect(activeFilterCountImmediate(DEFAULT_STATE)).toBe(0);
  });

  it("debounced 필드 (가격·면적) 만 입력된 상태는 0 (lag 방지)", () => {
    expect(
      activeFilterCountImmediate(
        makeState({
          minPrice: "10000",
          maxPrice: "50000",
          minRent: "30",
          minPpyeong: "1000",
          minArea: "60",
          maxArea: "100",
        }),
      ),
    ).toBe(0);
  });

  it("immediate 필드는 정상 카운트 (tradeType + 방/욕실 + 상세 3종 = 5)", () => {
    expect(
      activeFilterCountImmediate(
        makeState({
          tradeType: "매매",
          minRooms: "2",
          buildingName: "101동",
          direction: "남향",
          buildingAge: "10",
        }),
      ),
    ).toBe(5);
  });

  it("immediate + debounced 혼합 — debounced 는 무시, immediate 만 카운트", () => {
    expect(
      activeFilterCountImmediate(
        makeState({
          tradeType: "매매",
          minPrice: "10000",
          minArea: "60",
          floorPreset: "저층",
        }),
      ),
    ).toBe(2);
    expect(
      activeFilterCount(
        makeState({
          tradeType: "매매",
          minPrice: "10000",
          minArea: "60",
          floorPreset: "저층",
        }),
      ),
    ).toBe(4);
  });
});
