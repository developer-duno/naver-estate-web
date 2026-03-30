/**
 * useMbSearchHistory 훅 테스트 — localStorage 기반
 * 실행: npx vitest run src/hooks/__tests__/useMbSearchHistory.test.ts
 */
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

describe("useMbSearchHistory 훅", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  /** 초기 상태: 빈 목록 */
  it("초기 상태에서 빈 히스토리를 반환한다", async () => {
    const { useMbSearchHistory } = await import("../useMbSearchHistory");
    const { result } = renderHook(() => useMbSearchHistory());
    expect(result.current.history).toEqual([]);
  });

  /** add로 추가 */
  it("add 호출 시 히스토리에 추가되고 상태에 반영된다", async () => {
    const { useMbSearchHistory } = await import("../useMbSearchHistory");
    const { result } = renderHook(() => useMbSearchHistory());

    act(() => {
      result.current.add({ region: "서울", gu: "강남구" });
    });

    expect(result.current.history).toHaveLength(1);
    expect(result.current.history[0].region).toBe("서울");
    expect(result.current.history[0].gu).toBe("강남구");
  });

  /** remove로 삭제 */
  it("remove 호출 시 해당 항목이 제거되고 상태에 반영된다", async () => {
    const { useMbSearchHistory } = await import("../useMbSearchHistory");
    const { result } = renderHook(() => useMbSearchHistory());

    act(() => {
      result.current.add({ region: "서울" });
      result.current.add({ region: "경기" });
    });

    const ts = result.current.history[0].timestamp;
    act(() => {
      result.current.remove(ts);
    });

    expect(result.current.history).toHaveLength(1);
    expect(result.current.history[0].region).toBe("서울");
  });

  /** clear로 전체 삭제 */
  it("clear 호출 시 빈 배열이 된다", async () => {
    const { useMbSearchHistory } = await import("../useMbSearchHistory");
    const { result } = renderHook(() => useMbSearchHistory());

    act(() => {
      result.current.add({ region: "서울" });
      result.current.add({ region: "경기" });
    });

    act(() => {
      result.current.clear();
    });

    expect(result.current.history).toEqual([]);
  });

  /** 중복 추가 시 최신으로 이동 */
  it("같은 검색을 다시 추가하면 중복 제거 후 최신 위치로 이동한다", async () => {
    const { useMbSearchHistory } = await import("../useMbSearchHistory");
    const { result } = renderHook(() => useMbSearchHistory());

    act(() => {
      result.current.add({ region: "서울", gu: "강남구" });
      result.current.add({ region: "경기" });
      result.current.add({ region: "서울", gu: "강남구" }); // 중복
    });

    expect(result.current.history).toHaveLength(2);
    expect(result.current.history[0].region).toBe("서울");
  });
});
