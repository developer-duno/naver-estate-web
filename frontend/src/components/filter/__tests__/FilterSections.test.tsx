/**
 * FilterSections 회귀 가드 — PR 4b ToggleGroup 마이그 후 핵심 동작 검증
 * 실행: npx vitest run src/components/filter/__tests__/FilterSections.test.tsx
 *
 * 검증 범위:
 * - case 1 = FloorSection 의 "저층" 클릭 → setImmediate("floorPreset")("저층")
 * - case 2 = tags ToggleGroup 의 첫 아이템 토글 → dispatch + emitChange 정확
 * - case 3 = tags 활성 1개에서 해제 → dispatch value="" 빈 문자열 set (URL 키 잔존 silent failure 차단)
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FloorSection, DetailSection } from "@/components/filter/FilterSections";
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
