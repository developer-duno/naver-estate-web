/**
 * useMbCompareHistory 훅 테스트 — localStorage 기반
 * 실행: npx vitest run src/hooks/__tests__/useMbCompareHistory.test.ts
 */
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

describe("useMbCompareHistory 훅", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  /** 초기 상태: 빈 목록 */
  it("초기 상태에서 빈 히스토리를 반환한다", async () => {
    const { useMbCompareHistory } = await import("../useMbCompareHistory");
    const { result } = renderHook(() => useMbCompareHistory());
    expect(result.current.history).toEqual([]);
  });

  /** add로 추가 */
  it("add 호출 시 히스토리에 추가되고 상태에 반영된다", async () => {
    const { useMbCompareHistory } = await import("../useMbCompareHistory");
    const { result } = renderHook(() => useMbCompareHistory());

    act(() => {
      result.current.add({ ids: ["A1", "A2"], names: ["단지1", "단지2"] });
    });

    expect(result.current.history).toHaveLength(1);
    expect(result.current.history[0].ids).toEqual(["A1", "A2"]);
  });

  /** remove로 삭제 */
  it("remove 호출 시 해당 항목이 제거된다", async () => {
    const { useMbCompareHistory } = await import("../useMbCompareHistory");
    const { result } = renderHook(() => useMbCompareHistory());

    act(() => {
      result.current.add({ ids: ["A1", "A2"], names: ["단지1", "단지2"] });
      result.current.add({ ids: ["A3", "A4"], names: ["단지3", "단지4"] });
    });

    const ts = result.current.history[0].timestamp;
    act(() => {
      result.current.remove(ts);
    });

    expect(result.current.history).toHaveLength(1);
  });

  /** clear로 전체 삭제 */
  it("clear 호출 시 빈 배열이 된다", async () => {
    const { useMbCompareHistory } = await import("../useMbCompareHistory");
    const { result } = renderHook(() => useMbCompareHistory());

    act(() => {
      result.current.add({ ids: ["A1", "A2"], names: ["단지1", "단지2"] });
    });

    act(() => {
      result.current.clear();
    });

    expect(result.current.history).toEqual([]);
  });

  /** 중복 추가 시 최신으로 이동 */
  it("같은 ids를 다시 추가하면 중복 제거 후 최신 위치로 이동한다", async () => {
    const { useMbCompareHistory } = await import("../useMbCompareHistory");
    const { result } = renderHook(() => useMbCompareHistory());

    act(() => {
      result.current.add({ ids: ["A1", "A2"], names: ["단지1", "단지2"] });
      result.current.add({ ids: ["A3", "A4"], names: ["단지3", "단지4"] });
      result.current.add({ ids: ["A2", "A1"], names: ["단지2", "단지1"] }); // 역순 중복
    });

    expect(result.current.history).toHaveLength(2);
    expect(result.current.history[0].ids).toEqual(["A2", "A1"]);
  });
});
