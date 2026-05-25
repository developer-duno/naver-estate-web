/**
 * FilterSections 회귀 가드 — PR 4b ToggleGroup + PR 4c Select/RadioGroup 마이그 후 핵심 동작 검증
 * 실행: npx vitest run src/components/filter/__tests__/FilterSections.test.tsx
 *
 * 검증 범위:
 * - case 1 = FloorSection 의 "저층" 클릭 → setImmediate("floorPreset")("저층")
 * - case 2 = tags ToggleGroup 의 첫 아이템 토글 → dispatch + emitChange 정확
 * - case 3 = tags 활성 1개에서 해제 → dispatch value="" 빈 문자열 set (URL 키 잔존 silent failure 차단)
 * - case 4 (A) = RoomSection minRooms Select "2+" 선택 → setImmediate("minRooms")("2")
 * - case 5 (B) = DetailSection direction Select "남향" 선택 → setImmediate("direction")("남향")
 * - case 6 (C) = DetailSection estateType Select "아파트"(apt) 선택 → setImmediate("estateType")("apt") (sentinel "all"→"apt" silent 변경 차단)
 * - case 7 (D) = MoveInSection RadioGroup "즉시입주" 클릭 → setImmediate("moveInType")("즉시입주")
 * - case 8 (E) = MoveInSection RadioGroup "전체" 클릭 → setImmediate("moveInType")("전체") (sentinel 보존 가드)
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FloorSection, DetailSection, RoomSection, MoveInSection } from "@/components/filter/FilterSections";
import { DEFAULT_STATE, type FilterState } from "@/components/filter/reducer";
import type { FilterOptions } from "@/types";

function makeState(overrides: Partial<FilterState> = {}): FilterState {
  return { ...DEFAULT_STATE, ...overrides };
}

const noopFilterOptions: FilterOptions = {
  building_names: [],
  directions: [],
  tags: ["역세권", "남향", "복층"],
};

describe("FloorSection — ToggleGroup 마이그 회귀 가드", () => {
  it("case 1 — '저층' 클릭 시 setImmediate('floorPreset')('저층') 호출", async () => {
    const user = userEvent.setup();
    const setImmediate = vi.fn(() => vi.fn());
    render(<FloorSection s={makeState()} setImmediate={setImmediate} />);

    await user.click(screen.getByText("저층(1~5)"));

    expect(setImmediate).toHaveBeenCalledWith("floorPreset");
    const innerFn = setImmediate.mock.results[0].value;
    expect(innerFn).toHaveBeenCalledWith("저층");
  });
});

describe("DetailSection tags — ToggleGroup 멀티 회귀 가드", () => {
  function renderTags(initialState: FilterState) {
    const dispatch = vi.fn();
    const emitChange = vi.fn();
    const setImmediate = vi.fn(() => vi.fn());
    const setDebounced = vi.fn(() => vi.fn());
    const applyPreset = vi.fn();
    render(
      <DetailSection
        s={initialState}
        setImmediate={setImmediate}
        setDebounced={setDebounced}
        applyPreset={applyPreset}
        dispatch={dispatch}
        emitChange={emitChange}
        filterOptions={noopFilterOptions}
      />,
    );
    return { dispatch, emitChange };
  }

  it("case 2 — 첫 태그 토글 시 dispatch + emitChange 가 정확한 값으로 호출", async () => {
    const user = userEvent.setup();
    const { dispatch, emitChange } = renderTags(makeState({ tags: "" }));

    await user.click(screen.getByText("역세권"));

    expect(dispatch).toHaveBeenCalledWith({ type: "SET", key: "tags", value: "역세권" });
    expect(emitChange).toHaveBeenCalledWith({ tags: "역세권" });
  });

  it("case 3 — 활성 1개에서 해제 시 dispatch value 가 빈 문자열 (URL 키 잔존 차단)", async () => {
    const user = userEvent.setup();
    const { dispatch, emitChange } = renderTags(makeState({ tags: "역세권" }));

    await user.click(screen.getByText("역세권"));

    expect(dispatch).toHaveBeenCalledWith({ type: "SET", key: "tags", value: "" });
    expect(emitChange).toHaveBeenCalledWith({ tags: "" });
  });
});

describe("RoomSection — Select 마이그 회귀 가드", () => {
  it("case 4 (A) — minRooms '2+' 선택 시 setImmediate('minRooms')('2') 호출", async () => {
    const user = userEvent.setup();
    const setImmediate = vi.fn(() => vi.fn());
    render(<RoomSection s={makeState()} setImmediate={setImmediate} />);

    await user.click(screen.getByLabelText("최소 방 수"));
    await user.click(screen.getByRole("option", { name: "2+" }));

    expect(setImmediate).toHaveBeenCalledWith("minRooms");
    const innerFn = setImmediate.mock.results[0].value;
    expect(innerFn).toHaveBeenCalledWith("2");
  });
});

describe("DetailSection direction/estateType — Select 마이그 회귀 가드", () => {
  function renderDetail(initialState: FilterState, filterOptions: FilterOptions = noopFilterOptions) {
    // key 별로 내부 호출 추적용 mock 을 분리해 추적 — vi.fn 의 results 타입 추론 문제 회피
    const innerCalls: Record<string, string[]> = {};
    const setImmediate = (key: string) => (v: string) => {
      if (!innerCalls[key]) innerCalls[key] = [];
      innerCalls[key].push(v);
    };
    render(
      <DetailSection
        s={initialState}
        setImmediate={setImmediate as unknown as (key: keyof FilterState) => (v: string) => void}
        setDebounced={vi.fn(() => vi.fn())}
        applyPreset={vi.fn()}
        dispatch={vi.fn()}
        emitChange={vi.fn()}
        filterOptions={filterOptions}
      />,
    );
    return { innerCalls };
  }

  it("case 5 (B) — direction '남향' 선택 시 setImmediate('direction')('남향') 호출", async () => {
    const user = userEvent.setup();
    const { innerCalls } = renderDetail(makeState());

    await user.click(screen.getByLabelText("방향 선택"));
    await user.click(screen.getByRole("option", { name: "남향" }));

    expect(innerCalls.direction).toContain("남향");
  });

  it("case 6 (C) — estateType 'all'→'apt' 변경 시 setImmediate('estateType')('apt') 호출 (sentinel 보존 가드)", async () => {
    const user = userEvent.setup();
    const { innerCalls } = renderDetail(makeState());

    await user.click(screen.getByLabelText("매물유형 선택"));
    await user.click(screen.getByRole("option", { name: "아파트" }));

    expect(innerCalls.estateType).toContain("apt");
  });
});

describe("MoveInSection — RadioGroup 마이그 회귀 가드", () => {
  it("case 7 (D) — '즉시입주' 클릭 시 setImmediate('moveInType')('즉시입주') 호출", async () => {
    const user = userEvent.setup();
    const setImmediate = vi.fn(() => vi.fn());
    render(<MoveInSection s={makeState()} setImmediate={setImmediate} />);

    await user.click(screen.getByText("즉시입주"));

    expect(setImmediate).toHaveBeenCalledWith("moveInType");
    const innerFn = setImmediate.mock.results[0].value;
    expect(innerFn).toHaveBeenCalledWith("즉시입주");
  });

  it("case 8 (E) — '전체' 클릭 시 setImmediate('moveInType')('전체') 호출 (sentinel 보존 가드)", async () => {
    const user = userEvent.setup();
    const setImmediate = vi.fn(() => vi.fn());
    // initial state: moveInType "즉시입주" 로 시작 (DEFAULT_STATE "전체" 이라 변화 감지 위해)
    render(<MoveInSection s={makeState({ moveInType: "즉시입주" })} setImmediate={setImmediate} />);

    await user.click(screen.getByText("전체"));

    expect(setImmediate).toHaveBeenCalledWith("moveInType");
    const innerFn = setImmediate.mock.results[0].value;
    expect(innerFn).toHaveBeenCalledWith("전체");
  });
});
