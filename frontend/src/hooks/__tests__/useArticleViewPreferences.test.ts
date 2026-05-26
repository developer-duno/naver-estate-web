/**
 * useArticleViewPreferences 훅 테스트 — viewMode + pageSize localStorage 2-way sync
 * 실행: npx vitest run src/hooks/__tests__/useArticleViewPreferences.test.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

const getArticleViewModeMock = vi.fn();
const setArticleViewModeMock = vi.fn();
const getArticlePageSizeMock = vi.fn();
const setArticlePageSizeMock = vi.fn();

vi.mock("@/lib/storage", () => ({
  getArticleViewMode: () => getArticleViewModeMock(),
  setArticleViewMode: (m: string) => setArticleViewModeMock(m),
  getArticlePageSize: () => getArticlePageSizeMock(),
  setArticlePageSize: (s: number) => setArticlePageSizeMock(s),
}));

import { useArticleViewPreferences } from "../useArticleViewPreferences";

describe("useArticleViewPreferences", () => {
  beforeEach(() => {
    getArticleViewModeMock.mockReset();
    setArticleViewModeMock.mockReset();
    getArticlePageSizeMock.mockReset();
    setArticlePageSizeMock.mockReset();
    getArticleViewModeMock.mockReturnValue("large");
    getArticlePageSizeMock.mockReturnValue(30);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("초기값은 storage 반환값과 일치", () => {
    const { result } = renderHook(() => useArticleViewPreferences());
    expect(result.current.articleViewMode).toBe("large");
    expect(result.current.pageSize).toBe(30);
  });

  it("handleViewModeChange 호출 시 state + storage 양쪽 갱신", () => {
    const { result } = renderHook(() => useArticleViewPreferences());
    act(() => {
      result.current.handleViewModeChange("compact");
    });
    expect(result.current.articleViewMode).toBe("compact");
    expect(setArticleViewModeMock).toHaveBeenCalledWith("compact");
    expect(setArticleViewModeMock).toHaveBeenCalledTimes(1);
  });

  it("setPageSize 호출 시 state + storage 양쪽 갱신", () => {
    const { result } = renderHook(() => useArticleViewPreferences());
    act(() => {
      result.current.setPageSize(50);
    });
    expect(result.current.pageSize).toBe(50);
    expect(setArticlePageSizeMock).toHaveBeenCalledWith(50);
    expect(setArticlePageSizeMock).toHaveBeenCalledTimes(1);
  });
});
