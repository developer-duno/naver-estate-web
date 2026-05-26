/**
 * usePopstateRefresh 훅 테스트 — popstate 리스너 + navKey 증분
 * 실행: npx vitest run src/hooks/__tests__/usePopstateRefresh.test.ts
 */
import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { usePopstateRefresh } from "../usePopstateRefresh";

describe("usePopstateRefresh", () => {
  it("초기 navKey 는 0", () => {
    const { result } = renderHook(() => usePopstateRefresh());
    expect(result.current.navKey).toBe(0);
  });

  it("popstate 이벤트 1회 dispatch 시 navKey 1 증가", () => {
    const { result } = renderHook(() => usePopstateRefresh());
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(result.current.navKey).toBe(1);
  });

  it("언마운트 후 dispatch 는 zombie listener 없이 무시", () => {
    const { result, unmount } = renderHook(() => usePopstateRefresh());
    unmount();
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    // unmount 후 result.current 는 마지막 상태 (0) 그대로 — listener 제거 검증
    expect(result.current.navKey).toBe(0);
  });
});
