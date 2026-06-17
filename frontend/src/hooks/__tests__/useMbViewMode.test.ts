/**
 * useMbViewMode 훅 테스트 — viewMode(list/map) localStorage 2-way sync
 * 실행: npx vitest run src/hooks/__tests__/useMbViewMode.test.ts
 * useArticleViewPreferences.test 패턴 답습.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

const getMbViewModeMock = vi.fn();
const setMbViewModeMock = vi.fn();

vi.mock("@/lib/storage", () => ({
  getMbViewMode: () => getMbViewModeMock(),
  setMbViewMode: (m: string) => setMbViewModeMock(m),
}));

import { useMbViewMode } from "../useMbViewMode";

describe("useMbViewMode", () => {
  beforeEach(() => {
    getMbViewModeMock.mockReset();
    setMbViewModeMock.mockReset();
    getMbViewModeMock.mockReturnValue("list");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("초기값은 storage 반환값과 일치", () => {
    getMbViewModeMock.mockReturnValue("map");
    const { result } = renderHook(() => useMbViewMode());
    expect(result.current.viewMode).toBe("map");
  });

  it("setViewMode 호출 시 state + storage 양쪽 갱신", () => {
    const { result } = renderHook(() => useMbViewMode());
    expect(result.current.viewMode).toBe("list");
    act(() => {
      result.current.setViewMode("map");
    });
    expect(result.current.viewMode).toBe("map");
    expect(setMbViewModeMock).toHaveBeenCalledWith("map");
    expect(setMbViewModeMock).toHaveBeenCalledTimes(1);
  });
});
