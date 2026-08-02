/**
 * useSearchViewMode 훅 테스트 — viewMode(list/map) localStorage 2-way sync
 * 실행: npx vitest run src/hooks/__tests__/useSearchViewMode.test.ts
 * useMbViewMode.test.ts 패턴 답습(storage 키만 search_view_mode 로 분리).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

const getSearchViewModeMock = vi.fn();
const setSearchViewModeMock = vi.fn();

vi.mock("@/lib/storage", () => ({
  getSearchViewMode: () => getSearchViewModeMock(),
  setSearchViewMode: (m: string) => setSearchViewModeMock(m),
}));

// MAP_ENABLED 를 테스트마다 바꾸기 위해 가변 참조로 mock
let mapEnabled = true;
vi.mock("@/lib/constants", async () => {
  const actual = await vi.importActual<typeof import("@/lib/constants")>("@/lib/constants");
  return { ...actual, get MAP_ENABLED() { return mapEnabled; } };
});

import { useSearchViewMode } from "../useSearchViewMode";

describe("useSearchViewMode", () => {
  beforeEach(() => {
    getSearchViewModeMock.mockReset();
    setSearchViewModeMock.mockReset();
    getSearchViewModeMock.mockReturnValue("list");
    mapEnabled = true;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("초기값은 storage 반환값과 일치", () => {
    getSearchViewModeMock.mockReturnValue("map");
    const { result } = renderHook(() => useSearchViewMode());
    expect(result.current.viewMode).toBe("map");
  });

  it("setViewMode 호출 시 state + storage 양쪽 갱신", () => {
    const { result } = renderHook(() => useSearchViewMode());
    expect(result.current.viewMode).toBe("list");
    act(() => {
      result.current.setViewMode("map");
    });
    expect(result.current.viewMode).toBe("map");
    expect(setSearchViewModeMock).toHaveBeenCalledWith("map");
    expect(setSearchViewModeMock).toHaveBeenCalledTimes(1);
  });

  /** SDK 미설정 시 저장값이 "map" 이어도 "list" 강제(토글 숨김 + 빈 지도 에러 갇힘 방지) */
  it("MAP_ENABLED=false 면 storage 가 map 이어도 list 를 반환한다", () => {
    mapEnabled = false;
    getSearchViewModeMock.mockReturnValue("map");
    const { result } = renderHook(() => useSearchViewMode());
    expect(result.current.viewMode).toBe("list");
  });
});
