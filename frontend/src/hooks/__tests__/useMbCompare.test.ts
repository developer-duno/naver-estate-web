/**
 * useMbCompare 훅 테스트 — localStorage 기반 비교 목록
 * 실행: npx vitest run src/hooks/__tests__/useMbCompare.test.ts
 */
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

describe("useMbCompare 훅", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  /** 초기 상태: 빈 목록 */
  it("초기 상태에서 빈 비교 목록을 반환한다", async () => {
    const { useMbCompare } = await import("../useMbCompare");
    const { result } = renderHook(() => useMbCompare());
    expect(result.current.list).toEqual([]);
    expect(result.current.isFull).toBe(false);
  });

  /** add로 항목 추가 */
  it("add로 비교 목록에 추가할 수 있다", async () => {
    const { useMbCompare } = await import("../useMbCompare");
    const { result } = renderHook(() => useMbCompare());

    act(() => {
      result.current.add({ id: "A1", name: "래미안" });
    });

    expect(result.current.list).toHaveLength(1);
    expect(result.current.isInCompare("A1")).toBe(true);
  });

  /** remove로 항목 제거 */
  it("remove로 비교 목록에서 제거할 수 있다", async () => {
    const { useMbCompare } = await import("../useMbCompare");
    const { result } = renderHook(() => useMbCompare());

    act(() => { result.current.add({ id: "A1", name: "래미안" }); });
    act(() => { result.current.remove("A1"); });

    expect(result.current.list).toHaveLength(0);
  });

  /** toggle: 추가 + 제거 */
  it("toggle로 추가/제거를 반복할 수 있다", async () => {
    const { useMbCompare } = await import("../useMbCompare");
    const { result } = renderHook(() => useMbCompare());

    act(() => { result.current.toggle({ id: "A1", name: "래미안" }); });
    expect(result.current.isInCompare("A1")).toBe(true);

    act(() => { result.current.toggle({ id: "A1", name: "래미안" }); });
    expect(result.current.isInCompare("A1")).toBe(false);
  });

  /** MAX_COMPARE=4 제약 */
  it("최대 4개까지만 추가할 수 있다", async () => {
    const { useMbCompare } = await import("../useMbCompare");
    const { result } = renderHook(() => useMbCompare());

    act(() => {
      result.current.add({ id: "A1", name: "1" });
      result.current.add({ id: "A2", name: "2" });
      result.current.add({ id: "A3", name: "3" });
      result.current.add({ id: "A4", name: "4" });
    });

    expect(result.current.isFull).toBe(true);

    let added: boolean | undefined;
    act(() => { added = result.current.add({ id: "A5", name: "5" }); });
    expect(added).toBe(false);
    expect(result.current.list).toHaveLength(4);
  });

  /** 중복 추가 방지 */
  it("같은 ID를 중복 추가하면 false를 반환한다", async () => {
    const { useMbCompare } = await import("../useMbCompare");
    const { result } = renderHook(() => useMbCompare());

    act(() => { result.current.add({ id: "A1", name: "래미안" }); });
    let added: boolean | undefined;
    act(() => { added = result.current.add({ id: "A1", name: "래미안" }); });
    expect(added).toBe(false);
    expect(result.current.list).toHaveLength(1);
  });

  /** clear로 전체 초기화 */
  it("clear로 비교 목록을 비울 수 있다", async () => {
    const { useMbCompare } = await import("../useMbCompare");
    const { result } = renderHook(() => useMbCompare());

    act(() => {
      result.current.add({ id: "A1", name: "1" });
      result.current.add({ id: "A2", name: "2" });
    });
    act(() => { result.current.clear(); });

    expect(result.current.list).toHaveLength(0);
  });

  /** 깨진 JSON 방어 */
  it("localStorage에 유효하지 않은 JSON이 있으면 빈 배열을 반환한다", async () => {
    localStorage.setItem("mb_compare", "broken");
    const { useMbCompare } = await import("../useMbCompare");
    const { result } = renderHook(() => useMbCompare());
    expect(result.current.list).toEqual([]);
  });
});
